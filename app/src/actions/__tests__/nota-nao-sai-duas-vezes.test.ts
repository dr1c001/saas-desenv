import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { RecusaExterna } from "@/lib/tempo-limite"

// A nota fiscal não sai duas vezes para a mesma OS.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `emitNfse` chamava a nfe.io — que cria um documento fiscal DE VERDADE, sem
// cancelamento no produto — e só DEPOIS gravava `nfseId`, a marca que impede a
// segunda emissão. Entre as duas não havia nada.
//
// Dois caminhos reais para a nota duplicada:
//   - a nfe.io demora mais que o limite da função: a nota é criada lá, o update
//     nunca roda, o botão mostra erro, e a pessoa clica de novo;
//   - o dono e o administrador abrem a mesma OS: os dois passam pela checagem
//     de `order.nfseId` (ainda nulo) e os dois emitem.
//
// A correção é reservar antes de chamar: um `updateMany` condicionado a
// `nfseId: null`. O Postgres decide quem chega primeiro e o segundo recebe
// `count: 0`. (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockEmitir = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    checarAcao: vi.fn().mockResolvedValue(null),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    requireCotaDeNfse: vi.fn().mockResolvedValue(undefined),
    inicioDoMesDaCota: () => new Date(0),
  }))
  vi.doMock("@/lib/nfeio", () => ({ nfeio: { emitNfse: mockEmitir, getNfse: vi.fn() } }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  mockEmitir.mockReset().mockResolvedValue({
    id: "nf-1",
    flowStatus: "Issued",
    number: "123",
    pdfUrl: "http://x/p.pdf",
    xmlUrl: "http://x/x.xml",
  })
})

const acoes = () => import("@/actions/nfse")

async function cenario() {
  const tenant = await testDb.db.tenant.create({
    data: {
      name: "Polar Clima",
      nfeioCompanyId: "emp-1",
      fiscalIssRate: 5,
      fiscalMunicipalCode: "3550308",
    },
  })
  const dono = await testDb.db.user.create({
    data: { id: "dono", tenantId: tenant.id, name: "Adriel", email: "d@ex.com", role: "OWNER" },
  })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Dona Maria", document: "12345678909" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      number: 1,
      title: "Troca de compressor",
      status: "DONE",
      totalAmount: 1200,
    },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: dono.id, role: "OWNER" })
  return { tenant, os, cliente }
}

describe("emitir nota fiscal", () => {
  it("duas chamadas ao mesmo tempo emitem UMA nota só", async () => {
    // O caso dos dois usuários na mesma OS. Antes, as duas passavam pela
    // checagem de nfseId e as duas chamavam a nfe.io.
    const { os } = await cenario()
    const { emitNfse } = await acoes()

    const resultados = await Promise.allSettled([emitNfse(os.id), emitNfse(os.id)])

    const ok = resultados.filter((r) => r.status === "fulfilled").length
    expect(ok).toBe(1)
    expect(mockEmitir).toHaveBeenCalledTimes(1)
  })

  it("a segunda tentativa, depois de emitida, é recusada", async () => {
    const { os } = await cenario()
    const { emitNfse } = await acoes()

    await emitNfse(os.id)
    await expect(emitNfse(os.id)).rejects.toThrow()
    expect(mockEmitir).toHaveBeenCalledTimes(1)
  })

  it("a OS fica com o id REAL da nota, não com a reserva", async () => {
    // A reserva é um marcador temporário. Se ela sobrevivesse, a OS ficaria
    // com um "nfseId" que não corresponde a nota nenhuma.
    const { os } = await cenario()
    const { emitNfse } = await acoes()

    await emitNfse(os.id)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.nfseId).toBe("nf-1")
    expect(depois?.nfseNumber).toBe("123")
  })

  it("recusa da nfe.io DEVOLVE a reserva, para dar para tentar de novo", async () => {
    // Sem isto, um erro da prefeitura deixaria a OS travada para sempre com uma
    // reserva que não é nota nenhuma. RECUSA é o emissor respondendo "não"
    // (HTTP 4xx) — a única falha em que se sabe que nada foi criado lá.
    const { os } = await cenario()
    mockEmitir.mockRejectedValueOnce(new RecusaExterna("nfe.io /serviceinvoices", 400, "CNPJ do tomador inválido"))
    const { emitNfse } = await acoes()

    await expect(emitNfse(os.id)).rejects.toThrow("CNPJ do tomador inválido")

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.nfseId).toBeNull()

    // E a tentativa seguinte funciona.
    await emitNfse(os.id)
    expect((await testDb.db.serviceOrder.findUnique({ where: { id: os.id } }))?.nfseId).toBe("nf-1")
  })

  it.each([
    ["timeout", Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })],
    ["socket caído DEPOIS do POST", Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_SOCKET" } })],
    ["502 de gateway", new RecusaExterna("nfe.io /serviceinvoices", 502, "Bad Gateway")],
    ["JSON malformado num 200", new SyntaxError("Unexpected token < in JSON")],
  ])("%s MANTÉM a reserva — a nota pode ter saído, e ninguém desfaz nota fiscal", async (_, erro) => {
    // lib/nfeio.ts tem timeout desde 15/09/2026, e "não sei se saiu" virou
    // rotina. Soltar a reserva num "não sei" é emitir a segunda nota no clique
    // seguinte. A OS trava, e o suporte destrava. (Auditoria de 13/09/2026.)
    const { os } = await cenario()
    mockEmitir.mockRejectedValueOnce(erro)
    const { emitNfse } = await acoes()

    await expect(emitNfse(os.id)).rejects.toThrow("nfseSemResposta")

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.nfseId).toBe(`reservando:${os.id}`)

    // E a tentativa seguinte NÃO emite de novo: a reserva barra.
    await expect(emitNfse(os.id)).rejects.toThrow()
    expect(mockEmitir).toHaveBeenCalledTimes(1)
  })
})
