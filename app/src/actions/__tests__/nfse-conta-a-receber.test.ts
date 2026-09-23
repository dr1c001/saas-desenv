import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Emitir a nota fiscal cria a CONTA A RECEBER.
//
// ─── O achado ────────────────────────────────────────────────────────────────
//
// `emitNfse` deixava a OS FATURADA e não criava receita nenhuma. E os outros
// dois caminhos de faturamento não consertam depois: `updateOrderStatus` recusa
// OS que já está INVOICED, então a receita nunca mais nascia.
//
// O resultado era o pior possível: nota fiscal emitida de verdade, documento na
// mão do cliente, e o serviço invisível no contas a receber — logo, mudo para a
// régua de cobrança. O serviço mais real que existe era justamente o único que
// ninguém cobrava.
//
// O teste chama a ação DE VERDADE, com o emissor fiscal simulado. Replicar o
// bloco de criação no teste provaria a réplica, e não o código.

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockEmitir = vi.fn()

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
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
  // O emissor fiscal: a nota NÃO é emitida de verdade num teste.
  vi.doMock("@/lib/nfeio", () => ({ nfeio: { emitNfse: mockEmitir } }))
  // Fora do que se testa aqui.
  vi.doMock("@/lib/comissao-db", () => ({ reconciliarComissao: vi.fn() }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  mockEmitir.mockReset().mockResolvedValue({
    id: "nf-1",
    flowStatus: "Processing",
    number: null,
    pdf: null,
  })
})

const execucao = new Date("2026-09-10T12:00:00Z")

async function cenario(opts: { total?: number } = {}) {
  const tenant = await testDb.db.tenant.create({
    data: {
      name: "Polar Clima",
      nfeioCompanyId: "empresa-no-emissor",
      fiscalIssRate: 5,
    },
  })
  const cliente = await testDb.db.client.create({
    data: {
      tenantId: tenant.id,
      name: "Auto Posto Rodovia",
      document: "12345678000199",
      email: "posto@ex.com",
    },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      number: 77,
      title: "Desentupimento",
      clientId: cliente.id,
      status: "DONE",
      totalAmount: opts.total ?? 1200,
      concludedAt: execucao,
      items: { create: [{ description: "Serviço", quantity: 1, unitPrice: 1200, total: 1200 }] },
    },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER", branchId: null })
  return { tenant, cliente, os }
}

const acao = () => import("@/actions/nfse")

async function recebimentos(orderId: string) {
  return testDb.db.revenue.findMany({ where: { orderId }, orderBy: { dueDate: "asc" } })
}

describe("emitir a nota deixa o serviço COBRÁVEL", () => {
  it("cria a conta a receber com o valor da OS", async () => {
    const { os } = await cenario()
    const { emitNfse } = await acao()

    await emitNfse(os.id)

    const linhas = await recebimentos(os.id)
    expect(linhas).toHaveLength(1)
    expect(Number(linhas[0].amount)).toBe(1200)
    expect(linhas[0].status).toBe("PENDING")
  })

  it("com a competência na CONCLUSÃO, e não na emissão", async () => {
    // O serviço foi entregue naquele mês, e o resultado é dele — mesmo que a
    // nota só saia depois.
    const { os } = await cenario()
    const { emitNfse } = await acao()

    await emitNfse(os.id)

    expect((await recebimentos(os.id))[0].accrualDate?.getTime()).toBe(execucao.getTime())
  })

  it("a régua de cobrança passa a enxergar este serviço", async () => {
    // É o ponto inteiro. Sem receita, a cobrança automática nunca vê a OS —
    // e era o caso do serviço com nota fiscal emitida, o mais real de todos.
    const { tenant, os } = await cenario()
    const { emitNfse } = await acao()

    await emitNfse(os.id)

    const cobraveis = await testDb.db.revenue.findMany({
      where: { tenantId: tenant.id, status: { not: "PAID" }, paidAt: null, orderId: { not: null } },
    })
    expect(cobraveis).toHaveLength(1)
  })

  it("a dobra é impedida ANTES: a ação recusa reemitir a mesma nota", async () => {
    // A idempotência da receita existe no código (consulta antes de criar), mas
    // o guarda que realmente conta está mais acima: uma OS que já tem nota não
    // emite outra. Escrever o teste esperando duas emissões me mostrou isso —
    // o cenário que eu imaginava não é alcançável.
    const { os } = await cenario()
    const { emitNfse } = await acao()
    await emitNfse(os.id)

    await expect(emitNfse(os.id)).rejects.toThrow()

    expect(await recebimentos(os.id)).toHaveLength(1)
  })

  it("OS sem valor não emite nota, então também não gera cobrança", async () => {
    // Outra recusa que vem de cima: nota de R$ 0,00 não existe. A conta a
    // receber zerada, que seria ruído no financeiro, nem chega a ser cogitada.
    const { os } = await cenario({ total: 0 })
    const { emitNfse } = await acao()

    await expect(emitNfse(os.id)).rejects.toThrow()

    expect(await recebimentos(os.id)).toHaveLength(0)
  })

  it("a OS fica faturada, como antes", async () => {
    const { os } = await cenario()
    const { emitNfse } = await acao()

    await emitNfse(os.id)

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.status).toBe("INVOICED")
    expect(depois?.nfseId).toBe("nf-1")
  })
})
