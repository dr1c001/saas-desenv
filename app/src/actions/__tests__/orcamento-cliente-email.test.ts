import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O orçamento com cliente cadastrado, e o envio por e-mail.
//
// ─── O que se prova aqui ─────────────────────────────────────────────────────
//
// "para fazer o orçamento, precisa cadastrar o cliente na aba cliente para
//  depois fazer o orçamento com os dados do cliente, e também poder enviar
//  direto para o email do cliente cadastrado."
//
// Duas metades: a exigência (que é uma trava, e trava mal feita quebra o que já
// existe) e o envio (que sai em nome da empresa para um terceiro).

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockSendQuote = vi.fn()
const mockSendOs = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    filtroDeFilialAtual: vi.fn().mockResolvedValue({}),
    checarAcao: vi.fn().mockResolvedValue(null),
    getAcoesPermitidas: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    temFuncao: vi.fn().mockResolvedValue(true),
    requireCotaDeOs: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  // O redirect do Next lança para interromper o render. Aqui ele vira no-op:
  // o que se testa é o que ficou GRAVADO, e não para onde a tela foi.
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string) => chave,
  }))
  // O envio é simulado. O mock devolve o que a função real devolve (nada) e
  // registra os argumentos — é neles que está o que importa: para quem foi.
  vi.doMock("@/lib/resend", () => ({
    sendQuoteEmail: mockSendQuote,
    sendOsEmail: mockSendOs,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  mockSendQuote.mockReset().mockResolvedValue(undefined)
  mockSendOs.mockReset().mockResolvedValue(undefined)
})

const acoes = () => import("@/actions/quotes")

async function cenario(opts: { emailDoCliente?: string | null } = {}) {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const dono = await testDb.db.user.create({
    data: { id: "u-dono", tenantId: tenant.id, name: "Adriel", email: "dono@polar.com", role: "OWNER" },
  })
  const cliente = await testDb.db.client.create({
    data: {
      tenantId: tenant.id,
      name: "Auto Posto Rodovia",
      email: opts.emailDoCliente === undefined ? "posto@exemplo.com" : opts.emailDoCliente,
      phone: "11999998888",
    },
  })
  mockGetTenant.mockResolvedValue({
    tenantId: tenant.id,
    userId: dono.id,
    role: "OWNER",
    branchId: null,
  })
  return { tenant, dono, cliente }
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

const base = { description: "Troca de compressor", amount: "1.200,00" }

describe("o orçamento exige um cliente cadastrado", () => {
  it("sem cliente escolhido, não cria", async () => {
    // A metade central do pedido. Antes, clientName era texto livre de dois
    // caracteres.
    const { tenant } = await cenario()
    const { createQuote } = await acoes()

    const r = await createQuote({}, form(base))

    expect(r.errors?.clientId).toBeTruthy()
    expect(await testDb.db.quote.count({ where: { tenantId: tenant.id } })).toBe(0)
  })

  it("com cliente escolhido, copia os dados dele", async () => {
    // "fazer o orçamento COM OS DADOS DO CLIENTE".
    const { tenant, cliente } = await cenario()
    const { createQuote } = await acoes()

    await createQuote({}, form({ ...base, clientId: cliente.id }))

    const q = await testDb.db.quote.findFirst({ where: { tenantId: tenant.id } })
    expect(q?.clientId).toBe(cliente.id)
    expect(q?.clientName).toBe("Auto Posto Rodovia")
    expect(q?.clientContact).toBe("11999998888")
  })

  it("cliente de OUTRA empresa não serve", async () => {
    // A Action é endereço HTTP: o <select> não é a única forma de chegar aqui.
    // Sem esta checagem, um id de fora emitiria orçamento com os dados de
    // outra base.
    const { tenant } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const alheio = await testDb.db.client.create({
      data: { tenantId: outra.id, name: "Cliente alheio", email: "x@y.com" },
    })
    const { createQuote } = await acoes()

    const r = await createQuote({}, form({ ...base, clientId: alheio.id }))

    expect(r.errors?.clientId).toBeTruthy()
    expect(await testDb.db.quote.count({ where: { tenantId: tenant.id } })).toBe(0)
  })

  it("o nome fica CONGELADO — trocar o cadastro não reescreve o documento", async () => {
    // O orçamento é um papel que saiu da empresa. Mudar o endereço do cliente
    // em novembro não pode reescrever o que foi enviado em setembro.
    const { tenant, cliente } = await cenario()
    const { createQuote } = await acoes()
    await createQuote({}, form({ ...base, clientId: cliente.id }))

    await testDb.db.client.update({
      where: { id: cliente.id },
      data: { name: "Auto Posto Rodovia LTDA — nome novo" },
    })

    const q = await testDb.db.quote.findFirst({ where: { tenantId: tenant.id } })
    expect(q?.clientName).toBe("Auto Posto Rodovia")
  })

  it("apagar o cliente não apaga o orçamento", async () => {
    // SetNull, e não Cascade: o orçamento foi enviado a alguém e continua
    // sendo o registro daquela proposta.
    const { tenant, cliente } = await cenario()
    const { createQuote } = await acoes()
    await createQuote({}, form({ ...base, clientId: cliente.id }))

    await testDb.db.client.delete({ where: { id: cliente.id } })

    const q = await testDb.db.quote.findFirst({ where: { tenantId: tenant.id } })
    expect(q).not.toBeNull()
    expect(q?.clientId).toBeNull()
    // E o retrato sobrevive: dá para saber para quem era.
    expect(q?.clientName).toBe("Auto Posto Rodovia")
  })

  it("a lista de escolha traz só os clientes ATIVOS desta empresa", async () => {
    const { tenant, cliente } = await cenario()
    await testDb.db.client.create({
      data: { tenantId: tenant.id, name: "Arquivado", status: "INACTIVE" },
    })
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    await testDb.db.client.create({ data: { tenantId: outra.id, name: "Alheio" } })
    const { clientesParaOrcamento } = await acoes()

    const lista = await clientesParaOrcamento()

    expect(lista.map((c) => c.id)).toEqual([cliente.id])
  })
})

describe("enviar o orçamento por e-mail", () => {
  async function comOrcamento(opts: { emailDoCliente?: string | null } = {}) {
    const c = await cenario(opts)
    const { createQuote } = await acoes()
    await createQuote({}, form({ ...base, clientId: c.cliente.id }))
    const quote = (await testDb.db.quote.findFirst({ where: { tenantId: c.tenant.id } }))!
    return { ...c, quote }
  }

  it("manda para o e-mail do cliente cadastrado e registra o envio", async () => {
    const { quote } = await comOrcamento()
    const { enviarOrcamentoPorEmail } = await acoes()

    const r = await enviarOrcamentoPorEmail(quote.id)

    expect(r.ok).toBe(true)
    expect(mockSendQuote).toHaveBeenCalledTimes(1)
    expect(mockSendQuote.mock.calls[0][0]).toBe("posto@exemplo.com")

    const depois = await testDb.db.quote.findUnique({ where: { id: quote.id } })
    expect(depois?.sentTo).toBe("posto@exemplo.com")
    expect(depois?.sentAt).toBeInstanceOf(Date)
  })

  it("o e-mail leva o LINK público, não um anexo", async () => {
    // Decisão de desenho: a página pública mostra o orçamento inteiro E tem os
    // botões de aprovar e recusar, que é para o que o e-mail existe.
    const { quote } = await comOrcamento()
    const { enviarOrcamentoPorEmail } = await acoes()

    await enviarOrcamentoPorEmail(quote.id)

    const texto = mockSendQuote.mock.calls[0][3] as string
    expect(texto).toContain(`/q/${quote.clientToken}`)
  })

  it("a RESPOSTA do cliente vai para a empresa, não para o suporte", async () => {
    // Todo e-mail em nome da empresa tinha replyTo fixo no suporte do
    // ServiçoOS. Para aviso automático de status tudo bem — não há o que
    // responder. Para um orçamento, o cliente responde "pode fazer", e essa
    // mensagem precisa chegar em quem vai fazer.
    const { quote } = await comOrcamento()
    const { enviarOrcamentoPorEmail } = await acoes()

    await enviarOrcamentoPorEmail(quote.id)

    expect(mockSendQuote.mock.calls[0][4]).toBe("dono@polar.com")
  })

  it("cliente sem e-mail: recusa com motivo, em vez de sumir", async () => {
    // Cadastrar o cliente não garante e-mail — Client.email é opcional. O
    // aviso automático da OS falha em silêncio nesse caso; aqui a pessoa
    // clicou de propósito e está esperando.
    const { quote } = await comOrcamento({ emailDoCliente: null })
    const { enviarOrcamentoPorEmail } = await acoes()

    const r = await enviarOrcamentoPorEmail(quote.id)

    expect(r.erro).toBe("semEmail")
    expect(mockSendQuote).not.toHaveBeenCalled()
  })

  it("clique duplo manda UM e-mail", async () => {
    const { quote } = await comOrcamento()
    const { enviarOrcamentoPorEmail } = await acoes()

    await enviarOrcamentoPorEmail(quote.id)
    const segundo = await enviarOrcamentoPorEmail(quote.id)

    expect(segundo.erro).toBe("enviadoAgoraMesmo")
    expect(mockSendQuote).toHaveBeenCalledTimes(1)
  })

  it("falha do provedor NÃO marca como enviado", async () => {
    // Marcar "enviado" um e-mail que não saiu faria a tela mentir para quem
    // está esperando o cliente responder.
    const { quote } = await comOrcamento()
    mockSendQuote.mockRejectedValueOnce(new Error("Resend: domain not verified"))
    const { enviarOrcamentoPorEmail } = await acoes()

    const r = await enviarOrcamentoPorEmail(quote.id)

    expect(r.erro).toBe("falhaNoEnvio")
    const depois = await testDb.db.quote.findUnique({ where: { id: quote.id } })
    expect(depois?.sentAt).toBeNull()
  })

  it("enviar tira o orçamento de RASCUNHO", async () => {
    // A lista do dono mostrava "rascunho" para algo que o cliente já tinha na
    // mão.
    const { quote } = await comOrcamento()
    expect(quote.status).toBe("DRAFT")
    const { enviarOrcamentoPorEmail } = await acoes()

    await enviarOrcamentoPorEmail(quote.id)

    expect((await testDb.db.quote.findUnique({ where: { id: quote.id } }))?.status).toBe("SENT")
  })

  it("orçamento de outra empresa não é enviado", async () => {
    const { quote } = await comOrcamento()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    mockGetTenant.mockResolvedValue({
      tenantId: outra.id,
      userId: "x",
      role: "OWNER",
      branchId: null,
    })
    const { enviarOrcamentoPorEmail } = await acoes()

    const r = await enviarOrcamentoPorEmail(quote.id)

    expect(r.erro).toBe("naoEncontrado")
    expect(mockSendQuote).not.toHaveBeenCalled()
  })

  it("técnico não manda documento comercial em nome da empresa", async () => {
    const { quote, tenant } = await comOrcamento()
    mockGetTenant.mockResolvedValue({
      tenantId: tenant.id,
      userId: "u-tec",
      role: "TECHNICIAN",
      branchId: null,
    })
    const { enviarOrcamentoPorEmail } = await acoes()

    const r = await enviarOrcamentoPorEmail(quote.id)

    expect(r.erro).toBe("semPermissao")
    expect(mockSendQuote).not.toHaveBeenCalled()
  })
})

describe("enviar a OS assinada por e-mail", () => {
  async function comOs(opts: { assinada?: boolean; status?: "DONE" | "IN_PROGRESS" | "INVOICED" } = {}) {
    const c = await cenario()
    const os = await testDb.db.serviceOrder.create({
      data: {
        tenantId: c.tenant.id,
        number: 42,
        title: "Troca de compressor",
        clientId: c.cliente.id,
        status: opts.status ?? "DONE",
        totalAmount: 1200,
        clientToken: "tok-os",
        clientSignatureUrl: opts.assinada === false ? null : "data:image/png;base64,AAA",
      },
    })
    return { ...c, os }
  }

  it("concluída e assinada, vai", async () => {
    const { os } = await comOs()
    const { enviarOsPorEmail } = await import("@/actions/service-orders")

    const r = await enviarOsPorEmail(os.id)

    expect(r.ok).toBe(true)
    expect(mockSendOs.mock.calls[0][0]).toBe("posto@exemplo.com")
    const texto = mockSendOs.mock.calls[0][3] as string
    expect(texto).toContain("/p/tok-os")
  })

  it("sem assinatura, NÃO vai", async () => {
    // "quando estiver completa E ASSINADA" é condição do pedido.
    const { os } = await comOs({ assinada: false })
    const { enviarOsPorEmail } = await import("@/actions/service-orders")

    const r = await enviarOsPorEmail(os.id)

    expect(r.erro).toBe("naoAssinada")
    expect(mockSendOs).not.toHaveBeenCalled()
  })

  it("assinada mas ainda em andamento, NÃO vai", async () => {
    // A rota de assinatura não exige status DONE — dá para assinar antes.
    const { os } = await comOs({ status: "IN_PROGRESS" })
    const { enviarOsPorEmail } = await import("@/actions/service-orders")

    expect((await enviarOsPorEmail(os.id)).erro).toBe("naoAssinada")
  })

  it("registra para quem foi", async () => {
    const { os } = await comOs()
    const { enviarOsPorEmail } = await import("@/actions/service-orders")

    await enviarOsPorEmail(os.id)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.sentTo).toBe("posto@exemplo.com")
    expect(depois?.sentAt).toBeInstanceOf(Date)
  })
})
