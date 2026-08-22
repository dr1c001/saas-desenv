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

  it("Pro libera tudo MENOS API e filiais, com 10 usuários e 200 OS/mês", async () => {
    const { getLimites } = await import("@/lib/plan")
    const { RECURSOS } = await import("@/lib/recursos")
    await seedPlanos()
    const t = await seedTenant("pro")

    const limites = await getLimites(t.id)
    // Derivado do catálogo, e não escrito à mão: assim um recurso novo cai
    // automaticamente no Pro (que é a regra) e só os exclusivos do Enterprise
    // precisam ser lembrados aqui.
    const exclusivos = ["api", "filiais"]
    expect([...limites.recursos].sort()).toEqual(
      [...RECURSOS].filter((r) => !exclusivos.includes(r)).sort()
    )
    expect(limites.maxUsuarios).toBe(10)
    // Deixou de ser ilimitada em 21/08/2026: o Pro passou a ter teto de 200.
    expect(limites.maxOsMes).toBe(200)
  })

  it("API e filiais são o que separam Pro de Enterprise, e o Pro NÃO tem", async () => {
    // São as duas únicas coisas exclusivas do Enterprise. Se esta linha cair, o
    // plano de R$ 397 passa a não ter nada que o de R$ 97 não tenha — e ninguém
    // percebe, porque nada quebra visivelmente.
    const { temRecurso } = await import("@/lib/plan")
    await seedPlanos()
    const pro = (await seedTenant("pro")).id
    const ent = (await seedTenant("enterprise")).id
    const sta = (await seedTenant("starter")).id

    for (const exclusivo of ["api", "filiais"] as const) {
      expect(await temRecurso(pro, exclusivo), `pro/${exclusivo}`).toBe(false)
      expect(await temRecurso(sta, exclusivo), `starter/${exclusivo}`).toBe(false)
      expect(await temRecurso(ent, exclusivo), `enterprise/${exclusivo}`).toBe(true)
    }
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

describe("plan — cota de notas fiscais", () => {
  it("Starter tem 8 por mês, Pro 70, Enterprise ilimitado", async () => {
    // Vendido como NÚMERO na tela de planos. Até 21/08/2026 nada no sistema
    // contava nota emitida — a promessa existia só na vitrine.
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()

    expect((await getLimites((await seedTenant("starter")).id)).maxNfseMes).toBe(8)
    expect((await getLimites((await seedTenant("pro")).id)).maxNfseMes).toBe(70)
    expect((await getLimites((await seedTenant("enterprise")).id)).maxNfseMes).toBeNull()
  })

  it("o Pro deixou de ter OS ilimitada: 200 por mês", async () => {
    // Mudança de contrato consciente (pedido do dono em 21/08/2026). Fica
    // travado por teste porque nada quebra visivelmente se voltar a ser null.
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()

    expect((await getLimites((await seedTenant("pro")).id)).maxOsMes).toBe(200)
  })

  it("bloqueia a emissão quando a cota do mês acabou", async () => {
    const { requireCotaDeNfse, inicioDoMesDaCota } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")
    const c = await testDb.db.client.create({ data: { tenantId: t.id, name: "C" } })

    const dentroDoMes = new Date(inicioDoMesDaCota().getTime() + 3600_000)
    for (let i = 0; i < 8; i++) {
      await testDb.db.serviceOrder.create({
        data: {
          tenantId: t.id, clientId: c.id, number: i + 1, title: `OS ${i}`,
          nfseId: `nf-${i}`, nfseIssuedAt: dentroDoMes,
        },
      })
    }

    await expect(requireCotaDeNfse(t.id)).rejects.toThrow(/planLimit\.nfse/)
  })

  it("nota do mês PASSADO não gasta a cota deste mês", async () => {
    // Conta por nfseIssuedAt e não pelo createdAt da OS, justamente para a
    // cota do mês passado não ser gasta neste.
    const { requireCotaDeNfse, inicioDoMesDaCota } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")
    const c = await testDb.db.client.create({ data: { tenantId: t.id, name: "C" } })

    const mesPassado = new Date(inicioDoMesDaCota().getTime() - 86_400_000)
    for (let i = 0; i < 20; i++) {
      await testDb.db.serviceOrder.create({
        data: {
          tenantId: t.id, clientId: c.id, number: i + 1, title: `OS ${i}`,
          nfseId: `nf-${i}`, nfseIssuedAt: mesPassado,
        },
      })
    }

    await expect(requireCotaDeNfse(t.id)).resolves.toBeUndefined()
  })

  it("Enterprise não tem cota de nota", async () => {
    const { requireCotaDeNfse, inicioDoMesDaCota } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("enterprise")
    const c = await testDb.db.client.create({ data: { tenantId: t.id, name: "C" } })

    const agora = new Date(inicioDoMesDaCota().getTime() + 3600_000)
    for (let i = 0; i < 100; i++) {
      await testDb.db.serviceOrder.create({
        data: {
          tenantId: t.id, clientId: c.id, number: i + 1, title: `OS ${i}`,
          nfseId: `nf-${i}`, nfseIssuedAt: agora,
        },
      })
    }

    await expect(requireCotaDeNfse(t.id)).resolves.toBeUndefined()
  })

  it("a cota de uma empresa não conta a nota da outra", async () => {
    const { requireCotaDeNfse, inicioDoMesDaCota } = await import("@/lib/plan")
    await seedPlanos()
    const a = await seedTenant("starter")
    const b = await seedTenant("starter")
    const cb = await testDb.db.client.create({ data: { tenantId: b.id, name: "C" } })

    const agora = new Date(inicioDoMesDaCota().getTime() + 3600_000)
    for (let i = 0; i < 20; i++) {
      await testDb.db.serviceOrder.create({
        data: {
          tenantId: b.id, clientId: cb.id, number: i + 1, title: `OS ${i}`,
          nfseId: `nf-${i}`, nfseIssuedAt: agora,
        },
      })
    }

    await expect(requireCotaDeNfse(a.id)).resolves.toBeUndefined()
  })
})

describe("plan — tetos ajustados por empresa", () => {
  /** Grava o ajuste direto, como o painel faria. */
  async function comAjuste(slug: string, ajustes: Record<string, number | null>) {
    const t = await seedTenant(slug)
    await testDb.db.tenant.update({ where: { id: t.id }, data: ajustes })
    return t
  }

  it("sem ajuste, vale o teto do plano", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const l = await getLimites((await seedTenant("starter")).id)
    expect(l.maxUsuarios).toBe(3)
    expect(l.maxNfseMes).toBe(8)
  })

  it("um teto próprio manda mais que o plano", async () => {
    // O caso concreto: a empresa que precisa de 12 usuários mas não quer o
    // Enterprise. Hoje a única saída seria trocar o plano dela, o que muda o
    // preço e todo o resto junto.
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await comAjuste("starter", { maxUsersOverride: 12, maxNfseOverride: 30 })

    const l = await getLimites(t.id)
    expect(l.maxUsuarios).toBe(12)
    expect(l.maxNfseMes).toBe(30)
    // O que não foi ajustado continua vindo do plano.
    expect(l.maxOsMes).toBe(50)
  })

  it("zero libera de vez, sem trocar de plano", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await comAjuste("starter", { maxOrdersOverride: 0 })

    expect((await getLimites(t.id)).maxOsMes).toBeNull()
  })

  it("o ajuste também APERTA, não só afrouxa", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const t = await comAjuste("pro", { maxOrdersOverride: 40 })

    expect((await getLimites(t.id)).maxOsMes).toBe(40)
  })

  it("o teto ajustado é o que a COTA cobra de verdade", async () => {
    // O que liga o painel ao sistema: ajustar o número na tela precisa mudar
    // quem é barrado, e não só o que a tela mostra.
    const { requireCotaDeNfse, inicioDoMesDaCota } = await import("@/lib/plan")
    await seedPlanos()
    const t = await comAjuste("starter", { maxNfseOverride: 2 })
    const c = await testDb.db.client.create({ data: { tenantId: t.id, name: "C" } })

    const agora = new Date(inicioDoMesDaCota().getTime() + 3600_000)
    for (let i = 0; i < 2; i++) {
      await testDb.db.serviceOrder.create({
        data: {
          tenantId: t.id, clientId: c.id, number: i + 1, title: `OS ${i}`,
          nfseId: `nf-${i}`, nfseIssuedAt: agora,
        },
      })
    }

    // Duas notas com teto 2: estourou, mesmo o plano permitindo 8.
    await expect(requireCotaDeNfse(t.id)).rejects.toThrow(/planLimit\.nfse/)
  })

  it("o ajuste de uma empresa não vaza para a outra", async () => {
    const { getLimites } = await import("@/lib/plan")
    await seedPlanos()
    const ajustada = await comAjuste("starter", { maxUsersOverride: 99 })
    const normal = await seedTenant("starter")

    expect((await getLimites(ajustada.id)).maxUsuarios).toBe(99)
    expect((await getLimites(normal.id)).maxUsuarios).toBe(3)
  })
})

describe("plan — funções desligadas por empresa", () => {
  it("empresa nova tem TUDO ligado", async () => {
    // A garantia central: nenhuma empresa muda de comportamento no dia em que
    // a chave passa a existir. Uma lista de "ligadas" apagaria o sistema de
    // todo mundo no deploy.
    const { temFuncao } = await import("@/lib/plan")
    const { FUNCOES } = await import("@/lib/funcoes")
    await seedPlanos()
    const t = await seedTenant("starter")

    for (const f of FUNCOES) {
      expect(await temFuncao(t.id, f), f).toBe(true)
    }
  })

  it("desliga só o que está na lista", async () => {
    const { temFuncao } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")
    await testDb.db.tenant.update({
      where: { id: t.id },
      data: { disabledFeatures: ["osPdf", "nps"] },
    })

    expect(await temFuncao(t.id, "osPdf")).toBe(false)
    expect(await temFuncao(t.id, "nps")).toBe(false)
    expect(await temFuncao(t.id, "osHistorico")).toBe(true)
  })

  it("desligar para uma empresa não afeta a outra", async () => {
    const { temFuncao } = await import("@/lib/plan")
    await seedPlanos()
    const a = await seedTenant("starter")
    const b = await seedTenant("starter")
    await testDb.db.tenant.update({
      where: { id: a.id },
      data: { disabledFeatures: ["portalCliente"] },
    })

    expect(await temFuncao(a.id, "portalCliente")).toBe(false)
    expect(await temFuncao(b.id, "portalCliente")).toBe(true)
  })

  it("lixo gravado no banco não desliga função nenhuma", async () => {
    // Valor antigo ou digitado à mão não pode derrubar algo que ninguém pediu
    // para derrubar.
    const { temFuncao } = await import("@/lib/plan")
    const { FUNCOES } = await import("@/lib/funcoes")
    await seedPlanos()
    const t = await seedTenant("starter")
    await testDb.db.tenant.update({
      where: { id: t.id },
      data: { disabledFeatures: ["inventado", "osPdfff"] },
    })

    for (const f of FUNCOES) {
      expect(await temFuncao(t.id, f), f).toBe(true)
    }
  })

  it("função desligada é INDEPENDENTE do recurso de plano", async () => {
    // Conceitos opostos: recurso nasce desligado e o plano liga; função nasce
    // ligada e o painel desliga. Desligar uma não pode mexer na outra.
    const { temFuncao, temRecurso } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("enterprise")
    await testDb.db.tenant.update({
      where: { id: t.id },
      data: { disabledFeatures: ["osPdf"] },
    })

    expect(await temFuncao(t.id, "osPdf")).toBe(false)
    expect(await temRecurso(t.id, "gpsMap")).toBe(true)
  })

  it("religar traz de volta sem recadastrar nada", async () => {
    const { temFuncao } = await import("@/lib/plan")
    await seedPlanos()
    const t = await seedTenant("starter")

    await testDb.db.tenant.update({ where: { id: t.id }, data: { disabledFeatures: ["offline"] } })
    expect(await temFuncao(t.id, "offline")).toBe(false)

    await testDb.db.tenant.update({ where: { id: t.id }, data: { disabledFeatures: [] } })
    expect(await temFuncao(t.id, "offline")).toBe(true)
  })
})
