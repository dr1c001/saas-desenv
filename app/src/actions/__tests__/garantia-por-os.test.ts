import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A garantia PRÓPRIA de uma OS.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `ServiceOrder.warrantyDays` existia no schema, era LIDO em oito lugares e
// gravado em NENHUM. A única escrita de `warrantyDays` no sistema inteiro era a
// do padrão da EMPRESA, em documentos.ts.
//
// Enquanto isso, a ajuda do campo em 5.4 prometia: "Cada OS pode ter prazo
// próprio." Não havia onde digitar. O primeiro ramo de `diasDeGarantia` —
// `if (daOs !== null && daOs !== undefined) return daOs` — era inalcançável em
// produção, e o PDF entregue ao cliente sempre imprimia o padrão da empresa.
//
// Por consequência, o evento GARANTIA do histórico da OS nunca era emitido (o
// retrato "depois" copiava o valor do "antes" sem alterá-lo), e o renderizador
// dele era código morto.
//
// (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    filtroDeFilialAtual: vi.fn().mockResolvedValue({}),
    checarAcao: vi.fn().mockResolvedValue(null),
    getAcoesPermitidas: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    temFuncao: vi.fn().mockResolvedValue(false),
    requireCotaDeOs: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/service-orders")

async function cenario(padraoDaEmpresa: number | null = 90) {
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", ...(padraoDaEmpresa === null ? {} : { warrantyDays: padraoDaEmpresa }) },
  })
  const tecnico = await testDb.db.user.create({
    data: { id: "tec", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "tec", role: "OWNER" })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Dona Maria" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      technicianId: tecnico.id,
      number: 1,
      title: "Reforma",
      status: "OPEN",
    },
  })
  return { tenant, os }
}

const ITENS = [{ description: "Serviço", quantity: 1, unitPrice: 1000 }]

describe("concluir informando a garantia", () => {
  it("grava o prazo próprio da OS", async () => {
    // O caso que a tela promete: a empresa dá 90 dias, mas esta reforma tem um
    // ano.
    const { os } = await cenario(90)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Feito", ITENS, false, null, 365)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.warrantyDays).toBe(365)
  })

  it("ZERO é uma escolha: sem garantia, sobrepondo o padrão", async () => {
    // `diasDeGarantia` compara com null justamente para isto — se comparasse
    // com valor falso, zero cairia no padrão da empresa e a OS ganharia 90
    // dias que ninguém prometeu.
    const { os } = await cenario(90)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Feito", ITENS, false, null, 0)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.warrantyDays).toBe(0)

    const { diasDeGarantia } = await import("@/lib/garantia")
    expect(diasDeGarantia(depois?.warrantyDays, 90)).toBe(0)
  })

  it("em branco volta ao padrão da empresa", async () => {
    const { os } = await cenario(90)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Feito", ITENS, false, null, null)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.warrantyDays).toBeNull()

    const { diasDeGarantia } = await import("@/lib/garantia")
    expect(diasDeGarantia(depois?.warrantyDays, 90)).toBe(90)
  })

  it("NÃO informar não apaga o que já estava gravado", async () => {
    // Mesma regra do `commissionPct`: a fila offline e a assistente concluem
    // sem informar, e apagar por omissão seria pior do que não ter o campo.
    const { os } = await cenario(90)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Primeira", ITENS, false, null, 365)
    await completeServiceOrder(os.id, "Reeditada", ITENS, false)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.warrantyDays).toBe(365)
  })

  it("valor negativo vira nulo, e não uma garantia que já venceu", async () => {
    const { os } = await cenario(90)
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Feito", ITENS, false, null, -30)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.warrantyDays).toBeNull()
  })
})

describe("o diálogo de conclusão oferece o campo", () => {
  // Estrutural, e pelo mesmo motivo do teste do responsável: a Action sempre
  // soube gravar — o que faltava era a TELA. Um teste só de Action passaria com
  // o campo ausente, que foi exatamente o que aconteceu por meses.
  it("conclude-dialog.tsx tem o campo de garantia", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/service-orders/conclude-dialog.tsx", "utf-8")
    )
    expect(fonte).toContain('id="warrantyDays"')
    expect(fonte).toMatch(/initialWarrantyDays/)
  })

  it("a tela da OS passa o prazo gravado e o padrão da empresa", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/(dashboard)/service-orders/[id]/page.tsx", "utf-8")
    )
    expect(fonte).toContain("initialWarrantyDays={os.warrantyDays}")
    expect(fonte).toContain("padraoDeGarantia=")
  })
})
