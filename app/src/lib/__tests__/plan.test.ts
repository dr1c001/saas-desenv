import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Estas travas são a diferença entre R$ 97 e R$ 397 por mês. Elas não
// existiam até 10/08/2026 — a tela prometia limites por plano e nada no
// código verificava. Sem teste, isso volta a quebrar em silêncio: nenhuma
// dessas regras dá erro visível quando some.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  // As mensagens de erro vêm do next-intl, que precisa de request context.
  // O que importa aqui é SE bloqueia, não o texto — devolve a chave crua.
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string, vars?: Record<string, unknown>) =>
      vars ? `${chave}:${JSON.stringify(vars)}` : chave,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

async function seedPlanos() {
  for (const [slug, name, maxUsers] of [
    ["starter", "Starter", 3],
    ["pro", "Pro", 10],
    ["enterprise", "Enterprise", null],
  ] as const) {
    await testDb.db.plan.create({
      data: { name, slug, priceMonthly: 1, priceYearly: 10, maxUsers, features: [] },
    })
  }
}

async function seedTenant(slug: string | null, extraFeatures: string[] = []) {
  const plan = slug ? await testDb.db.plan.findUnique({ where: { slug } }) : null
  return testDb.db.tenant.create({
    data: { name: `Empresa ${slug ?? "sem plano"}`, planId: plan?.id ?? null, extraFeatures },
  })
}

describe("plan — o que cada plano libera", () => {
  it("Starter não libera nenhum recurso pago", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")

    const limites = await getLimites(t.id)
    expect(limites.recursos).toEqual([])
    expect(limites.maxUsuarios).toBe(3)
    expect(limites.maxOsMes).toBe(50)
  })

  it("Pro libera todos os recursos, com limite de 10 usuários e OS ilimitada", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("pro")

    const limites = await getLimites(t.id)
    expect(limites.recursos).toEqual(
      expect.arrayContaining(["gpsMap", "nfse", "signature", "checklist", "advancedReports"])
    )
    expect(limites.maxUsuarios).toBe(10)
    expect(limites.maxOsMes).toBeNull()
  })

  it("Enterprise libera tudo, sem limite de usuário nem de OS", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("enterprise")

    const { RECURSOS } = await import("@/lib/recursos")
    const limites = await getLimites(t.id)
    // Comparado com o catálogo inteiro, e não com um número fixo: assim
    // "Enterprise tem tudo" continua sendo verificado de verdade quando um
    // recurso novo entra, em vez de o teste quebrar pedindo que se troque o 5
    // por 6 sem ninguém pensar em qual plano deveria recebê-lo.
    expect([...limites.recursos].sort()).toEqual([...RECURSOS].sort())
    expect(limites.maxUsuarios).toBeNull()
    expect(limites.maxOsMes).toBeNull()
  })

  it("Starter NÃO ganha recurso novo por descuido", async () => {
    // O contraponto do teste acima: se alguém adicionar um recurso ao catálogo
    // e ele vazar pro Starter, a diferença entre R$ 97 e R$ 397 evapora em
    // silêncio. Aqui a lista vazia é a afirmação.
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")

    expect((await getLimites(t.id)).recursos).toEqual([])
  })

  it("extraFeatures soma ao plano sem alterar os limites numéricos", async () => {
    const { temRecurso, getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter", ["signature"])

    // Este é exatamente o caso da primeira cliente pagante: Starter, mas com
    // assinatura digital mantida por já estar em uso quando as travas ligaram.
    expect(await temRecurso(t.id, "signature")).toBe(true)
    expect(await temRecurso(t.id, "gpsMap")).toBe(false)
    expect((await getLimites(t.id)).maxUsuarios).toBe(3)
  })

  it("extraFeatures ignora valor que não é um recurso conhecido", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter", ["signature", "lixo-digitado-errado"])

    expect((await getLimites(t.id)).recursos).toEqual(["signature"])
  })
})

describe("plan — limite de usuários", () => {
  it("bloqueia o convite quando o Starter já tem 3 usuários", async () => {
    const { requireVagaDeUsuario } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")

    for (let i = 0; i < 3; i++) {
      await testDb.db.user.create({
        data: { id: `u${i}`, name: `U${i}`, email: `u${i}@x.com`, tenantId: t.id },
      })
    }
    await expect(requireVagaDeUsuario(t.id)).rejects.toThrow(/planLimit\.users/)
  })

  it("deixa convidar enquanto há vaga", async () => {
    const { requireVagaDeUsuario } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")

    await testDb.db.user.create({ data: { id: "u1", name: "U1", email: "u1@x.com", tenantId: t.id } })
    await expect(requireVagaDeUsuario(t.id)).resolves.toBeUndefined()
  })

  it("não conta usuário de outro tenant no limite", async () => {
    const { requireVagaDeUsuario } = await import("@/lib/plan")
    await seedPlanos()
    const a = await seedTenant("starter")
    const b = await seedTenant("starter")

    for (let i = 0; i < 5; i++) {
      await testDb.db.user.create({
        data: { id: `b${i}`, name: `B${i}`, email: `b${i}@x.com`, tenantId: b.id },
      })
    }
    await expect(requireVagaDeUsuario(a.id)).resolves.toBeUndefined()
  })

  it("Enterprise não tem teto de usuários", async () => {
    const { requireVagaDeUsuario } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("enterprise")

    for (let i = 0; i < 30; i++) {
      await testDb.db.user.create({
        data: { id: `e${i}`, name: `E${i}`, email: `e${i}@x.com`, tenantId: t.id },
      })
    }
    await expect(requireVagaDeUsuario(t.id)).resolves.toBeUndefined()
  })
})

describe("plan — cota de OS por mês", () => {
  async function seedCliente(tenantId: string) {
    return testDb.db.client.create({ data: { name: "Cliente", tenantId } })
  }

  async function criarOs(tenantId: string, clientId: string, quantas: number, createdAt?: Date) {
    for (let i = 0; i < quantas; i++) {
      await testDb.db.serviceOrder.create({
        data: { number: i + 1, title: `OS ${i}`, clientId, tenantId, ...(createdAt ? { createdAt } : {}) },
      })
    }
  }

  it("bloqueia a 51ª OS do mês no Starter", async () => {
    const { requireCotaDeOs } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")
    const c = await seedCliente(t.id)

    await criarOs(t.id, c.id, 50)
    await expect(requireCotaDeOs(t.id)).rejects.toThrow(/planLimit\.serviceOrders/)
  })

  it("deixa criar a 50ª", async () => {
    const { requireCotaDeOs } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")
    const c = await seedCliente(t.id)

    await criarOs(t.id, c.id, 49)
    await expect(requireCotaDeOs(t.id)).resolves.toBeUndefined()
  })

  it("OS de meses anteriores não consomem a cota do mês corrente", async () => {
    const { requireCotaDeOs } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")
    const c = await seedCliente(t.id)

    // Este é o ponto que mais silenciosamente quebraria: contar tudo desde
    // sempre transformaria "50 por mês" em "50 pra vida inteira".
    const mesPassado = new Date()
    mesPassado.setMonth(mesPassado.getMonth() - 2)
    await criarOs(t.id, c.id, 80, mesPassado)

    await expect(requireCotaDeOs(t.id)).resolves.toBeUndefined()
  })

  it("Pro não tem cota mensal", async () => {
    const { requireCotaDeOs } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("pro")
    const c = await seedCliente(t.id)

    await criarOs(t.id, c.id, 120)
    await expect(requireCotaDeOs(t.id)).resolves.toBeUndefined()
  })
})

describe("plan — requireRecurso", () => {
  it("recusa recurso fora do plano e aceita dentro", async () => {
    const { requireRecurso } = await import("@/lib/plan")
    await seedPlanos()
    const starter = await seedTenant("starter")
    const pro = await seedTenant("pro")

    await expect(requireRecurso(starter.id, "gpsMap")).rejects.toThrow(/planFeature\.gpsMap/)
    await expect(requireRecurso(pro.id, "gpsMap")).resolves.toBeUndefined()
  })
})
