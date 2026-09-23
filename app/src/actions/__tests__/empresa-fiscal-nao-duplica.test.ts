import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { RecusaExterna } from "@/lib/tempo-limite"

// Cadastrar a empresa no emissor fiscal DUAS VEZES orfanava o certificado.
//
// `registerFiscalCompany` chamava `createCompany` sem olhar se já havia
// `nfeioCompanyId`, e gravava o id novo por cima. A única guarda era a tela,
// que esconde o formulário quando está configurado — e a Action é endereço
// HTTP próprio.
//
// O estrago: o certificado A1 é instalado NA empresa do emissor, pelo id. Com
// uma segunda empresa criada (clique duplo antes do redirect, retry, chamada
// direta), o id mudava e o certificado ficava na antiga. Toda nota passava a
// sair contra uma empresa sem certificado — falhando —, com a tela mostrando
// "Configurado" em verde. (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockCriarEmpresa = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    requireCotaDeNfse: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
  }))
  vi.doMock("@/lib/nfeio", () => ({ nfeio: { createCompany: mockCriarEmpresa } }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  mockCriarEmpresa.mockReset().mockResolvedValue({ id: "co-nova" })
})

async function empresa() {
  const t = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  await testDb.db.user.create({
    data: { id: `dono-${t.id}`, tenantId: t.id, name: "Adriel", email: `d-${t.id}@ex.com`, role: "OWNER" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: t.id, userId: `dono-${t.id}`, role: "OWNER" })
  return t
}

function form() {
  const fd = new FormData()
  for (const [k, v] of Object.entries({
    cnpj: "12.345.678/0001-90", municipalTaxNumber: "123", email: "fiscal@ex.com",
    postalCode: "13480-000", street: "Rua A", number: "10", district: "Centro",
    cityCode: "3512345", cityName: "Limeira", state: "SP", issRate: "5",
  })) fd.set(k, v)
  return fd
}

const cadastrar = async () => {
  const { registerFiscalCompany } = await import("@/actions/nfse")
  return registerFiscalCompany(form())
}

const releu = (id: string) => testDb.db.tenant.findUnique({ where: { id } })

describe("a empresa é cadastrada UMA vez", () => {
  it("o primeiro cadastro grava o id do emissor", async () => {
    const t = await empresa()

    await cadastrar()

    expect(mockCriarEmpresa).toHaveBeenCalledTimes(1)
    expect((await releu(t.id))!.nfeioCompanyId).toBe("co-nova")
  })

  it("o SEGUNDO recusa — não cria outra empresa nem troca o id", async () => {
    // É o clique duplo, o retry, a chamada direta à Action. Trocar o id aqui
    // deixaria o certificado na empresa antiga.
    const t = await empresa()
    await cadastrar()
    mockCriarEmpresa.mockResolvedValue({ id: "co-DUPLICADA" })

    await expect(cadastrar()).rejects.toThrow("fiscalJaConfigurado")

    expect(mockCriarEmpresa).toHaveBeenCalledTimes(1)
    expect((await releu(t.id))!.nfeioCompanyId).toBe("co-nova")
  })
})

describe("quando o emissor recusa", () => {
  it("a reserva VOLTA: o dono corrige o formulário e tenta de novo", async () => {
    const t = await empresa()
    mockCriarEmpresa.mockRejectedValueOnce(new RecusaExterna("nfe.io /companies", 400, "CNPJ inválido"))

    await expect(cadastrar()).rejects.toThrow("CNPJ inválido")
    expect((await releu(t.id))!.nfeioCompanyId).toBeNull()

    // E a tentativa seguinte funciona.
    await cadastrar()
    expect((await releu(t.id))!.nfeioCompanyId).toBe("co-nova")
  })
})

describe("quando não se sabe se a empresa foi criada", () => {
  it.each([
    ["timeout", Object.assign(new Error("aborted"), { name: "TimeoutError" })],
    ["socket caído depois do POST", Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_SOCKET" } })],
    ["502 de gateway", new RecusaExterna("nfe.io /companies", 502, "Bad Gateway")],
  ])("%s MANTÉM a reserva — criar a segunda orfanaria o certificado", async (_, erro) => {
    const t = await empresa()
    mockCriarEmpresa.mockRejectedValueOnce(erro)

    await expect(cadastrar()).rejects.toThrow("fiscalSemResposta")

    expect((await releu(t.id))!.nfeioCompanyId).toBe(`reservando:${t.id}`)
    // E a tentativa seguinte NÃO cria outra: a reserva barra.
    await expect(cadastrar()).rejects.toThrow("fiscalJaConfigurado")
    expect(mockCriarEmpresa).toHaveBeenCalledTimes(1)
  })
})

describe("a tela não chama reserva presa de 'configurado'", () => {
  // Estrutural: o selo verde com a string da reserva no lugar do id esconderia
  // o problema justamente de quem precisa vê-lo.
  it("a página fiscal distingue os dois estados", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/(dashboard)/settings/fiscal/page.tsx", "utf-8")
    )
    expect(fonte).toContain('nfeioCompanyId?.startsWith("reservando:")')
    expect(fonte).toMatch(/const isConfigured = !!fiscal\?\.nfeioCompanyId && !travado/)
  })
})
