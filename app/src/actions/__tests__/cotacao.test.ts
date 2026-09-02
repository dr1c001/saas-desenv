import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A cotação, de ponta a ponta.
//
// A comparação pura está em cotacao.test.ts. O que se prova AQUI é o caminho
// que envolve banco: criar, lançar preços, e o fechamento gerando a ordem de
// compra COM OS PREÇOS COTADOS — que é o ponto da funcionalidade inteira. Sem
// isso, o dono compara na tela e redigita o número na compra, que é onde ele
// erra justamente o preço que acabou de escolher.

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

const acoes = () => import("@/actions/cotacao")

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })

  const [p1, p2] = await Promise.all([
    testDb.db.part.create({ data: { tenantId: tenant.id, name: "Compressor" } }),
    testDb.db.part.create({ data: { tenantId: tenant.id, name: "Filtro" } }),
  ])
  const [f1, f2] = await Promise.all([
    testDb.db.supplier.create({ data: { tenantId: tenant.id, name: "Frio Total" } }),
    testDb.db.supplier.create({ data: { tenantId: tenant.id, name: "Refrisul" } }),
  ])
  return { tenant, p1, p2, f1, f2 }
}

function formCriar(pecas: { id: string; q: number }[], fornecedores: string[], titulo = "Reposição") {
  const fd = new FormData()
  fd.set("title", titulo)
  for (const p of pecas) {
    fd.append("partId", p.id)
    fd.append("quantidade", String(p.q))
  }
  for (const f of fornecedores) fd.append("supplierId", f)
  return fd
}

describe("criar a cotação", () => {
  it("guarda itens e fornecedores", async () => {
    const { p1, p2, f1, f2 } = await cenario()
    const r = await (await acoes()).criarCotacao({}, formCriar([{ id: p1.id, q: 2 }, { id: p2.id, q: 10 }], [f1.id, f2.id]))

    expect(r.erro).toBeUndefined()
    const c = await testDb.db.quotation.findUnique({
      where: { id: r.id! },
      include: { items: true, participants: true },
    })
    expect(c!.items).toHaveLength(2)
    expect(c!.participants).toHaveLength(2)
    expect(c!.status).toBe("ABERTA")
  })

  it("recusa cotação sem fornecedor", async () => {
    // Cotação com zero fornecedores não compara nada.
    const { p1 } = await cenario()
    const r = await (await acoes()).criarCotacao({}, formCriar([{ id: p1.id, q: 1 }], []))
    expect(r.erro).toBe("semFornecedores")
  })

  it("recusa peça de OUTRA empresa", async () => {
    // Sem esta checagem a cotação nasceria com peça alheia, e a compra gerada
    // no fim mexeria no estoque de outra empresa.
    const { f1 } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const dela = await testDb.db.part.create({ data: { tenantId: outra.id, name: "Alheia" } })

    const r = await (await acoes()).criarCotacao({}, formCriar([{ id: dela.id, q: 1 }], [f1.id]))
    expect(r.erro).toBe("pecaInvalida")
  })

  it("soma a mesma peça repetida em vez de duplicar", async () => {
    // A unicidade no banco recusaria, mas com um erro que não diz nada ao
    // usuário. Somar é o que ele quis dizer.
    const { p1, f1 } = await cenario()
    const r = await (await acoes()).criarCotacao(
      {},
      formCriar([{ id: p1.id, q: 2 }, { id: p1.id, q: 3 }], [f1.id])
    )
    expect(r.erro).toBeUndefined()
    const itens = await testDb.db.quotationItem.findMany({ where: { quotationId: r.id! } })
    expect(itens).toHaveLength(1)
    expect(Number(itens[0].quantity)).toBe(5)
  })
})

describe("lançar preços", () => {
  it("grava e permite corrigir depois", async () => {
    const { p1, f1 } = await cenario()
    const c = await (await acoes()).criarCotacao({}, formCriar([{ id: p1.id, q: 2 }], [f1.id]))
    const part = (await testDb.db.quotationParticipant.findFirst({ where: { quotationId: c.id! } }))!
    const item = (await testDb.db.quotationItem.findFirst({ where: { quotationId: c.id! } }))!

    const fd = new FormData()
    fd.set(`preco_${item.id}`, "900")
    await (await acoes()).salvarPrecos(part.id, {}, fd)

    let precos = await testDb.db.quotationPrice.findMany({ where: { participantId: part.id } })
    expect(Number(precos[0].unitPrice)).toBe(900)

    // Correção: o fornecedor ligou de novo com outro preço.
    const fd2 = new FormData()
    fd2.set(`preco_${item.id}`, "850")
    await (await acoes()).salvarPrecos(part.id, {}, fd2)

    precos = await testDb.db.quotationPrice.findMany({ where: { participantId: part.id } })
    expect(precos).toHaveLength(1)
    expect(Number(precos[0].unitPrice)).toBe(850)
  })

  it("campo VAZIO apaga o preço, e não grava zero", async () => {
    // "Não tenho essa peça" e "é de graça" são coisas diferentes: zero
    // venceria a comparação e faria o sistema recomendar quem não tem o
    // produto.
    const { p1, f1 } = await cenario()
    const c = await (await acoes()).criarCotacao({}, formCriar([{ id: p1.id, q: 2 }], [f1.id]))
    const part = (await testDb.db.quotationParticipant.findFirst({ where: { quotationId: c.id! } }))!
    const item = (await testDb.db.quotationItem.findFirst({ where: { quotationId: c.id! } }))!

    const fd = new FormData()
    fd.set(`preco_${item.id}`, "900")
    await (await acoes()).salvarPrecos(part.id, {}, fd)

    const fd2 = new FormData()
    fd2.set(`preco_${item.id}`, "")
    await (await acoes()).salvarPrecos(part.id, {}, fd2)

    expect(await testDb.db.quotationPrice.findMany({ where: { participantId: part.id } })).toEqual([])
  })

  it("cotação de OUTRA empresa não aceita preço", async () => {
    const { p1, f1 } = await cenario()
    const c = await (await acoes()).criarCotacao({}, formCriar([{ id: p1.id, q: 2 }], [f1.id]))
    const part = (await testDb.db.quotationParticipant.findFirst({ where: { quotationId: c.id! } }))!

    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    mockGetTenant.mockResolvedValue({ tenantId: outra.id, userId: "u9", role: "OWNER" })

    const r = await (await acoes()).salvarPrecos(part.id, {}, new FormData())
    expect(r.erro).toBe("naoEncontrado")
  })
})

describe("fechar a cotação", () => {
  async function comPrecos() {
    const { p1, p2, f1, f2 } = await cenario()
    const c = await (await acoes()).criarCotacao(
      {},
      formCriar([{ id: p1.id, q: 2 }, { id: p2.id, q: 10 }], [f1.id, f2.id])
    )
    const parts = await testDb.db.quotationParticipant.findMany({
      where: { quotationId: c.id! },
      include: { supplier: true },
      orderBy: { id: "asc" },
    })
    const itens = await testDb.db.quotationItem.findMany({
      where: { quotationId: c.id! },
      orderBy: { id: "asc" },
    })

    // Frio Total cota os dois; Refrisul só o primeiro.
    const fdA = new FormData()
    fdA.set(`preco_${itens[0].id}`, "900")
    fdA.set(`preco_${itens[1].id}`, "30")
    await (await acoes()).salvarPrecos(parts[0].id, {}, fdA)

    const fdB = new FormData()
    fdB.set(`preco_${itens[0].id}`, "880")
    await (await acoes()).salvarPrecos(parts[1].id, {}, fdB)

    return { quotationId: c.id!, parts, itens }
  }

  it("gera a ordem de compra COM OS PREÇOS COTADOS", async () => {
    // O ponto da funcionalidade inteira: o número que o fornecedor deu vira o
    // número da ordem, sem redigitação.
    const { quotationId, parts } = await comPrecos()
    const r = await (await acoes()).fecharCotacao(quotationId, parts[0].id)

    expect(r.erro).toBeUndefined()
    const compra = await testDb.db.purchaseOrder.findUnique({
      where: { id: r.id! },
      include: { items: { orderBy: { id: "asc" } } },
    })
    expect(compra!.status).toBe("RASCUNHO")
    expect(compra!.supplierId).toBe(parts[0].supplierId)
    expect(compra!.items).toHaveLength(2)
    expect(Number(compra!.items[0].unitCost)).toBe(900)
    // 900×2 + 30×10 = 2100
    expect(Number(compra!.total)).toBe(2100)
  })

  it("leva SÓ os itens que aquele fornecedor cotou", async () => {
    // Levar os outros criaria linhas com preço zero que ninguém combinou.
    const { quotationId, parts } = await comPrecos()
    const r = await (await acoes()).fecharCotacao(quotationId, parts[1].id)

    const compra = await testDb.db.purchaseOrder.findUnique({
      where: { id: r.id! },
      include: { items: true },
    })
    expect(compra!.items).toHaveLength(1)
    expect(Number(compra!.items[0].unitCost)).toBe(880)
  })

  it("marca a cotação como fechada, com o vencedor", async () => {
    const { quotationId, parts } = await comPrecos()
    await (await acoes()).fecharCotacao(quotationId, parts[0].id)

    const c = await testDb.db.quotation.findUnique({ where: { id: quotationId } })
    expect(c!.status).toBe("FECHADA")
    expect(c!.winnerId).toBe(parts[0].id)
    expect(c!.closedAt).not.toBeNull()
  })

  it("NÃO fecha com quem não cotou nada", async () => {
    // Geraria uma ordem de compra vazia, e o dono descobriria só na tela
    // seguinte.
    const { p1, f1, f2 } = await cenario()
    const c = await (await acoes()).criarCotacao({}, formCriar([{ id: p1.id, q: 1 }], [f1.id, f2.id]))
    const parts = await testDb.db.quotationParticipant.findMany({
      where: { quotationId: c.id! },
      orderBy: { id: "asc" },
    })

    const r = await (await acoes()).fecharCotacao(c.id!, parts[0].id)
    expect(r.erro).toBe("fornecedorSemPreco")
    expect(await testDb.db.purchaseOrder.count()).toBe(0)
  })

  it("cotação já fechada não fecha de novo", async () => {
    // Fecharia duas vezes e geraria duas ordens de compra do mesmo pedido.
    const { quotationId, parts } = await comPrecos()
    await (await acoes()).fecharCotacao(quotationId, parts[0].id)
    const r = await (await acoes()).fecharCotacao(quotationId, parts[1].id)

    expect(r.erro).toBe("cotacaoFechada")
    expect(await testDb.db.purchaseOrder.count()).toBe(1)
  })

  it("fechada não aceita mais preço", async () => {
    const { quotationId, parts, itens } = await comPrecos()
    await (await acoes()).fecharCotacao(quotationId, parts[0].id)

    const fd = new FormData()
    fd.set(`preco_${itens[0].id}`, "1")
    const r = await (await acoes()).salvarPrecos(parts[0].id, {}, fd)
    expect(r.erro).toBe("cotacaoFechada")
  })
})

describe("o que a revisão adversarial achou", () => {
  // A guarda de status ficava FORA da transação, e o update gravava por id
  // puro. Dois administradores na mesma tela — ou um clique reenviado antes do
  // redirect — passavam os dois pela guarda e criavam DUAS ordens de compra
  // idênticas. Recebidas, elas dobrariam estoque E despesa.

  async function comPrecos() {
    const { p1, f1, f2 } = await cenario()
    const c = await (await acoes()).criarCotacao({}, formCriar([{ id: p1.id, q: 2 }], [f1.id, f2.id]))
    const parts = await testDb.db.quotationParticipant.findMany({
      where: { quotationId: c.id! },
      orderBy: { id: "asc" },
    })
    const item = (await testDb.db.quotationItem.findFirst({ where: { quotationId: c.id! } }))!
    const fd = new FormData()
    fd.set(`preco_${item.id}`, "900")
    await (await acoes()).salvarPrecos(parts[0].id, {}, fd)
    const fd2 = new FormData()
    fd2.set(`preco_${item.id}`, "880")
    await (await acoes()).salvarPrecos(parts[1].id, {}, fd2)
    return { quotationId: c.id!, parts }
  }

  it("dois fechamentos SIMULTÂNEOS geram UMA ordem de compra só", async () => {
    const { quotationId, parts } = await comPrecos()
    const f = (await acoes()).fecharCotacao

    // Sem `await` entre elas: as duas leem o status ABERTA antes de qualquer
    // escrita, que é exatamente a corrida do mundo real.
    const [a, b] = await Promise.all([
      f(quotationId, parts[0].id),
      f(quotationId, parts[1].id),
    ])

    const ganhou = [a, b].filter((r) => r.ok)
    const perdeu = [a, b].filter((r) => r.erro === "cotacaoFechada")
    expect(ganhou).toHaveLength(1)
    expect(perdeu).toHaveLength(1)

    // A trava que importa: uma cotação, uma compra.
    expect(await testDb.db.purchaseOrder.count()).toBe(1)
  })

  it("a perdedora não deixa ordem de compra órfã", async () => {
    // A transação inteira é desfeita, então não sobra compra pela metade nem
    // número de compra queimado com uma linha inexistente.
    const { quotationId, parts } = await comPrecos()
    const f = (await acoes()).fecharCotacao
    await Promise.all([f(quotationId, parts[0].id), f(quotationId, parts[1].id)])

    const compras = await testDb.db.purchaseOrder.findMany({ include: { items: true } })
    expect(compras).toHaveLength(1)
    expect(compras[0].items.length).toBeGreaterThan(0)
  })

  it("a cotação fica com UM vencedor, o que de fato comprou", async () => {
    const { quotationId, parts } = await comPrecos()
    const f = (await acoes()).fecharCotacao
    const [a, b] = await Promise.all([f(quotationId, parts[0].id), f(quotationId, parts[1].id)])

    const vencedora = a.ok ? parts[0].id : parts[1].id
    const c = await testDb.db.quotation.findUnique({ where: { id: quotationId } })
    expect(c!.status).toBe("FECHADA")
    expect(c!.winnerId).toBe(vencedora)

    const compra = await testDb.db.purchaseOrder.findFirst()
    const part = parts.find((p) => p.id === vencedora)!
    expect(compra!.supplierId).toBe(part.supplierId)
  })
})
