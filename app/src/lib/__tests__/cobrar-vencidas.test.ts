import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { REGUA_PADRAO } from "@/lib/regua-cobranca"

// A REGRA da régua está em regua-cobranca.test.ts, e é pura. O que se prova
// AQUI é o resto — que é onde mora o risco de verdade:
//
//   1. a CONSULTA traz as contas certas (e, principalmente, não traz as pagas);
//   2. a cobrança vai para QUEM PAGA, e não para quem recebeu o serviço;
//   3. o CONTADOR anda no banco, que é o que torna o cron idempotente.
//
// Nada disso um teste de módulo puro alcança: são a forma do `where`, o
// caminho da relação e a escrita.

let testDb: TestDatabase
const mockWhats = vi.fn()
const mockEmail = vi.fn()
const mockFatura = vi.fn()
const mockNota = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/whatsapp", () => ({ sendWhatsApp: mockWhats }))
  vi.doMock("@/lib/resend", () => ({ sendDunningEmail: mockEmail }))
  // Os anexos: o PDF de verdade e testado em lib/__tests__/fatura.test.ts.
  // Aqui o que importa e QUANDO eles sao montados e anexados.
  vi.doMock("@/lib/fatura", () => ({
    gerarFatura: mockFatura,
    baixarNotaFiscal: mockNota,
  }))
  // A régua não pode depender de sessão: o cron roda sem usuário nenhum.
  vi.doMock("@/lib/auth", () => ({ hasActiveSubscription: async () => true }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockWhats.mockReset().mockResolvedValue(true)
  // O mock devolve o que a função real devolve (nada): lib/resend.ts send()
  // não tem return — o sucesso é a ausência de throw. Com `true` aqui o teste
  // "sem WhatsApp configurado, o e-mail ainda sai" passava com o defeito no
  // lugar: a função real nunca devolve true, e o cron contava 0.
  // (Achado na auditoria de 13/09/2026.)
  mockEmail.mockReset().mockResolvedValue(undefined)
  mockFatura
    .mockReset()
    .mockResolvedValue({ buffer: Buffer.alloc(2048), nomeArquivo: "fatura-OS20260042.pdf", numero: "OS20260042" })
  mockNota.mockReset().mockResolvedValue(Buffer.alloc(4096))
})

/** Importa depois dos mocks — doMock não é içado. */
const rodar = async (agora: Date, orcamentoMs?: number, agoraMs?: () => number) => {
  const { cobrarVencidas } = await import("@/lib/cobrar-vencidas")
  return cobrarVencidas(agora, orcamentoMs, agoraMs)
}

const HOJE = new Date("2026-09-10T12:00:00Z")
/** Dias antes de HOJE. Negativo = vence no futuro. */
const vencimento = (diasAtras: number) =>
  new Date(HOJE.getTime() - diasAtras * 86_400_000)

async function empresaComRegua(config: object = { ...REGUA_PADRAO, ativo: true }) {
  const t = await testDb.db.tenant.create({
    data: {
      name: "Desentupidora Silva",
      dunningConfig: config,
      subscriptionStatus: "ACTIVE",
      zapiInstance: "inst",
      zapiToken: "tok",
    },
  })
  // O DONO. E o e-mail dele que recebe a resposta do cliente a cobranca —
  // "ja paguei, segue o comprovante" precisa chegar em quem da a baixa.
  // Empresa sem dono e dado quebrado, e a fixture nao devia inventar isso.
  await testDb.db.user.create({
    data: { id: `dono-${t.id}`, tenantId: t.id, name: "Silva", email: "silva@ex.com", role: "OWNER" },
  })
  return t
}

async function contaDe(
  tenantId: string,
  opcoes: {
    /** Quando a conta foi lancada. Por padrao, na data do vencimento. */
    criadaEm?: Date
    /** Reaproveita um cliente ja criado, para as contas cairem no mesmo pagador. */
    clienteExistente?: string
    /** O PDF da nota fiscal e o que a prefeitura respondeu. */
    nfseUrl?: string | null
    nfseStatus?: string | null
    diasAtras: number
    status?: "PENDING" | "PAID" | "OVERDUE"
    paidAt?: Date | null
    amount?: number
    remindersSent?: number
    clienteEmail?: string | null
    parentId?: string | null
    payerId?: string | null
    semOs?: boolean
  }
) {
  const cliente = opcoes.clienteExistente
    ? (await testDb.db.client.findUnique({ where: { id: opcoes.clienteExistente } }))!
    : await testDb.db.client.create({
        data: {
          tenantId,
          name: "Condomínio Aurora",
          email: opcoes.clienteEmail === undefined ? "aurora@ex.com" : opcoes.clienteEmail,
          whatsapp: "11988887777",
          parentId: opcoes.parentId ?? null,
        },
      })

  let orderId: string | null = null
  if (!opcoes.semOs) {
    const os = await testDb.db.serviceOrder.create({
      data: {
        tenantId,
        clientId: cliente.id,
        number: Math.floor(Math.random() * 100000),
        title: "Desentupimento",
        payerId: opcoes.payerId ?? null,
        nfseUrl: opcoes.nfseUrl ?? null,
        nfseStatus: opcoes.nfseStatus ?? null,
      },
    })
    orderId = os.id
  }

  const receita = await testDb.db.revenue.create({
    data: {
      tenantId,
      orderId,
      description: "Desentupimento",
      amount: opcoes.amount ?? 500,
      dueDate: vencimento(opcoes.diasAtras),
      status: opcoes.status ?? "PENDING",
      paidAt: opcoes.paidAt ?? null,
      remindersSent: opcoes.remindersSent ?? 0,
      // A conta EXISTE desde o vencimento, e nao desde agora.
      //
      // E o que acontece em producao: faturar uma OS grava a receita com
      // vencimento de hoje, entao uma conta vencida ha sete dias tem sete dias
      // de idade. Sem isto a fixture criaria uma conta impossivel — nascida
      // agora, ja vencida ha uma semana — e a regua a trataria como o caso
      // novo que ela virou: "nao esta mais atrasada do que existe".
      createdAt: opcoes.criadaEm ?? vencimento(opcoes.diasAtras),
    },
  })
  return { cliente, receita }
}

const releu = (id: string) => testDb.db.revenue.findUnique({ where: { id } })

describe("a consulta", () => {
  it("cobra uma conta vencida e marca o contador", async () => {
    const empresa = await empresaComRegua()
    const { receita } = await contaDe(empresa.id, { diasAtras: 7 })

    const r = await rodar(HOJE)

    expect(r).toEqual({ enviadas: 1, erros: 0 })
    expect(mockWhats).toHaveBeenCalledTimes(1)
    expect((await releu(receita.id))!.remindersSent).toBe(3) // -3, 1 e 7 já passaram
  })

  it("NUNCA cobra uma conta paga", async () => {
    // O pior defeito possível deste recurso. Dois guardas: o `where` da
    // consulta e o `paga` da regra — este teste prova o primeiro.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 30, status: "PAID", paidAt: new Date() })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(0)
    expect(mockWhats).not.toHaveBeenCalled()
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it("não cobra conta que ainda está longe de vencer", async () => {
    // Vence daqui a 20 dias: nenhum degrau chegou, nem o lembrete de -3.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: -20 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("manda o LEMBRETE antes de vencer", async () => {
    // A metade do recurso que previne o atraso em vez de correr atrás dele —
    // e a que a janela da consulta erraria se `limiteDaJanela` somasse em vez
    // de subtrair o degrau negativo.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: -3 })

    expect((await rodar(HOJE)).enviadas).toBe(1)
    const texto = mockWhats.mock.calls[0][3] as string
    expect(texto).toContain("vence em")
  })

  it("ignora empresa que não ligou a régua", async () => {
    const empresa = await empresaComRegua(REGUA_PADRAO) // ativo: false
    await contaDe(empresa.id, { diasAtras: 30 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("ignora empresa que nunca configurou nada", async () => {
    const empresa = await testDb.db.tenant.create({
      data: { name: "Sem régua", subscriptionStatus: "ACTIVE" },
    })
    await contaDe(empresa.id, { diasAtras: 30 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("não cobra em nome de quem cancelou a assinatura", async () => {
    const empresa = await testDb.db.tenant.create({
      data: {
        name: "Saiu",
        dunningConfig: { ...REGUA_PADRAO, ativo: true },
        subscriptionStatus: "CANCELLED",
      },
    })
    await contaDe(empresa.id, { diasAtras: 30 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("receita lançada à mão, sem OS, não tem a quem cobrar", async () => {
    // Revenue não tem cliente próprio — ele vem da OS. Sem OS não há
    // destinatário, e o certo é passar em silêncio, não quebrar.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7, semOs: true })

    const r = await rodar(HOJE)
    expect(r).toEqual({ enviadas: 0, erros: 0 })
  })
})

describe("quem recebe a cobrança", () => {
  it("é o CONTRATANTE quando o cliente é subcliente", async () => {
    // A razão de lib/subcliente.ts existir: a administradora contrata, o
    // condomínio recebe o serviço. Cobrar o condomínio é cobrar quem não deve
    // — constrange o cliente final e não chega em quem tem a fatura.
    const empresa = await empresaComRegua()
    const administradora = await testDb.db.client.create({
      data: {
        tenantId: empresa.id,
        name: "Administradora Central",
        email: "financeiro@central.com",
        whatsapp: "11955554444",
      },
    })
    await contaDe(empresa.id, { diasAtras: 7, parentId: administradora.id })

    await rodar(HOJE)

    expect(mockWhats).toHaveBeenCalledTimes(1)
    // Argumento 3 do sendWhatsApp é o telefone.
    expect(mockWhats.mock.calls[0][2]).toBe("11955554444")
    expect(mockEmail.mock.calls[0][0]).toBe("financeiro@central.com")
  })

  it("é o próprio cliente quando a OS diz que ele paga", async () => {
    // O caso do serviço extra: a administradora paga quase tudo, mas este o
    // condomínio pagou direto. A escolha está gravada na OS e manda.
    const empresa = await empresaComRegua()
    const administradora = await testDb.db.client.create({
      data: { tenantId: empresa.id, name: "Administradora", whatsapp: "11955554444" },
    })
    const cliente = await testDb.db.client.create({
      data: {
        tenantId: empresa.id,
        name: "Condomínio",
        whatsapp: "11988887777",
        parentId: administradora.id,
      },
    })
    const os = await testDb.db.serviceOrder.create({
      data: {
        tenantId: empresa.id,
        clientId: cliente.id,
        number: 7,
        title: "Extra",
        payerId: cliente.id,
      },
    })
    await testDb.db.revenue.create({
      data: {
        tenantId: empresa.id,
        orderId: os.id,
        description: "Extra",
        amount: 300,
        dueDate: vencimento(7),
        // `createdAt` junto com o vencimento, e não o `now()` do banco.
        //
        // Sem isto a conta nascia HOJE DE VERDADE e vencia em 10/09/2026, a
        // data fixa do teste. O teto por idade da régua (`idadeEmDias`, que
        // existe para uma OS antiga parcelada não ser cobrada já no tom de 30
        // dias) via uma conta com idade NEGATIVA e não mandava nada.
        //
        // O teste passou verde enquanto o relógio real esteve antes de
        // 10/09/2026 e começou a falhar sozinho quando o calendário passou —
        // sem ninguém ter mexido no código. É o mesmo defeito que já havia sido
        // corrigido no ajudante `contaDe`; este caso monta a receita à mão e
        // ficou de fora. (Achado em 14/09/2026.)
        createdAt: vencimento(7),
      },
    })

    await rodar(HOJE)

    expect(mockWhats.mock.calls[0][2]).toBe("11988887777")
  })
})

describe("o contador no banco", () => {
  it("rodar duas vezes no mesmo dia manda uma mensagem só", async () => {
    // A idempotência que faz o cron poder ser reexecutado à mão sem
    // constranger ninguém.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7 })

    await rodar(HOJE)
    await rodar(HOJE)

    expect(mockWhats).toHaveBeenCalledTimes(1)
  })

  it("anda um degrau por dia, e para no fim", async () => {
    const empresa = await empresaComRegua()
    const { receita } = await contaDe(empresa.id, { diasAtras: -5 })

    // Do 5º dia antes de vencer até 40 dias depois, um "dia" de cron por vez.
    for (let dia = -5; dia <= 40; dia++) {
      await rodar(new Date(HOJE.getTime() + (dia + 5) * 86_400_000))
    }

    // Cinco degraus, cinco mensagens — nunca mais que isso.
    expect(mockWhats).toHaveBeenCalledTimes(5)
    expect((await releu(receita.id))!.remindersSent).toBe(5)
  })

  it("o contador avança mesmo no degrau que a empresa desligou", async () => {
    // Com `lembrarAntes` desligado, o degrau -3 passa em silêncio mas PRECISA
    // ser contado. Se não fosse, a régua andaria deslocada e a mensagem do
    // dia seguinte ao vencimento sairia com o tom de lembrete.
    const empresa = await empresaComRegua({
      ...REGUA_PADRAO,
      ativo: true,
      lembrarAntes: false,
    })
    const { receita } = await contaDe(empresa.id, { diasAtras: -3 })

    await rodar(HOJE)

    expect(mockWhats).not.toHaveBeenCalled()
    expect((await releu(receita.id))!.remindersSent).toBe(1)
  })

  it("uma carteira antiga recebe UMA mensagem por conta, não a escada inteira", async () => {
    // O dia em que a empresa liga a régua: cinco contas vencidas há meses,
    // contador em zero. Se a régua disparasse todos os degraus vencidos, cada
    // cliente receberia cinco mensagens no mesmo minuto.
    const empresa = await empresaComRegua()
    for (let i = 0; i < 5; i++) await contaDe(empresa.id, { diasAtras: 60 + i })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(5)
    expect(mockWhats).toHaveBeenCalledTimes(5)
  })
})

describe("os canais", () => {
  it("sem WhatsApp configurado, o e-mail ainda sai", async () => {
    const empresa = await testDb.db.tenant.create({
      data: {
        name: "Sem Zapi",
        dunningConfig: { ...REGUA_PADRAO, ativo: true },
        subscriptionStatus: "ACTIVE",
      },
    })
    await contaDe(empresa.id, { diasAtras: 7 })

    expect((await rodar(HOJE)).enviadas).toBe(1)
    expect(mockWhats).not.toHaveBeenCalled()
    expect(mockEmail).toHaveBeenCalledTimes(1)
  })

  it("cobrança que sai SÓ por e-mail é CONTADA — e a que o Resend recusa, não", async () => {
    // O e-mail resolve nada quando sai e lança quando falha (lib/resend.ts,
    // send). `mandar` lia o canal como se fosse o WhatsApp — Boolean(undefined)
    // — e uma empresa sem Z-API, o caso comum, cobrava 40 clientes e gravava
    // "cobrancas 0" na execução; o teto de MAX_POR_EXECUCAO nunca disparava
    // para ela. (Achado na auditoria de 13/09/2026.)
    const empresa = await testDb.db.tenant.create({
      data: { name: "Sem Zapi", dunningConfig: { ...REGUA_PADRAO, ativo: true }, subscriptionStatus: "ACTIVE" },
    })
    await contaDe(empresa.id, { diasAtras: 7 })
    await contaDe(empresa.id, { diasAtras: 7 })
    await contaDe(empresa.id, { diasAtras: 7 })
    // Um dos três o Resend recusa (destinatário inválido, domínio não
    // verificado): a função real LANÇA nesse caso, e a recusa não pode contar.
    mockEmail
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Resend: invalid recipient"))

    const r = await rodar(HOJE)

    expect(mockEmail).toHaveBeenCalledTimes(3)
    expect(mockWhats).not.toHaveBeenCalled()
    expect(r.enviadas).toBe(2)
  })

  it("o ASSUNTO do e-mail traz o nome da empresa — e não o caminho da chave", async () => {
    // As quatro chaves `reguaCobranca.assunto.*` têm `{empresa}` (pt e en), e o
    // regua-textos.test.ts até afirma que "o assunto recebe só {empresa}" — mas
    // ninguém passava o parâmetro. O next-intl, sem `{ empresa }`, registra
    // FORMATTING_ERROR e devolve o CAMINHO DA CHAVE: o cliente final recebia
    // "Desentupidora Silva — whatsapp.reguaCobranca.assunto.insistente" na
    // caixa de entrada. (Achado ao provar o defeito acima, 15/09/2026.)
    const empresa = await testDb.db.tenant.create({
      data: { name: "Desentupidora Silva", dunningConfig: { ...REGUA_PADRAO, ativo: true }, subscriptionStatus: "ACTIVE" },
    })
    await contaDe(empresa.id, { diasAtras: 7 })

    await rodar(HOJE)

    const assunto = String(mockEmail.mock.calls[0][2])
    expect(assunto).toContain("Desentupidora Silva")
    expect(assunto).not.toContain("reguaCobranca")
    expect(assunto).not.toContain("{empresa}")
  })

  it("cliente sem e-mail e sem telefone não gera erro", async () => {
    const empresa = await empresaComRegua()
    const cliente = await testDb.db.client.create({
      data: { tenantId: empresa.id, name: "Sem contato", email: null, whatsapp: null },
    })
    const os = await testDb.db.serviceOrder.create({
      data: { tenantId: empresa.id, clientId: cliente.id, number: 9, title: "X" },
    })
    await testDb.db.revenue.create({
      data: {
        tenantId: empresa.id,
        orderId: os.id,
        description: "X",
        amount: 200,
        dueDate: vencimento(7),
        // Mesmo motivo do caso acima — e aqui o estrago era pior: sem
        // `createdAt`, o teto por idade barrava o envio ANTES de o código
        // chegar na falta de contato, e o teste passava pelo motivo errado.
        // Ele continuaria verde com o tratamento de "cliente sem contato"
        // completamente quebrado, que é justamente o que ele existe para provar.
        createdAt: vencimento(7),
      },
    })

    expect(await rodar(HOJE)).toEqual({ enviadas: 0, erros: 0 })
  })

  it("valor abaixo do mínimo da empresa não vira mensagem", async () => {
    const empresa = await empresaComRegua({ ...REGUA_PADRAO, ativo: true, valorMinimo: 100 })
    await contaDe(empresa.id, { diasAtras: 7, amount: 40 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })
})

describe("a trava de plano, no cron", () => {
  // O furo que uma trava só na tela de salvar deixaria aberto: a empresa liga
  // a régua no Pro e depois desce para o Starter. A configuração continua
  // gravada com `ativo: true`, e sem checagem no cron ele seguiria cobrando
  // para sempre — entregando de graça justamente o recurso que motivou o
  // upgrade, para quem desistiu dele.

  async function empresaNoPlano(slug: string) {
    const plano = await testDb.db.plan.upsert({
      where: { slug },
      update: {},
      create: { slug, name: slug, priceMonthly: 0, priceYearly: 0, maxUsers: 3, features: [] },
    })
    return testDb.db.tenant.create({
      data: {
        name: `Empresa ${slug}`,
        planId: plano.id,
        dunningConfig: { ...REGUA_PADRAO, ativo: true },
        subscriptionStatus: "ACTIVE",
        zapiInstance: "inst",
        zapiToken: "tok",
      },
    })
  }

  it("o Starter NÃO cobra, mesmo com a régua ligada e gravada", async () => {
    const empresa = await empresaNoPlano("starter")
    const { receita } = await contaDe(empresa.id, { diasAtras: 7 })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(0)
    expect(mockWhats).not.toHaveBeenCalled()
    // E o contador NÃO anda: se andasse, subir para o Pro depois entregaria
    // uma conta com degraus já gastos e o cliente nunca receberia o aviso.
    expect((await releu(receita.id))!.remindersSent).toBe(0)
  })

  it("o Pro cobra", async () => {
    const empresa = await empresaNoPlano("pro")
    await contaDe(empresa.id, { diasAtras: 7 })

    expect((await rodar(HOJE)).enviadas).toBe(1)
  })

  it("o Enterprise cobra", async () => {
    const empresa = await empresaNoPlano("enterprise")
    await contaDe(empresa.id, { diasAtras: 7 })

    expect((await rodar(HOJE)).enviadas).toBe(1)
  })

  it("concessão individual no painel do admin libera o Starter", async () => {
    // O que o dono pediu: poder liberar para um cliente específico sem mudar o
    // plano dele. `extraFeatures` soma por cima — é o mesmo mecanismo do
    // adicional, e precisa valer aqui também.
    const empresa = await empresaNoPlano("starter")
    await testDb.db.tenant.update({
      where: { id: empresa.id },
      data: { extraFeatures: ["reguaCobranca"] },
    })
    await contaDe(empresa.id, { diasAtras: 7 })

    expect((await rodar(HOJE)).enviadas).toBe(1)
  })
})

describe("uma empresa não cobra pela outra", () => {
  it("a régua de uma não alcança as contas da outra", async () => {
    // Isolamento entre tenants no caminho novo. A consulta filtra por
    // tenantId; um esquecimento aqui mandaria a empresa A cobrar o cliente
    // da empresa B, em nome de A.
    const a = await empresaComRegua()
    const b = await testDb.db.tenant.create({
      data: { name: "Outra", subscriptionStatus: "ACTIVE" }, // sem régua
    })
    await contaDe(a.id, { diasAtras: 7 })
    const daOutra = await contaDe(b.id, { diasAtras: 7 })

    await rodar(HOJE)

    expect(mockWhats).toHaveBeenCalledTimes(1)
    expect((await releu(daOutra.receita.id))!.remindersSent).toBe(0)
  })
})

describe("três parcelas vencidas viram UMA mensagem", () => {
  // "a empresa fez um serviço, parcelou, o cliente não pagou." Um 3x todo
  // vencido disparava três mensagens quase idênticas no mesmo minuto para o
  // mesmo WhatsApp — e a coincidência é a regra, não a exceção: os prazos que a
  // tela de parcelamento sugere (7, 15, 30) batem com os degraus (1, 7, 15, 30).
  //
  // Três mensagens seguidas não cobram melhor: fazem o cliente silenciar o
  // número, e podem derrubar a conta de WhatsApp da empresa.

  it("uma mensagem só, listando as parcelas e o total", async () => {
    const empresa = await empresaComRegua()
    const { cliente } = await contaDe(empresa.id, { diasAtras: 30, amount: 500 })
    await contaDe(empresa.id, { diasAtras: 23, amount: 500, clienteExistente: cliente.id })
    await contaDe(empresa.id, { diasAtras: 16, amount: 500, clienteExistente: cliente.id })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(1)
    expect(mockWhats).toHaveBeenCalledTimes(1)
    const texto = mockWhats.mock.calls[0][3] as string
    // O total é o número que faz o cliente resolver — três mensagens de R$ 500
    // escondem que a dívida é de R$ 1.500.
    expect(texto).toContain("1.500")
  })

  it("mas o contador anda em TODAS as parcelas do grupo", async () => {
    // Senão a segunda rodada acharia que as outras duas nunca foram cobradas.
    const empresa = await empresaComRegua()
    const { cliente, receita } = await contaDe(empresa.id, { diasAtras: 30 })
    const outra = await contaDe(empresa.id, { diasAtras: 23, clienteExistente: cliente.id })

    await rodar(HOJE)

    expect((await releu(receita.id))!.remindersSent).toBeGreaterThan(0)
    expect((await releu(outra.receita.id))!.remindersSent).toBeGreaterThan(0)
  })

  it("clientes DIFERENTES continuam recebendo cada um a sua", async () => {
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 30 })
    await contaDe(empresa.id, { diasAtras: 30 })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(2)
  })

  it("a mensagem leva o LINK do portal do cliente", async () => {
    // A linha "Detalhes: <url>" existia no código desde sempre e ninguém
    // passava o campo. O cliente lia "venceu R$ 500" e não tinha onde clicar —
    // é a diferença entre avisar e cobrar.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7 })

    await rodar(HOJE)

    const texto = mockWhats.mock.calls[0][3] as string
    expect(texto).toContain("/p/")
  })
})

describe("os anexos: a fatura e a nota fiscal", () => {
  it("o e-mail leva a FATURA em PDF", async () => {
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7 })

    await rodar(HOJE)

    const anexos = mockEmail.mock.calls[0][5] as { filename: string }[]
    expect(anexos.map((a) => a.filename)).toContain("fatura-OS20260042.pdf")
  })

  it("com nota EMITIDA, ela vai junto", async () => {
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, {
      diasAtras: 7,
      nfseUrl: "https://emissor/nota.pdf",
      nfseStatus: "Issued",
    })

    await rodar(HOJE)

    const anexos = mockEmail.mock.calls[0][5] as { filename: string }[]
    expect(anexos).toHaveLength(2)
    expect(anexos.some((a) => a.filename.startsWith("nota-fiscal-"))).toBe(true)
  })

  it("com nota REJEITADA, ela NÃO vai — nem que a URL exista", async () => {
    // O defeito que isto evita: `nfseUrl` é gravado no envio, antes de a
    // prefeitura responder. Anexar o PDF de uma nota rejeitada seria mandar ao
    // cliente, em nome da empresa, um documento que não vale nada.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, {
      diasAtras: 7,
      nfseUrl: "https://emissor/nota.pdf",
      nfseStatus: "Cancelled",
    })

    await rodar(HOJE)

    expect(mockNota).not.toHaveBeenCalled()
    const anexos = mockEmail.mock.calls[0][5] as { filename: string }[]
    expect(anexos.some((a) => a.filename.startsWith("nota-fiscal-"))).toBe(false)
  })

  it("sem nota nenhuma, só a fatura", async () => {
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7 })

    await rodar(HOJE)

    expect(mockNota).not.toHaveBeenCalled()
    expect((mockEmail.mock.calls[0][5] as unknown[]).length).toBe(1)
  })

  it("se a fatura falhar, a cobrança SAI mesmo assim", async () => {
    // Uma cobrança que não sai é muito pior que uma cobrança sem anexo. E o
    // texto é montado para fazer sentido sem eles.
    mockFatura.mockRejectedValueOnce(new Error("render quebrou"))
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7 })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(1)
    expect(mockEmail).toHaveBeenCalledTimes(1)
    expect((mockEmail.mock.calls[0][5] as unknown[]).length).toBe(0)
  })

  it("se a nota falhar ao baixar, a cobrança sai com a fatura só", async () => {
    mockNota.mockResolvedValueOnce(null)
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, {
      diasAtras: 7,
      nfseUrl: "https://emissor/nota.pdf",
      nfseStatus: "Issued",
    })

    await rodar(HOJE)

    const anexos = mockEmail.mock.calls[0][5] as { filename: string }[]
    expect(anexos).toHaveLength(1)
    expect(anexos[0].filename).toContain("fatura")
  })

  it("a RESPOSTA do cliente vai para a empresa", async () => {
    // Cobrança é a mensagem que mais gera resposta. "Já paguei, segue o
    // comprovante" precisa chegar em quem dá a baixa.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7 })

    await rodar(HOJE)

    expect(mockEmail.mock.calls[0][4]).toBeTruthy()
  })
})

describe("o orçamento de tempo", () => {
  it("esgotado, a régua para antes do próximo grupo — o cron tem 60 s para tudo", async () => {
    // 200 chamadas ao Z-API com 8 s de timeout cada seriam 1600 s. O teto de
    // mensagens não protege disso; o de tempo protege. (Auditoria de 13/09/2026.)
    const empresa = await empresaComRegua()
    // Três pagadores diferentes = três grupos.
    await contaDe(empresa.id, { diasAtras: 7, clienteEmail: "a@ex.com" })
    await contaDe(empresa.id, { diasAtras: 7, clienteEmail: "b@ex.com" })
    await contaDe(empresa.id, { diasAtras: 7, clienteEmail: "c@ex.com" })
    // Relógio FALSO: cada envio "custa" 8 s — o timeout do Z-API. Nada aqui
    // depende de quanto o banco demora, então o resultado é sempre o mesmo.
    // Com o relógio de parede este teste falhava sozinho de vez em quando.
    let relogio = 0
    mockWhats.mockImplementation(async () => {
      relogio += 8_000
      return true
    })

    const r = await rodar(HOJE, 15_000, () => relogio)

    // Primeiro grupo: relógio em 0, passa. Segundo: 8 s < 15 s, passa.
    // Terceiro: 16 s > 15 s, o orçamento corta. É o teto que decide.
    expect(r.enviadas).toBe(2)
    expect(mockWhats).toHaveBeenCalledTimes(2)
  })
})
