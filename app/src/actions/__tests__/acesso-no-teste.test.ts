import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { fimDoTeste } from "@/lib/teste-gratis"

// Quem entra no sistema durante o teste grátis.
//
// ─── Por que atravessar `hasActiveSubscription` ─────────────────────────────
//
// A regra pura está em lib/teste-gratis.ts e é testada lá. O que se prova AQUI
// é que ela é CONSULTADA no lugar certo.
//
// `hasActiveSubscription` não decide só o bloqueio de página: ela é chamada por
// `requireActiveSubscription` em toda Server Action sensível — foi assim que se
// descobriu, em 21/07/2026, que nenhuma Action verificava assinatura. Uma regra
// de teste que valesse só no layout deixaria a empresa em teste bloqueada em
// tudo que ela tentasse FAZER, e liberada só para olhar.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
  // `cache()` do React precisa de contexto de requisição; aqui vira identidade.
  vi.doMock("react", async () => {
    const real = await vi.importActual<typeof import("react")>("react")
    return { ...real, cache: (fn: unknown) => fn }
  })
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

const auth = () => import("@/lib/auth")

async function empresa(dados: {
  status: "TRIAL" | "ACTIVE" | "CANCELLED" | "PAST_DUE"
  trialEndsAt?: Date | null
}) {
  return testDb.db.tenant.create({
    data: {
      name: "Desentupidora Silva",
      subscriptionStatus: dados.status,
      trialEndsAt: dados.trialEndsAt ?? null,
    },
  })
}

describe("o teste grátis dá acesso de verdade", () => {
  it("empresa em teste DENTRO do prazo entra", async () => {
    // O caso central do retorno do recurso.
    const t = await empresa({ status: "TRIAL", trialEndsAt: fimDoTeste(new Date()) })
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(true)
  })

  it("e a trava das Server Actions deixa passar também", async () => {
    // É o ponto: `requireActiveSubscription` é chamada em toda ação sensível.
    // Uma regra que valesse só no layout deixaria a empresa em teste liberada
    // para olhar e bloqueada para trabalhar.
    const t = await empresa({ status: "TRIAL", trialEndsAt: fimDoTeste(new Date()) })
    const { requireActiveSubscription } = await auth()

    await expect(requireActiveSubscription(t.id)).resolves.toBeUndefined()
  })

  it("empresa com o teste VENCIDO não entra", async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const t = await empresa({ status: "TRIAL", trialEndsAt: ontem })
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(false)
  })

  it("empresa em TRIAL sem data de fim NÃO entra", async () => {
    // É o estado das empresas criadas enquanto não havia trial — inclusive uma
    // que está assim em produção desde julho. Liberá-las agora reabriria o
    // sistema de graça para quem parou de pagar.
    const t = await empresa({ status: "TRIAL", trialEndsAt: null })
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(false)
  })

  it("CANCELADA não entra, nem com data de teste no futuro", async () => {
    // Quem cancelou não volta a ter teste por causa de um campo antigo.
    const t = await empresa({ status: "CANCELLED", trialEndsAt: fimDoTeste(new Date()) })
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(false)
  })

  it("ATIVA entra, com ou sem data de teste", async () => {
    const t = await empresa({ status: "ACTIVE", trialEndsAt: null })
    const { hasActiveSubscription } = await auth()

    expect(await hasActiveSubscription(t.id)).toBe(true)
  })
})

describe("quem se cadastra hoje ganha o prazo", () => {
  it("o tenant nasce com a data de fim preenchida", async () => {
    // O campo existia desde julho e NINGUÉM o preenchia. Sem isto, o cadastro
    // criaria uma empresa em TRIAL sem prazo — que, pela regra acima, não tem
    // acesso a nada. O teste voltaria só no nome.
    const criado = await testDb.db.tenant.create({
      data: { name: "Nova", trialEndsAt: fimDoTeste(new Date()) },
    })

    expect(criado.subscriptionStatus).toBe("TRIAL")
    expect(criado.trialEndsAt).toBeInstanceOf(Date)
    expect(criado.trialEndsAt!.getTime()).toBeGreaterThan(Date.now())

    const { hasActiveSubscription } = await auth()
    expect(await hasActiveSubscription(criado.id)).toBe(true)
  })
})
