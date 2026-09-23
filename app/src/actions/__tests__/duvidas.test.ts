import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O canal de dúvida, de ponta a ponta.
//
// As regras puras estão em duvida.test.ts. O que se prova AQUI é o que envolve
// banco: o RETRATO gravado no momento da pergunta, a conversa sobrevivendo ao
// apagamento da empresa, e as duas guardas que impedem uma empresa de entupir
// o painel.

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockAdmin = vi.fn()
const mockAvisar = vi.fn()
const mockNotificar = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/admin", () => ({ requireSuperAdmin: mockAdmin }))
  // `after` exige um escopo de requisição do Next, que não existe fora do
  // servidor. Aqui ele vira passagem direta: o trabalho que ele adiaria roda
  // igual, e é justamente esse trabalho que os testes conferem.
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  vi.doMock("@/lib/avisar-plataforma", () => ({ avisarPlataforma: mockAvisar }))
  vi.doMock("@/lib/notificar", () => ({ notificar: mockNotificar }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  mockAdmin.mockReset()
  mockAvisar.mockReset().mockResolvedValue(undefined)
  mockNotificar.mockReset().mockResolvedValue(undefined)
  mockAdmin.mockResolvedValue({ email: "dono@ex.com", name: "Adriel", role: "DONO" })
})

const cliente = () => import("@/actions/duvidas")
const painel = () => import("@/actions/admin-duvidas")

async function empresa(opcoes: { plano?: string; situacao?: string } = {}) {
  const plano = opcoes.plano
    ? await testDb.db.plan.create({
        data: { name: opcoes.plano, slug: opcoes.plano.toLowerCase(), priceMonthly: 97, priceYearly: 970 },
      })
    : null
  const t = await testDb.db.tenant.create({
    data: {
      name: "Livela store",
      planId: plano?.id ?? null,
      subscriptionStatus: (opcoes.situacao ?? "ACTIVE") as never,
    },
  })
  const u = await testDb.db.user.create({
    data: { id: "u1", tenantId: t.id, name: "Priscila", email: "p@ex.com", role: "OWNER" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: t.id, userId: u.id, role: "OWNER" })
  return { tenant: t, user: u }
}

const form = (campos: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

describe("abrir a dúvida", () => {
  it("grava o RETRATO do momento da pergunta", async () => {
    // Guardado, e não lido depois: "por que não vejo o mapa?" só faz sentido
    // junto do plano que a empresa TINHA quando perguntou. Um upgrade no dia
    // seguinte faria a pergunta parecer maluca.
    await empresa({ plano: "Starter" })
    const r = await (await cliente()).abrirDuvida({}, form({ texto: "Como emito nota fiscal?" }))
    expect(r.erro).toBeUndefined()

    const d = (await testDb.db.supportThread.findUnique({ where: { id: r.id! } }))!
    expect(d.tenantName).toBe("Livela store")
    expect(d.authorName).toBe("Priscila")
    expect(d.authorRole).toBe("OWNER")
    expect(d.planName).toBe("Starter")
    expect(d.subscriptionStatus).toBe("ACTIVE")
    expect(d.status).toBe("ABERTA")
    expect(d.messageCount).toBe(1)
  })

  it("guarda a TELA pela rota do catálogo, sem o id da OS", async () => {
    // O caminho cru carrega o id de uma OS de um cliente final — ele apareceria
    // no painel do dono da plataforma, que não tem nada a ver com aquela OS.
    await empresa()
    const r = await (await cliente()).abrirDuvida(
      {},
      form({ texto: "Não consigo concluir esta OS", tela: "/service-orders/ckx9f2abc123" })
    )

    const d = (await testDb.db.supportThread.findUnique({ where: { id: r.id! } }))!
    expect(d.screenRoute).toBe("/service-orders")
    expect(d.screenCode).toBe("1.1")
  })

  it("tela inventada não entra no banco", async () => {
    await empresa()
    const r = await (await cliente()).abrirDuvida(
      {},
      form({ texto: "Uma pergunta qualquer", tela: "javascript:alert(1)" })
    )
    const d = (await testDb.db.supportThread.findUnique({ where: { id: r.id! } }))!
    expect(d.screenRoute).toBeNull()
  })

  it("avisa o dono, com a pergunta no corpo", async () => {
    await empresa()
    await (await cliente()).abrirDuvida({}, form({ texto: "Como emito nota fiscal?" }))

    expect(mockAvisar).toHaveBeenCalledOnce()
    const [evento, dados] = mockAvisar.mock.calls[0]
    expect(evento).toBe("duvidaNova")
    expect(dados.pergunta).toBe("Como emito nota fiscal?")
    expect(dados.quem).toBe("Priscila")
    expect(dados.mensagemId).toBeTruthy()
  })

  it("recusa texto vazio, curto e longo demais — dizendo QUAL", async () => {
    await empresa()
    const a = await cliente()
    expect((await a.abrirDuvida({}, form({ texto: "" }))).erro).toBe("vazio")
    expect((await a.abrirDuvida({}, form({ texto: "oi" }))).erro).toBe("curto")
    expect((await a.abrirDuvida({}, form({ texto: "x".repeat(2001) }))).erro).toBe("longo")
    expect(await testDb.db.supportThread.count()).toBe(0)
  })

  it("trava na QUARTA conversa aberta", async () => {
    // Não é economia de banco: é o painel continuar legível. Uma empresa que
    // abre quinze numa tarde afoga as das outras quatro.
    await empresa()
    const a = await cliente()
    for (let i = 0; i < 3; i++) {
      expect((await a.abrirDuvida({}, form({ texto: `Pergunta numero ${i}` }))).erro).toBeUndefined()
    }
    expect((await a.abrirDuvida({}, form({ texto: "A quarta pergunta" }))).erro).toBe("muitasAbertas")
  })

  it("conversa FECHADA libera a vaga", async () => {
    // Quem resolveu abre outra quando precisar.
    await empresa()
    const a = await cliente()
    const primeira = await a.abrirDuvida({}, form({ texto: "Primeira pergunta" }))
    await a.abrirDuvida({}, form({ texto: "Segunda pergunta" }))
    await a.abrirDuvida({}, form({ texto: "Terceira pergunta" }))

    await a.fecharMinhaDuvida(primeira.id!)
    expect((await a.abrirDuvida({}, form({ texto: "Agora cabe mais uma" }))).erro).toBeUndefined()
  })

  it("empresa SEM assinatura ativa pode perguntar", async () => {
    // "Não consigo pagar" e "minha assinatura caiu, e agora?" são exatamente as
    // perguntas de quem está sem assinatura. Trancar o canal de ajuda atrás do
    // pagamento fecha a porta na cara de quem mais precisa falar.
    await empresa({ situacao: "CANCELLED" })
    const r = await (await cliente()).abrirDuvida({}, form({ texto: "Minha assinatura caiu, e agora?" }))
    expect(r.erro).toBeUndefined()
  })
})

describe("responder pelo painel", () => {
  async function comDuvida() {
    const { tenant, user } = await empresa()
    const r = await (await cliente()).abrirDuvida({}, form({ texto: "Como emito nota fiscal?" }))
    return { tenant, user, id: r.id! }
  }

  it("a resposta muda o status e avisa QUEM PERGUNTOU", async () => {
    const { user, id } = await comDuvida()
    const p = await painel()
    const r = await p.responderDuvida(id, {}, form({ texto: "Vá em Configurações, Fiscal." }))
    expect(r.erro).toBeUndefined()

    const d = (await testDb.db.supportThread.findUnique({ where: { id } }))!
    expect(d.status).toBe("RESPONDIDA")
    expect(d.messageCount).toBe(2)
    expect(d.lastMessageFrom).toBe("PLATAFORMA")
    // A resposta é nova para o cliente.
    expect(d.readByClientAt).toBeNull()

    // Vai pelo `notificar` de sempre, mirando o autor — assim herda a
    // preferência de silenciar, o modo sem som e a trava da empresa.
    expect(mockNotificar).toHaveBeenCalledOnce()
    expect(mockNotificar.mock.calls[0][0]).toMatchObject({
      evento: "duvidaRespondida",
      responsavelId: user.id,
    })
  })

  it("guarda QUEM respondeu, como retrato", async () => {
    // A pessoa pode não estar mais na equipe daqui a um ano.
    const { id } = await comDuvida()
    await (await painel()).responderDuvida(id, {}, form({ texto: "Resposta do suporte." }))

    const m = await testDb.db.supportMessage.findFirst({ where: { kind: "PLATAFORMA" } })
    expect(m!.authorName).toBe("Adriel")
    expect(m!.authorEmail).toBe("dono@ex.com")
  })

  it("exige a permissão de ATENDER, e não a de ver o painel", async () => {
    const { id } = await comDuvida()
    mockAdmin.mockRejectedValue(new Error("sem permissão"))
    await expect(
      (await painel()).responderDuvida(id, {}, form({ texto: "Não deveria passar" }))
    ).rejects.toThrow()
    expect(mockAdmin).toHaveBeenCalledWith("atenderDuvida")
  })

  it("o cliente escrevendo REABRE a conversa fechada", async () => {
    // Ele voltou porque não resolveu. Obrigá-lo a abrir outra perderia o
    // contexto do que já foi dito — que é o que ele quer aproveitar.
    const { id } = await comDuvida()
    const c = await cliente()
    await (await painel()).fecharDuvida(id)
    expect((await testDb.db.supportThread.findUnique({ where: { id } }))!.status).toBe("FECHADA")

    await c.responderNaDuvida(id, {}, form({ texto: "Ainda não consegui, me ajuda?" }))

    const d = (await testDb.db.supportThread.findUnique({ where: { id } }))!
    expect(d.status).toBe("ABERTA")
    expect(d.closedAt).toBeNull()
  })

  it("marcar lida some com o aviso de resposta nova", async () => {
    const { id } = await comDuvida()
    await (await painel()).responderDuvida(id, {}, form({ texto: "Resposta." }))
    await (await cliente()).marcarDuvidaLida(id)

    expect((await testDb.db.supportThread.findUnique({ where: { id } }))!.readByClientAt).not.toBeNull()
  })
})

describe("isolamento entre empresas", () => {
  it("uma empresa NÃO vê nem escreve na dúvida da outra", async () => {
    await empresa()
    const minha = await (await cliente()).abrirDuvida({}, form({ texto: "Minha pergunta aqui" }))

    // Outra empresa entra em cena.
    const outroTenant = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const outroUser = await testDb.db.user.create({
      data: { id: "u2", tenantId: outroTenant.id, name: "Alheio", email: "a@ex.com", role: "OWNER" },
    })
    mockGetTenant.mockResolvedValue({
      tenantId: outroTenant.id,
      userId: outroUser.id,
      role: "OWNER",
    })

    const c = await cliente()
    expect(await c.getMinhasDuvidas()).toHaveLength(0)
    expect(
      (await c.responderNaDuvida(minha.id!, {}, form({ texto: "Escrevendo na dos outros" }))).erro
    ).toBe("naoEncontrado")
    expect((await c.fecharMinhaDuvida(minha.id!)).erro).toBe("naoEncontrado")
    expect((await c.marcarDuvidaLida(minha.id!)).erro).toBe("naoEncontrado")
  })
})

describe("a conversa sobrevive à empresa", () => {
  it("apagar a empresa NÃO apaga a dúvida", async () => {
    // A dúvida de quem desistiu é a mais valiosa que existe — é o motivo do
    // abandono, escrito pela própria pessoa. Cascade apagaria justamente ela.
    const { tenant } = await empresa()
    const r = await (await cliente()).abrirDuvida({}, form({ texto: "Como eu assino o plano?" }))

    await testDb.db.user.deleteMany({ where: { tenantId: tenant.id } })
    await testDb.db.tenant.delete({ where: { id: tenant.id } })

    const d = await testDb.db.supportThread.findUnique({
      where: { id: r.id! },
      include: { messages: true },
    })
    expect(d).not.toBeNull()
    // O vínculo some, o RETRATO fica — é a única memória de que ela perguntou.
    expect(d!.tenantId).toBeNull()
    expect(d!.authorId).toBeNull()
    expect(d!.tenantName).toBe("Livela store")
    expect(d!.authorName).toBe("Priscila")
    expect(d!.messages[0].body).toBe("Como eu assino o plano?")
  })

  it("responder a uma conversa órfã não quebra", async () => {
    // Não há a quem avisar, e isso não é erro.
    const { tenant } = await empresa()
    const r = await (await cliente()).abrirDuvida({}, form({ texto: "Como eu assino o plano?" }))
    await testDb.db.user.deleteMany({ where: { tenantId: tenant.id } })
    await testDb.db.tenant.delete({ where: { id: tenant.id } })

    const resp = await (await painel()).responderDuvida(r.id!, {}, form({ texto: "Resposta tardia." }))
    expect(resp.erro).toBeUndefined()
    expect(mockNotificar).not.toHaveBeenCalled()
  })
})

describe("a fila do painel", () => {
  it("quem espera há MAIS TEMPO vem primeiro", async () => {
    // Ordenar pelo mais recente enterraria justamente quem está esperando mais.
    await empresa()
    const c = await cliente()
    const primeira = await c.abrirDuvida({}, form({ texto: "Perguntei primeiro" }))
    await c.abrirDuvida({}, form({ texto: "Perguntei depois" }))

    const fila = await (await painel()).getFilaDeDuvidas()
    expect(fila[0].id).toBe(primeira.id)
  })

  it("fechada some da fila, mas continua achável pelo filtro", async () => {
    await empresa()
    const c = await cliente()
    const r = await c.abrirDuvida({}, form({ texto: "Uma pergunta qualquer" }))
    await c.fecharMinhaDuvida(r.id!)

    const p = await painel()
    expect(await p.getFilaDeDuvidas()).toHaveLength(0)
    expect(await p.getFilaDeDuvidas("FECHADA")).toHaveLength(1)
  })

  it("o contador conta só quem espera resposta", async () => {
    await empresa()
    const c = await cliente()
    const a = await c.abrirDuvida({}, form({ texto: "Primeira pergunta" }))
    await c.abrirDuvida({}, form({ texto: "Segunda pergunta" }))
    await (await painel()).responderDuvida(a.id!, {}, form({ texto: "Respondendo a primeira." }))

    // A respondida está com o cliente, não comigo.
    expect(await (await painel()).contarDuvidasAbertas()).toBe(1)
  })
})
