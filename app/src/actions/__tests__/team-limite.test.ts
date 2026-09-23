import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// "Até 3 usuários" no Starter e "até 10" no Pro são promessa de VITRINE. Este
// arquivo confere que a promessa é cumprida pela AÇÃO que a pessoa usa, e não
// só pela função de limite testada isolada em lib/__tests__/plan.test.ts.
//
// A diferença importa: uma função de limite correta que ninguém chama no
// caminho real é exatamente o defeito que ela deveria evitar — e foi o estado
// deste código até 10/08/2026, quando dava para convidar equipe sem limite em
// qualquer plano.

let testDb: TestDatabase
let criados = 0
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  // Fora do que se testa aqui: rede, e-mail e limite por IP.
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
    clientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  }))
  vi.doMock("@/lib/resend", () => ({ sendTeamInviteEmail: vi.fn().mockResolvedValue(true) }))
  vi.doMock("@/lib/i18n", () => ({ getTranslator: async () => (c: string) => c }))
  // A chave da mensagem volta crua, com as variaveis: e isso que deixa o teste
  // afirmar que o texto diz QUAL e o teto, e nao so que estourou.
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
  mockGetTenant.mockReset()
  // O convite cria a conta no Supabase ANTES de gravar no banco. Sem simular
  // isso, nenhum usuário e criado nem quando ha vaga — e o teste nao
  // distinguiria "a trava barrou" de "nao gravou por outro motivo".
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co"
  criados = 0
  vi.stubGlobal("fetch", vi.fn(async () => {
    criados += 1
    return {
      ok: true,
      json: async () => ({ id: `novo-usuario-${criados}`, action_link: "https://x" }),
      text: async () => "",
    } as unknown as Response
  }))
})

async function empresaComPlano(slug: string, usuarios: number) {
  // upsert, e nao create: Plan.slug e unico, e um teste que monta DUAS
  // empresas do mesmo plano criaria o plano duas vezes.
  const plano = await testDb.db.plan.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: slug,
      priceMonthly: 100,
      priceYearly: 1000,
      // O teto vem do PLANO no banco, e nao da tabela em lib/plan.ts: e assim
      // que funciona em producao.
      maxUsers: slug === "starter" ? 3 : slug === "pro" ? 10 : null,
      features: [],
    },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: "Empresa", planId: plano.id, subscriptionStatus: "ACTIVE" },
  })
  for (let i = 0; i < usuarios; i++) {
    await testDb.db.user.create({
      data: {
        id: `${tenant.id}-u${i}`,
        name: `Pessoa ${i}`,
        email: `p${i}.${tenant.id}@x.com`,
        tenantId: tenant.id,
        role: i === 0 ? "OWNER" : "TECHNICIAN",
      },
    })
  }
  mockGetTenant.mockResolvedValue({
    tenantId: tenant.id,
    userId: `${tenant.id}-u0`,
    role: "OWNER",
  })
  return tenant
}

function convite(email: string) {
  const fd = new FormData()
  fd.set("name", "Nova Pessoa")
  fd.set("email", email)
  fd.set("role", "TECHNICIAN")
  return fd
}

describe("o teto de usuários do plano vale na hora de convidar", () => {
  it("Starter com 3 usuários NÃO consegue o quarto", async () => {
    // A pergunta exata do dono: "se a empresa do plano Starter já tiver os 3
    // usuários, ele ainda consegue adicionar mais um?"
    const t = await empresaComPlano("starter", 3)
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("quarto@x.com"))

    expect(r.message).toMatch(/planLimit\.users/)
    // E o mais importante: ninguém foi criado.
    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(3)
  })

  it("Starter com 2 usuários consegue o terceiro", async () => {
    // O outro lado: uma trava que bloqueia cedo demais é tão ruim quanto uma
    // que não bloqueia — a empresa pagou por três.
    const t = await empresaComPlano("starter", 2)
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("terceiro@x.com"))

    expect(r.message ?? "").not.toMatch(/planLimit\.users/)
    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(3)
  })

  it("Pro com 10 usuários NÃO consegue o décimo primeiro", async () => {
    const t = await empresaComPlano("pro", 10)
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("decimoprimeiro@x.com"))

    expect(r.message).toMatch(/planLimit\.users/)
    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(10)
  })

  it("Pro com 9 usuários consegue o décimo", async () => {
    const t = await empresaComPlano("pro", 9)
    const { inviteTeamMember } = await import("@/actions/team")

    await inviteTeamMember({}, convite("decimo@x.com"))

    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(10)
  })

  it("Enterprise vai até 30, e trava no 31", async () => {
    // Deixou de ser ilimitado em 04/09/2026. Quem passa disso compra plano
    // personalizado — que o painel já concede por empresa, e o teste logo
    // abaixo prova que o teto concedido vale por cima do plano.
    const t = await empresaComPlano("enterprise", 29)
    const { inviteTeamMember } = await import("@/actions/team")

    // O trigésimo entra.
    await inviteTeamMember({}, convite("trigesimo@x.com"))
    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(30)

    // O trigésimo primeiro não, e a mensagem diz o teto — para a pessoa saber
    // que existe caminho acima dele.
    const r = await inviteTeamMember({}, convite("trintaeum@x.com"))
    expect(r.message ?? "").toMatch(/planLimit\.users/)
    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(30)
  })

  it("o teto concedido por empresa vale por cima do plano", async () => {
    // O painel admin libera usuários avulsos (maxUsersOverride). Se a ação
    // olhasse só o plano, a concessão seria cobrada e não entregue.
    const t = await empresaComPlano("starter", 3)
    await testDb.db.tenant.update({ where: { id: t.id }, data: { maxUsersOverride: 5 } })
    const { inviteTeamMember } = await import("@/actions/team")

    await inviteTeamMember({}, convite("quarto@x.com"))

    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(4)
  })

  it("usuário de OUTRA empresa não ocupa vaga", async () => {
    const outra = await empresaComPlano("starter", 3)
    expect(outra).toBeTruthy()
    const t = await empresaComPlano("starter", 1)
    const { inviteTeamMember } = await import("@/actions/team")

    await inviteTeamMember({}, convite("segundo@x.com"))

    expect(await testDb.db.user.count({ where: { tenantId: t.id } })).toBe(2)
  })

  it("a mensagem diz QUAL é o teto, e não só que estourou", async () => {
    // "Limite atingido" manda a pessoa adivinhar. O número é o que permite
    // decidir entre remover alguém e trocar de plano.
    await empresaComPlano("starter", 3)
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("quarto@x.com"))

    expect(r.message).toContain("3")
  })
})
