import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O DEFEITO que este arquivo guarda: até 01/09/2026 a compra entrava no
// estoque e NÃO saía do caixa.
//
// A empresa comprava R$ 2.400 em peças, o saldo subia, e o Financeiro não
// ficava sabendo. O dinheiro saiu do mundo real e não saiu do sistema — o lucro
// na tela era maior que o lucro de verdade. Estoque que engorda sem despesa
// correspondente é a forma mais silenciosa de um sistema mentir sobre o
// resultado do mês.
//
// As contas puras estão em compras-dinheiro.test.ts. O que se prova AQUI é que
// o recebimento realmente grava a despesa, no valor certo, na mesma transação
// do estoque.

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
  }))
  // O estoque é Pro+; aqui o assunto é o dinheiro, não a trava de plano
  // (que tem os testes dela em travas-de-plano.test.ts).
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const receber = async () => (await import("@/actions/compras")).receberCompra

async function cenario(opcoes: { custoAnterior?: number; estoqueAnterior?: number } = {}) {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  // Usuário de VERDADE: `StockMovement.userId` tem chave estrangeira, e um id
  // inventado derruba o movimento inteiro.
  const dono = await testDb.db.user.create({
    data: { id: "u1", tenantId: tenant.id, name: "Adriel", email: "d@ex.com", role: "OWNER" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: dono.id, role: "OWNER" })

  const fornecedor = await testDb.db.supplier.create({
    data: { tenantId: tenant.id, name: "Distribuidora Frio" },
  })
  const peca = await testDb.db.part.create({
    data: {
      tenantId: tenant.id,
      name: "Compressor 2HP",
      stock: opcoes.estoqueAnterior ?? 0,
      costPrice: opcoes.custoAnterior ?? null,
    },
  })
  const compra = await testDb.db.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      number: 1,
      supplierId: fornecedor.id,
      status: "ENVIADA",
      total: 2400,
      items: { create: [{ partId: peca.id, quantity: 10, unitCost: 240, total: 2400 }] },
    },
    include: { items: true },
  })
  return { tenant, peca, compra, item: compra.items[0] }
}

/** O formulário do recebimento, como a tela manda. */
function form(itemId: string, quantidade: number, extra: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set(`recebido_${itemId}`, String(quantidade))
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  return fd
}

const despesas = (tenantId: string) =>
  testDb.db.expense.findMany({ where: { tenantId }, orderBy: { dueDate: "asc" } })

describe("a compra vira despesa", () => {
  it("recebimento total gera a despesa do valor cheio", async () => {
    const { tenant, compra, item } = await cenario()
    const r = await (await receber())(compra.id, {}, form(item.id, 10))
    expect(r.erro).toBeUndefined()

    const d = await despesas(tenant.id)
    expect(d).toHaveLength(1)
    expect(Number(d[0].amount)).toBe(2400)
    // Peça é custo que varia com o volume de serviço — não é aluguel.
    expect(d[0].category).toBe("VARIABLE")
    // O vínculo permite ir da despesa até a compra que a originou, e de volta.
    expect(d[0].purchaseOrderId).toBe(compra.id)
  })

  it("a descrição diz de qual compra e de qual fornecedor", async () => {
    // Uma despesa "Compra" no meio de trinta linhas do Financeiro não ajuda
    // ninguém a lembrar do que se tratava.
    const { tenant, compra, item } = await cenario()
    await (await receber())(compra.id, {}, form(item.id, 10))
    const d = await despesas(tenant.id)
    expect(d[0].description).toContain("#1")
    expect(d[0].description).toContain("Distribuidora Frio")
  })

  it("recebimento PARCIAL gera despesa só do que chegou", async () => {
    // Numa compra parcial paga-se o que foi entregue. Lançar o total inteiro
    // registraria dinheiro que ainda não saiu.
    const { tenant, compra, item } = await cenario()
    await (await receber())(compra.id, {}, form(item.id, 4))

    const d = await despesas(tenant.id)
    expect(d).toHaveLength(1)
    expect(Number(d[0].amount)).toBe(960) // 4 × 240
  })

  it("cada recebimento gera a SUA despesa", async () => {
    const { tenant, compra, item } = await cenario()
    await (await receber())(compra.id, {}, form(item.id, 4))
    await (await receber())(compra.id, {}, form(item.id, 6))

    const d = await despesas(tenant.id)
    expect(d).toHaveLength(2)
    expect(d.reduce((s, x) => s + Number(x.amount), 0)).toBe(2400)
  })
})

describe("prazo e parcelas", () => {
  it("sem informar nada, vence hoje em uma parcela", async () => {
    // O comportamento de quem paga à vista, que é o caso mais comum.
    const { tenant, compra, item } = await cenario()
    await (await receber())(compra.id, {}, form(item.id, 10))

    const d = await despesas(tenant.id)
    expect(d).toHaveLength(1)
    const hoje = new Date().toISOString().slice(0, 10)
    expect(d[0].dueDate.toISOString().slice(0, 10)).toBe(hoje)
  })

  it("três parcelas geram três despesas que somam o total", async () => {
    const { tenant, compra, item } = await cenario()
    await (await receber())(
      compra.id,
      {},
      form(item.id, 10, { parcelas: "3", primeiroVencimento: "2026-10-05" })
    )

    const d = await despesas(tenant.id)
    expect(d).toHaveLength(3)
    // A soma tem de fechar EXATO: o centavo perdido no arredondamento
    // reaparece meses depois como diferença na conciliação.
    expect(d.reduce((s, x) => s + Number(x.amount), 0)).toBe(2400)
  })

  it("as parcelas vencem de mês em mês", async () => {
    const { tenant, compra, item } = await cenario()
    await (await receber())(
      compra.id,
      {},
      form(item.id, 10, { parcelas: "3", primeiroVencimento: "2026-10-05" })
    )

    const meses = (await despesas(tenant.id)).map((d) => d.dueDate.getMonth())
    expect(meses).toEqual([9, 10, 11]) // out, nov, dez
  })

  it("a parcela numerada aparece na descrição", async () => {
    const { tenant, compra, item } = await cenario()
    await (await receber())(
      compra.id,
      {},
      form(item.id, 10, { parcelas: "2", primeiroVencimento: "2026-10-05" })
    )
    const d = await despesas(tenant.id)
    expect(d[0].description).toContain("(1/2)")
    expect(d[1].description).toContain("(2/2)")
  })
})

describe("o custo médio da peça", () => {
  it("primeira compra: o custo é o da nota", async () => {
    const { peca, compra, item } = await cenario()
    await (await receber())(compra.id, {}, form(item.id, 10))

    const p = await testDb.db.part.findUnique({ where: { id: peca.id } })
    expect(Number(p!.costPrice)).toBe(240)
  })

  it("segunda compra: PONDERA com o que já havia", async () => {
    // O defeito que substitui: o custo era sobrescrito pela última nota. Com
    // 10 peças a R$ 80 em estoque e 10 novas a R$ 240, o custo verdadeiro é
    // R$ 160 — e não R$ 240, que faria a margem de todo serviço seguinte
    // aparecer menor do que é.
    const { peca, compra, item } = await cenario({ estoqueAnterior: 10, custoAnterior: 80 })
    await (await receber())(compra.id, {}, form(item.id, 10))

    const p = await testDb.db.part.findUnique({ where: { id: peca.id } })
    expect(Number(p!.costPrice)).toBe(160)
  })

  it("o estoque sobe junto, na mesma transação", async () => {
    const { peca, compra, item } = await cenario({ estoqueAnterior: 10, custoAnterior: 80 })
    await (await receber())(compra.id, {}, form(item.id, 10))

    const p = await testDb.db.part.findUnique({ where: { id: peca.id } })
    expect(Number(p!.stock)).toBe(20)
  })
})

describe("nada é gravado quando o recebimento é recusado", () => {
  it("compra cancelada não gera despesa", async () => {
    const { tenant, compra, item } = await cenario()
    await testDb.db.purchaseOrder.update({
      where: { id: compra.id },
      data: { status: "CANCELADA" },
    })

    const r = await (await receber())(compra.id, {}, form(item.id, 10))
    expect(r.erro).toBe("compraCancelada")
    expect(await despesas(tenant.id)).toEqual([])
  })

  it("compra de OUTRA empresa não é recebida", async () => {
    // Sem o filtro por tenant, um id vindo do formulário lançaria despesa e
    // estoque na empresa errada.
    const { compra, item } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const dela = await testDb.db.user.create({
      data: { id: "u9", tenantId: outra.id, name: "Outro", email: "o@ex.com", role: "OWNER" },
    })
    mockGetTenant.mockResolvedValue({ tenantId: outra.id, userId: dela.id, role: "OWNER" })

    const r = await (await receber())(compra.id, {}, form(item.id, 10))
    expect(r.erro).toBe("naoEncontrada")
    expect(await despesas(outra.id)).toEqual([])
  })
})
