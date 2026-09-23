import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O que os 15 dias de teste entregam.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// O tenant em teste nasce SEM PLANO (`auth.ts` grava name, referredByCode,
// referralDiscountPercent e trialEndsAt — nunca planId). E "sem plano" caía no
// PERMISSIVO de lib/plan.ts: `recursos: TODOS` e as três cotas em `null`.
//
// Resultado: quem se cadastrava sem cartão ganhava NOTA FISCAL SEM TETO. Cada
// nota é cobrada de nós pela nfe.io e não tem cancelamento no produto — é
// dinheiro que sai, irreversível, de uma conta que não paga nada. O Enterprise
// perdeu o "ilimitado" em 04/09/2026 exatamente por esse motivo; no teste o
// preço era zero e o teto não existia.
//
// O comentário do PERMISSIVO se defendia assim: "tenant sem plano nenhum também
// cai aqui, e não é brecha: sem assinatura ACTIVE o layout já manda pra
// /expired". A defesa caducou em 08/09/2026, quando o teste voltou e TRIAL
// passou a valer em `hasActiveSubscription`.
//
// (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
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

const plan = () => import("@/lib/plan")

async function empresa(dados: {
  status?: "TRIAL" | "ACTIVE" | "CANCELLED"
  slug?: string
}) {
  let planId: string | undefined
  if (dados.slug) {
    const p = await testDb.db.plan.create({
      data: { name: dados.slug, slug: dados.slug, priceMonthly: 1, priceYearly: 10 },
    })
    planId = p.id
  }
  return testDb.db.tenant.create({
    data: {
      name: "Desentupidora Silva",
      subscriptionStatus: dados.status ?? "TRIAL",
      ...(planId ? { planId } : {}),
    },
  })
}

describe("a empresa em teste tem TETO de nota fiscal", () => {
  it("não é ilimitada", async () => {
    // O centro do defeito. `null` aqui significa "emite quantas quiser", e cada
    // uma custa dinheiro na nfe.io.
    const t = await empresa({ status: "TRIAL" })
    const { getLimites } = await plan()

    const { maxNfseMes } = await getLimites(t.id)
    expect(maxNfseMes).not.toBeNull()
    expect(maxNfseMes).toBeLessThanOrEqual(10)
  })

  it("e as outras cotas também são finitas", async () => {
    // Usuários e OS não custam por unidade, mas "ilimitado de graça" continua
    // sendo um convite a usar o teste como plano.
    const t = await empresa({ status: "TRIAL" })
    const { getLimites } = await plan()

    const l = await getLimites(t.id)
    expect(l.maxUsuarios).not.toBeNull()
    expect(l.maxOsMes).not.toBeNull()
  })
})

describe("o teste mostra o Pro, e não o plano de entrada", () => {
  it("entrega estoque, mapa, régua e relatórios avançados", async () => {
    // São os argumentos que fazem alguém assinar. Escondê-los durante o teste é
    // vender o Starter para quem estava avaliando o Pro.
    const t = await empresa({ status: "TRIAL" })
    const { getLimites } = await plan()

    const { recursos } = await getLimites(t.id)
    for (const r of ["stock", "gpsMap", "reguaCobranca", "advancedReports", "nfse"]) {
      expect(recursos).toContain(r)
    }
  })

  it("NÃO entrega a API, que é exclusiva do Enterprise", async () => {
    // O teste não é uma amostra grátis do plano mais caro.
    const t = await empresa({ status: "TRIAL" })
    const { getLimites } = await plan()

    expect((await getLimites(t.id)).recursos).not.toContain("api")
  })

  it("nem os adicionais vendidos à parte", async () => {
    const t = await empresa({ status: "TRIAL" })
    const { getLimites } = await plan()

    const { recursos } = await getLimites(t.id)
    expect(recursos).not.toContain("ia")
    expect(recursos).not.toContain("filiais")
  })
})

describe("quem tem plano contratado não é afetado", () => {
  it("o plano manda, mesmo com a empresa marcada TRIAL", async () => {
    // A ordem importa: plano contratado vence o estado de teste. Sem isto,
    // alguém que assinou e ficou com o status desatualizado seria rebaixado.
    const t = await empresa({ status: "TRIAL", slug: "enterprise" })
    const { getLimites } = await plan()

    const l = await getLimites(t.id)
    expect(l.maxNfseMes).toBe(200)
    expect(l.recursos).toContain("api")
  })

  it("o Starter continua com as cotas dele", async () => {
    const t = await empresa({ status: "ACTIVE", slug: "starter" })
    const { getLimites } = await plan()

    const l = await getLimites(t.id)
    expect(l.maxUsuarios).toBe(3)
    expect(l.maxNfseMes).toBe(8)
    expect(l.recursos).not.toContain("stock")
  })
})

describe("o recurso concedido à mão ainda soma por cima do teste", () => {
  it("empresa em teste com adicional concedido recebe o adicional", async () => {
    // `extraFeatures` é o mecanismo de liberar o que nenhum plano inclui. O
    // plano do teste não pode quebrá-lo.
    const t = await testDb.db.tenant.create({
      data: { name: "Com adicional", subscriptionStatus: "TRIAL", extraFeatures: ["ia"] },
    })
    const { getLimites } = await plan()

    expect((await getLimites(t.id)).recursos).toContain("ia")
  })
})
