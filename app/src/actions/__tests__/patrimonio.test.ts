import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O controle de bens, no banco.
//
// A depreciação pura está em patrimonio.test.ts. O que se prova AQUI é o que
// envolve escrita: cadastrar, dar baixa (que é o que PARA a depreciação),
// reativar, e a diferença entre BAIXAR e EXCLUIR — que é a diferença entre
// guardar a história e reescrevê-la.

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

const acoes = () => import("@/actions/patrimonio")

async function empresa(role = "OWNER") {
  const t = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const u = await testDb.db.user.create({
    data: { id: "u1", tenantId: t.id, name: "Adriel", email: "d@ex.com", role: "OWNER" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: t.id, userId: u.id, role })
  return { tenant: t, user: u }
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

const vanNova = {
  name: "Van Fiorino",
  category: "VEICULO",
  purchaseValue: "60000",
  purchasedAt: "2026-01-15",
}

describe("cadastrar", () => {
  it("grava o bem com os campos que a depreciação precisa", async () => {
    const { tenant } = await empresa()
    const r = await (await acoes()).salvarBem(null, {}, form(vanNova))

    expect(r.erro).toBeUndefined()
    const bem = await testDb.db.asset.findUnique({ where: { id: r.id! } })
    expect(bem!.tenantId).toBe(tenant.id)
    expect(Number(bem!.purchaseValue)).toBe(60000)
    expect(bem!.category).toBe("VEICULO")
    expect(bem!.status).toBe("ATIVO")
    // Taxa vazia = null, e null usa a padrão da categoria na hora de calcular.
    expect(bem!.annualRate).toBeNull()
  })

  it("exige nome e data da compra", async () => {
    await empresa()
    const a = await acoes()
    expect((await a.salvarBem(null, {}, form({ ...vanNova, name: "" }))).erro).toBe("nomeObrigatorio")
    expect((await a.salvarBem(null, {}, form({ ...vanNova, purchasedAt: "" }))).erro).toBe(
      "dataObrigatoria"
    )
  })

  it("aceita taxa própria e residual", async () => {
    await empresa()
    const r = await (await acoes()).salvarBem(
      null,
      {},
      form({ ...vanNova, annualRate: "25", residualValue: "8000" })
    )
    const bem = await testDb.db.asset.findUnique({ where: { id: r.id! } })
    expect(Number(bem!.annualRate)).toBe(25)
    expect(Number(bem!.residualValue)).toBe(8000)
  })

  it("taxa inválida vira null, e não quebra", async () => {
    // Campo mal preenchido cai na padrão da categoria — nunca numa taxa de
    // 500%, que depreciaria a van em dois meses e meio.
    await empresa()
    const r = await (await acoes()).salvarBem(null, {}, form({ ...vanNova, annualRate: "abc" }))
    const bem = await testDb.db.asset.findUnique({ where: { id: r.id! } })
    expect(bem!.annualRate).toBeNull()
  })

  it("recusa local de OUTRA empresa", async () => {
    // Ligaria o bem a uma van que ele nunca vai encontrar na tela.
    await empresa()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const local = await testDb.db.stockLocation.create({
      data: { tenantId: outra.id, name: "Almoxarifado alheio" },
    })
    const r = await (await acoes()).salvarBem(null, {}, form({ ...vanNova, locationId: local.id }))
    expect(r.erro).toBe("localInvalido")
  })

  it("recusa responsável de OUTRA empresa", async () => {
    await empresa()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const pessoa = await testDb.db.user.create({
      data: { id: "u9", tenantId: outra.id, name: "Alheio", email: "a@ex.com", role: "TECHNICIAN" },
    })
    const r = await (await acoes()).salvarBem(
      null,
      {},
      form({ ...vanNova, responsibleId: pessoa.id })
    )
    expect(r.erro).toBe("pessoaInvalida")
  })

  it("técnico não cadastra bem", async () => {
    await empresa("TECHNICIAN")
    const r = await (await acoes()).salvarBem(null, {}, form(vanNova))
    expect(r.erro).toBe("semPermissao")
    expect(await testDb.db.asset.count()).toBe(0)
  })
})

describe("dar baixa", () => {
  it("marca a data, e é ela que PARA a depreciação", async () => {
    await empresa()
    const a = await acoes()
    const criado = await a.salvarBem(null, {}, form(vanNova))

    const r = await a.darBaixa(criado.id!, {}, form({ disposedAt: "2026-07-15", disposalNotes: "Vendida" }))
    expect(r.erro).toBeUndefined()

    const bem = await testDb.db.asset.findUnique({ where: { id: criado.id! } })
    expect(bem!.status).toBe("BAIXADO")
    expect(bem!.disposedAt!.toISOString().slice(0, 10)).toBe("2026-07-15")
    expect(bem!.disposalNotes).toBe("Vendida")

    // E o resumo deixa de contá-lo: ele não é mais da empresa.
    const resumo = await a.getResumoDoPatrimonio()
    expect(resumo.quantidade).toBe(0)
    expect(resumo.totalContabil).toBe(0)
  })

  it("recusa baixa ANTES da compra", async () => {
    // Produziria depreciação negativa. O banco também recusa (CHECK), mas aqui
    // a mensagem explica o que houve.
    await empresa()
    const a = await acoes()
    const criado = await a.salvarBem(null, {}, form(vanNova))
    const r = await a.darBaixa(criado.id!, {}, form({ disposedAt: "2025-01-01" }))
    expect(r.erro).toBe("baixaAntesDaCompra")
  })

  it("não baixa duas vezes", async () => {
    await empresa()
    const a = await acoes()
    const criado = await a.salvarBem(null, {}, form(vanNova))
    await a.darBaixa(criado.id!, {}, form({ disposedAt: "2026-07-15" }))
    const r = await a.darBaixa(criado.id!, {}, form({ disposedAt: "2026-08-15" }))
    expect(r.erro).toBe("jaBaixado")
  })

  it("reativar LIMPA a data da baixa", async () => {
    // Com a data preenchida a depreciação continuaria congelada, e o bem
    // reativado ficaria parado no tempo.
    await empresa()
    const a = await acoes()
    const criado = await a.salvarBem(null, {}, form(vanNova))
    await a.darBaixa(criado.id!, {}, form({ disposedAt: "2026-07-15" }))
    await a.reativarBem(criado.id!)

    const bem = await testDb.db.asset.findUnique({ where: { id: criado.id! } })
    expect(bem!.status).toBe("ATIVO")
    expect(bem!.disposedAt).toBeNull()
    expect(bem!.disposalNotes).toBeNull()
  })
})

describe("baixar não é excluir", () => {
  it("bem COM histórico de manutenção não pode ser excluído", async () => {
    // Apagar reescreveria o passado: a manutenção aconteceu e custou dinheiro.
    const { tenant } = await empresa()
    const a = await acoes()
    const criado = await a.salvarBem(null, {}, form(vanNova))

    await testDb.db.maintenanceOrder.create({
      data: { tenantId: tenant.id, number: 1, title: "Troca de óleo", assetId: criado.id! },
    })

    const r = await a.excluirBem(criado.id!)
    expect(r.erro).toBe("temHistorico")
    expect(await testDb.db.asset.count()).toBe(1)
  })

  it("bem sem histórico o DONO pode excluir", async () => {
    // É o caso do cadastro duplicado ou do erro de digitação.
    await empresa()
    const a = await acoes()
    const criado = await a.salvarBem(null, {}, form(vanNova))
    const r = await a.excluirBem(criado.id!)
    expect(r.erro).toBeUndefined()
    expect(await testDb.db.asset.count()).toBe(0)
  })

  it("administrador NÃO exclui — só o dono", async () => {
    await empresa("ADMIN")
    const a = await acoes()
    // Cadastrar, administrador pode.
    const criado = await a.salvarBem(null, {}, form(vanNova))
    expect(criado.erro).toBeUndefined()
    // Excluir, não.
    expect((await a.excluirBem(criado.id!)).erro).toBe("semPermissao")
  })
})

describe("a lista e o resumo", () => {
  it("calcula depreciação e valor contábil de cada bem", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarBem(null, {}, form(vanNova))

    const bens = await a.getBens()
    expect(bens).toHaveLength(1)
    expect(bens[0].taxa).toBe(20) // padrão de VEICULO
    // Os dois têm de fechar com o valor de aquisição.
    expect(bens[0].depreciado + bens[0].contabil).toBeCloseTo(60000, 2)
  })

  it("TERRENO não deprecia nem na lista", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarBem(
      null,
      {},
      form({ name: "Terreno da sede", category: "TERRENO", purchaseValue: "200000", purchasedAt: "2020-01-01" })
    )
    const [t] = await a.getBens()
    expect(t.depreciado).toBe(0)
    expect(t.contabil).toBe(200000)
  })

  it("não enxerga bem de outra empresa", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarBem(null, {}, form(vanNova))

    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    await testDb.db.asset.create({
      data: {
        tenantId: outra.id,
        name: "Bem alheio",
        purchaseValue: 999999,
        purchasedAt: new Date("2026-01-01"),
      },
    })

    const bens = await a.getBens()
    expect(bens.map((b) => b.name)).toEqual(["Van Fiorino"])
    expect((await a.getResumoDoPatrimonio()).totalAquisicao).toBe(60000)
  })
})

describe("a exportação para o contador", () => {
  it("sai com as quatro colunas que ele precisa", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarBem(null, {}, form(vanNova))

    const csv = await a.exportarPatrimonioCsv()
    expect(csv).toContain("Valor de aquisicao")
    expect(csv).toContain("Taxa anual (%)")
    expect(csv).toContain("Depreciacao acumulada")
    expect(csv).toContain("Valor contabil")
    expect(csv).toContain("Van Fiorino")
  })

  it("começa com BOM, senão o Excel em português quebra os acentos", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarBem(null, {}, form({ ...vanNova, name: "Betoneira à gasolina" }))
    const csv = await a.exportarPatrimonioCsv()
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it("nome com vírgula não quebra a coluna", async () => {
    // "Furadeira 1/2, bancada" partiria a linha em duas colunas e o contador
    // receberia uma planilha desalinhada.
    await empresa()
    const a = await acoes()
    await a.salvarBem(null, {}, form({ ...vanNova, name: 'Furadeira 1/2", bancada' }))
    const csv = await a.exportarPatrimonioCsv()
    // O nome sai inteiro, entre aspas, com as aspas internas duplicadas.
    expect(csv).toContain('"Furadeira 1/2"", bancada"')
  })
})
