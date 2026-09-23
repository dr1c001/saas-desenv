import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Entregar o aviso AO DONO DA PLATAFORMA.
//
// Este arquivo existe por causa de uma armadilha específica: a tabela
// PlatformAdmin está VAZIA em produção. O fundador entra no painel pelo
// EMAIL_FUNDADOR, com o papel DONO garantido no código.
//
// O jeito óbvio de escrever "avise os administradores" — ler a tabela — não
// avisaria NINGUÉM, começando pela única pessoa que usa o painel. E passaria
// em qualquer teste que popule a tabela antes de rodar. Por isso o cenário
// padrão daqui é a tabela VAZIA.

let testDb: TestDatabase
const mockEnviar = vi.fn()

const EMAIL = "adrielwellington02@gmail.com"

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/admin", () => ({ EMAIL_FUNDADOR: EMAIL }))
  vi.doMock("@/lib/push", () => ({
    sendPushToUser: mockEnviar,
  }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string) => chave,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockEnviar.mockReset()
  // O mock respeita o CONTRATO do sendPushToUser real: sem inscrição, zero
  // enviadas. Um mock que devolve 1 fixo faz o teste de "ninguém inscrito"
  // passar pelo motivo errado — e é justamente esse caso que distingue "o
  // gatilho não rodou" de "rodou e não chegou".
  mockEnviar.mockImplementation(async (subs: unknown[]) => ({
    enviadas: subs.length,
    removidas: 0,
    falharam: 0,
  }))
})

const lib = () => import("@/lib/avisar-plataforma")

/** O dono, como ele existe de verdade: um User comum, sem linha em PlatformAdmin. */
async function fundador(email = EMAIL) {
  const t = await testDb.db.tenant.create({ data: { name: "Agitec Desentupidora" } })
  const u = await testDb.db.user.create({
    data: { id: "u-dono", tenantId: t.id, name: "Adriel", email, role: "OWNER" },
  })
  await testDb.db.pushSubscription.create({
    data: { userId: u.id, endpoint: "https://fcm.googleapis.com/x", p256dh: "p", auth: "a" },
  })
  return { tenant: t, user: u }
}

/** Os endpoints para os quais o push foi realmente disparado. */
const enviadosPara = () =>
  (mockEnviar.mock.calls[0]?.[0] ?? []).map((s: { endpoint: string }) => s.endpoint)

describe("achar o fundador", () => {
  it("acha com a tabela PlatformAdmin VAZIA", async () => {
    // O caso de produção. Sem isto, nenhum aviso chega a ninguém.
    await fundador()
    expect(await testDb.db.platformAdmin.count()).toBe(0)

    await (await lib()).avisarPlataforma("novaEmpresa", { tenantId: "t-novo", empresa: "Nova" })

    expect(mockEnviar).toHaveBeenCalledOnce()
    expect(enviadosPara()).toEqual(["https://fcm.googleapis.com/x"])
  })

  it("acha mesmo com o e-mail gravado em MAIÚSCULA", async () => {
    // EMAIL_FUNDADOR é normalizado com toLowerCase, mas User.email é gravado
    // CRU no primeiro login, com o que veio do Supabase. Uma letra maiúscula
    // e o dono ficaria sem aviso — sem erro, sem log, sem nada acusando.
    await fundador("AdrielWellington02@Gmail.com")

    await (await lib()).avisarPlataforma("novaEmpresa", { tenantId: "t-novo", empresa: "Nova" })

    expect(enviadosPara()).toHaveLength(1)
  })

  it("sem nenhum aparelho inscrito, não quebra", async () => {
    const t = await testDb.db.tenant.create({ data: { name: "X" } })
    await testDb.db.user.create({
      data: { id: "u1", tenantId: t.id, name: "A", email: EMAIL, role: "OWNER" },
    })

    await (await lib()).avisarPlataforma("novaEmpresa", { tenantId: "t-novo", empresa: "Nova" })

    // A linha fica gravada com delivered 0 — é o que diferencia "o gatilho não
    // rodou" de "rodou e o push não chegou".
    const linha = await testDb.db.platformAlert.findFirst()
    expect(linha!.delivered).toBe(0)
  })
})

describe("quem MAIS recebe", () => {
  it("membro da equipe com a permissão certa entra junto", async () => {
    await fundador()
    const t = await testDb.db.tenant.findFirst()
    const fin = await testDb.db.user.create({
      data: { id: "u-fin", tenantId: t!.id, name: "Fin", email: "fin@ex.com", role: "ADMIN" },
    })
    await testDb.db.pushSubscription.create({
      data: { userId: fin.id, endpoint: "https://fcm.googleapis.com/fin", p256dh: "p", auth: "a" },
    })
    await testDb.db.platformAdmin.create({
      data: { email: "fin@ex.com", name: "Financeiro", role: "FINANCEIRO", active: true },
    })

    await (await lib()).avisarPlataforma("assinaturaEmAtraso", {
      tenantId: "t1",
      subscriptionId: "s1",
      fimDoPeriodo: new Date("2026-09-30"),
      empresa: "Livela",
    })

    expect(enviadosPara().sort()).toEqual([
      "https://fcm.googleapis.com/fin",
      "https://fcm.googleapis.com/x",
    ])
  })

  it("quem NÃO pode ver financeiro fica de fora do aviso de dinheiro", async () => {
    // A tela de bloqueio do celular é lida por qualquer um que esteja por
    // perto. Mandar "a assinatura da Livela venceu" para o suporte é vazar
    // dado de cobrança pelo caminho mais silencioso que existe.
    await fundador()
    const t = await testDb.db.tenant.findFirst()
    const sup = await testDb.db.user.create({
      data: { id: "u-sup", tenantId: t!.id, name: "Sup", email: "sup@ex.com", role: "ADMIN" },
    })
    await testDb.db.pushSubscription.create({
      data: { userId: sup.id, endpoint: "https://fcm.googleapis.com/sup", p256dh: "p", auth: "a" },
    })
    // LOGISTICO tem verPainel, mas não verFinanceiro.
    await testDb.db.platformAdmin.create({
      data: { email: "sup@ex.com", name: "Suporte", role: "LOGISTICO", active: true },
    })

    await (await lib()).avisarPlataforma("assinaturaEmAtraso", {
      subscriptionId: "s1",
      fimDoPeriodo: new Date("2026-09-30"),
    })
    expect(enviadosPara()).not.toContain("https://fcm.googleapis.com/sup")

    // Mas recebe empresa nova, que é verPainel.
    mockEnviar.mockClear()
    await (await lib()).avisarPlataforma("novaEmpresa", { tenantId: "t-novo" })
    expect(enviadosPara()).toContain("https://fcm.googleapis.com/sup")
  })

  it("membro DESATIVADO não recebe", async () => {
    await fundador()
    const t = await testDb.db.tenant.findFirst()
    const ex = await testDb.db.user.create({
      data: { id: "u-ex", tenantId: t!.id, name: "Ex", email: "ex@ex.com", role: "ADMIN" },
    })
    await testDb.db.pushSubscription.create({
      data: { userId: ex.id, endpoint: "https://fcm.googleapis.com/ex", p256dh: "p", auth: "a" },
    })
    await testDb.db.platformAdmin.create({
      data: { email: "ex@ex.com", name: "Saiu", role: "DONO", active: false },
    })

    await (await lib()).avisarPlataforma("novaEmpresa", { tenantId: "t-novo" })
    expect(enviadosPara()).not.toContain("https://fcm.googleapis.com/ex")
  })
})

describe("uma vez só, para sempre", () => {
  it("o MESMO fato não avisa duas vezes", async () => {
    // O webhook do Asaas reenvia, e o primeiro login tem corrida entre Server
    // Components. Um `if` perderia os dois casos; o índice único não perde.
    await fundador()
    const l = await lib()

    await l.avisarPlataforma("novaEmpresa", { tenantId: "t-novo", empresa: "Nova" })
    await l.avisarPlataforma("novaEmpresa", { tenantId: "t-novo", empresa: "Nova" })

    expect(mockEnviar).toHaveBeenCalledOnce()
    expect(await testDb.db.platformAlert.count()).toBe(1)
  })

  it("nem sob CORRIDA — duas chamadas ao mesmo tempo", async () => {
    await fundador()
    const l = await lib()

    await Promise.all([
      l.avisarPlataforma("novaEmpresa", { tenantId: "t-novo" }),
      l.avisarPlataforma("novaEmpresa", { tenantId: "t-novo" }),
    ])

    expect(mockEnviar).toHaveBeenCalledOnce()
  })

  it("ATRASO e CANCELAMENTO da mesma assinatura avisam os DOIS", async () => {
    // O defeito mais caro deste módulo. Com chave compartilhada, o
    // cancelamento — que chega depois — seria engolido pela linha do atraso, e
    // o dono saberia que o cliente atrasou e nunca que ele foi embora.
    await fundador()
    const l = await lib()
    const dados = { tenantId: "t1", subscriptionId: "s1", fimDoPeriodo: new Date("2026-09-30") }

    await l.avisarPlataforma("assinaturaEmAtraso", dados)
    await l.avisarPlataforma("assinaturaCancelada", dados)

    expect(mockEnviar).toHaveBeenCalledTimes(2)
    expect(await testDb.db.platformAlert.count()).toBe(2)
  })

  it("o mesmo atraso em MESES diferentes avisa os dois", async () => {
    await fundador()
    const l = await lib()

    await l.avisarPlataforma("assinaturaEmAtraso", { subscriptionId: "s1", fimDoPeriodo: new Date("2026-09-30") })
    await l.avisarPlataforma("assinaturaEmAtraso", { subscriptionId: "s1", fimDoPeriodo: new Date("2026-10-31") })

    expect(mockEnviar).toHaveBeenCalledTimes(2)
  })
})

describe("nunca derruba quem chamou", () => {
  it("push explodindo não propaga o erro", async () => {
    // Avisar é acessório: falhar não pode derrubar o cadastro da empresa nova
    // nem fazer o webhook responder erro — o Asaas reenviaria para sempre.
    await fundador()
    mockEnviar.mockRejectedValue(new Error("FCM fora do ar"))

    await expect(
      (await lib()).avisarPlataforma("novaEmpresa", { tenantId: "t-novo" })
    ).resolves.toBeUndefined()
  })

  it("o registro fica gravado mesmo quando o push falha", async () => {
    // Linha ausente = o gatilho nunca rodou. Linha presente com delivered 0 =
    // rodou e o push não chegou. Sem essa diferença os dois casos parecem o
    // mesmo na hora de descobrir por que ninguém foi avisado.
    await fundador()
    mockEnviar.mockRejectedValue(new Error("FCM fora do ar"))

    await (await lib()).avisarPlataforma("novaEmpresa", { tenantId: "t-novo" })

    const linha = await testDb.db.platformAlert.findFirst()
    expect(linha).not.toBeNull()
    expect(linha!.delivered).toBe(0)
  })
})

describe("o botão de teste", () => {
  it("pode ser apertado quantas vezes quiser", async () => {
    // O modo de falha deste recurso é o silêncio, e com 4 empresas na história
    // inteira pode levar meses até um gatilho real revelar o cano quebrado.
    await fundador()
    const l = await lib()

    await l.enviarAvisoDeTeste()
    await l.enviarAvisoDeTeste()

    expect(mockEnviar).toHaveBeenCalledTimes(2)
    // E não suja a tabela de reivindicações.
    expect(await testDb.db.platformAlert.count()).toBe(0)
  })
})
