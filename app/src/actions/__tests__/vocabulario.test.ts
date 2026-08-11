import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { VOCABULARIO_PADRAO } from "@/lib/vocabulario"

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const seedTenant = (name: string) => testDb.db.tenant.create({ data: { name } })

function form(dados: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(dados)) fd.set(k, v)
  return fd
}

const CHAMADO = {
  osCurto: "Chamado", osSingular: "Chamado", osPlural: "Chamados", osGenero: "m",
  tecCurto: "Consultor", tecSingular: "Consultor", tecPlural: "Consultores", tecGenero: "m",
}

describe("vocabulário da empresa", () => {
  it("grava e devolve o que foi escolhido", async () => {
    const tenant = await seedTenant("TI Ltda")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { salvarVocabulario, getVocabulario } = await import("@/actions/vocabulario")

    expect(await salvarVocabulario({}, form(CHAMADO))).toEqual({ ok: true })

    const lido = await getVocabulario()
    expect(lido.os).toEqual({
      curto: "Chamado",
      // Singular e plural entram minúsculos: aparecem no meio de frase.
      singular: "chamado",
      plural: "chamados",
      genero: "m",
    })
    expect(lido.tec.plural).toBe("consultores")
  })

  it("começa no padrão quando nunca foi configurado", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { getVocabulario } = await import("@/actions/vocabulario")
    expect(await getVocabulario()).toEqual(VOCABULARIO_PADRAO.pt)
  })

  it("volta ao padrão gravando NULL, não o objeto de hoje", async () => {
    // Se gravasse o objeto, uma futura melhoria no texto padrão do sistema
    // nunca alcançaria quem clicou em "voltar ao padrão".
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { salvarVocabulario, restaurarVocabulario } = await import("@/actions/vocabulario")

    await salvarVocabulario({}, form(CHAMADO))
    expect(await restaurarVocabulario()).toEqual({ ok: true })

    const bruto = await testDb.db.tenant.findUnique({
      where: { id: tenant.id },
      select: { vocabulary: true },
    })
    expect(bruto?.vocabulary).toBeNull()
  })

  it("bloqueia TECHNICIAN", async () => {
    // Muda o nome das coisas para a equipe inteira de uma vez.
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { salvarVocabulario } = await import("@/actions/vocabulario")

    expect(await salvarVocabulario({}, form(CHAMADO))).toEqual({ erro: "semPermissao" })
    const t = await testDb.db.tenant.findUnique({ where: { id: tenant.id } })
    expect(t?.vocabulary).toBeNull()
  })

  it("recusa entrada inválida sem gravar nada", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { salvarVocabulario } = await import("@/actions/vocabulario")

    expect(await salvarVocabulario({}, form({ ...CHAMADO, osCurto: "C" }))).toEqual({
      erro: "termoCurto",
    })
    expect(await salvarVocabulario({}, form({ ...CHAMADO, tecGenero: "x" }))).toEqual({
      erro: "generoInvalido",
    })

    const t = await testDb.db.tenant.findUnique({ where: { id: tenant.id } })
    expect(t?.vocabulary).toBeNull()
  })

  it("uma empresa não vê o vocabulário da outra", async () => {
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")

    mockGetTenant.mockResolvedValue({ tenantId: tenantA.id, userId: "u1", role: "OWNER" })
    const { salvarVocabulario, getVocabulario } = await import("@/actions/vocabulario")
    await salvarVocabulario({}, form(CHAMADO))

    mockGetTenant.mockResolvedValue({ tenantId: tenantB.id, userId: "u2", role: "OWNER" })
    expect(await getVocabulario()).toEqual(VOCABULARIO_PADRAO.pt)
  })

  it("usa o padrão em inglês quando a empresa está em inglês", async () => {
    const tenant = await testDb.db.tenant.create({ data: { name: "Co", locale: "en" } })
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { getVocabulario } = await import("@/actions/vocabulario")
    expect(await getVocabulario()).toEqual(VOCABULARIO_PADRAO.en)
  })
})
