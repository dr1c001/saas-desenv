import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A metade que faltava da emissão. Sem esta rotina, a OS ficava marcada como
// FATURADA mesmo quando a prefeitura rejeitava a nota — receita lançada no
// financeiro, documento fiscal nenhum, e ninguém sabendo.

let testDb: TestDatabase
const mockGetInvoice = vi.fn()
const mockNotificar = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/nfeio", () => ({ nfeio: { getInvoice: mockGetInvoice } }))
  vi.doMock("@/lib/notificar", () => ({ notificar: mockNotificar }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetInvoice.mockReset()
  mockNotificar.mockReset().mockResolvedValue(undefined)
})

async function osComNota(nfseStatus: string | null, nfseChecks = 0) {
  const tenant = await testDb.db.tenant.create({
    data: { name: "Empresa", nfeioCompanyId: "co-1" },
  })
  const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C" } })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id, clientId: cliente.id, number: 1, title: "Troca da bomba",
      status: "INVOICED", nfseId: "nf-1", nfseStatus, nfseChecks,
      nfseIssuedAt: new Date("2026-08-20T12:00:00Z"),
    },
  })
  return { tenant, os }
}

const releu = (id: string) => testDb.db.serviceOrder.findUnique({ where: { id } })

describe("conciliação das notas pendentes", () => {
  it("a nota que a prefeitura aceitou ganha número e link do PDF", async () => {
    // O link ficava NULO porque o PDF não existe no instante da emissão — só
    // depois de a prefeitura aceitar.
    const { os } = await osComNota("Processing")
    mockGetInvoice.mockResolvedValue({
      id: "nf-1", flowStatus: "Issued", number: "2026/123", pdf: { url: "https://x/nota.pdf" },
    })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.emitidas).toBe(1)
    const depois = await releu(os.id)
    expect(depois!.nfseNumber).toBe("2026/123")
    expect(depois!.nfseUrl).toBe("https://x/nota.pdf")
  })

  it("nota RECUSADA avisa o escritório", async () => {
    // O ponto inteiro da rotina: recusa precisa chegar em alguém. Antes a OS
    // ficava faturada e a nota simplesmente não existia.
    const { os, tenant } = await osComNota("Processing")
    mockGetInvoice.mockResolvedValue({ id: "nf-1", flowStatus: "IssueFailed" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.rejeitadas).toBe(1)
    expect(mockNotificar).toHaveBeenCalledWith(
      expect.objectContaining({ evento: "notaRejeitada", tenantId: tenant.id })
    )
    expect((await releu(os.id))!.nfseStatus).toBe("IssueFailed")
  })

  it("nota já resolvida não é consultada de novo", async () => {
    await osComNota("Issued")
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.consultadas).toBe(0)
    expect(mockGetInvoice).not.toHaveBeenCalled()
  })

  it("desiste depois do teto de tentativas", async () => {
    // Nota parada há um mês precisa de alguém olhando, não de mais uma
    // consulta diária para sempre.
    const { MAX_CONSULTAS } = await import("@/lib/nfse-status")
    await osComNota("Processing", MAX_CONSULTAS)
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    expect((await conciliarNotasPendentes()).consultadas).toBe(0)
    expect(mockGetInvoice).not.toHaveBeenCalled()
  })

  it("erro na consulta CONTA a tentativa", async () => {
    // Senão uma nota cujo id o emissor não reconhece seria consultada todo
    // dia, para sempre.
    const { os } = await osComNota("Processing")
    mockGetInvoice.mockRejectedValue(new Error("404"))
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.erros).toBe(1)
    expect((await releu(os.id))!.nfseChecks).toBe(1)
  })

  it("estado desconhecido continua pendente, e não vira 'deu certo'", async () => {
    await osComNota("Processing")
    mockGetInvoice.mockResolvedValue({ id: "nf-1", flowStatus: "EstadoNovoDoEmissor" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.emitidas).toBe(0)
    expect(r.rejeitadas).toBe(0)
    expect(mockNotificar).not.toHaveBeenCalled()
  })

  it("OS sem nota não entra na conciliação", async () => {
    const t = await testDb.db.tenant.create({ data: { name: "E" } })
    const c = await testDb.db.client.create({ data: { tenantId: t.id, name: "C" } })
    await testDb.db.serviceOrder.create({
      data: { tenantId: t.id, clientId: c.id, number: 1, title: "Sem nota" },
    })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    expect((await conciliarNotasPendentes()).consultadas).toBe(0)
  })
})

describe("coerência entre o filtro do banco e a regra", () => {
  it("todo estado tratado como final pelo filtro é final pela regra", async () => {
    // O filtro usa a grafia do emissor para não trazer nota resolvida do
    // banco. Se as duas listas divergirem, nota resolvida volta a ser
    // consultada (barato) ou pendente para de ser (caro).
    const { estadosFinaisConferem } = await import("@/lib/nfse-conciliar")
    expect(estadosFinaisConferem()).toBe(true)
  })
})
