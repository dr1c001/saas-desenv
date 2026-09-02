import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O balanço, montado do banco.
//
// As contas puras estão em balanco.test.ts e contador-agente.test.ts. O que se
// prova AQUI é a tradução do banco para os números do balanço — que é onde mora
// o erro difícil: somar a conta cancelada, contar a despesa da outra empresa,
// ou apagar a linha manual de quem não é dono dela.

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

  // Traduções DE VERDADE, e não o mock que devolve a chave.
  //
  // O CSV é para o contador, e a coisa que se quer provar dele é justamente que
  // ele sai LEGÍVEL — "Caixa e bancos", e não "caixa". Com o mock de identidade
  // o teste passaria exatamente no caso que ele existe para impedir.
  const pt = JSON.parse(readFileSync(join(process.cwd(), "messages/pt.json"), "utf8"))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async (raiz: string) => (chave: string, vals?: Record<string, unknown>) => {
      const texto = `${raiz}.${chave}`
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], pt)
      if (typeof texto !== "string") return `${raiz}.${chave}`
      return Object.entries(vals ?? {}).reduce(
        (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
        texto
      )
    },
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/balanco")

async function empresa(role = "OWNER") {
  const t = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  mockGetTenant.mockResolvedValue({ tenantId: t.id, userId: "u1", role })
  return t
}

const dias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function receita(
  tenantId: string,
  amount: number,
  status: "PAID" | "PENDING" | "CANCELLED" = "PAID",
  dueDate = new Date()
) {
  return testDb.db.revenue.create({
    data: { tenantId, description: "Serviço", amount, dueDate, status },
  })
}

async function despesa(tenantId: string, amount: number, status: "PAID" | "PENDING" = "PAID") {
  return testDb.db.expense.create({
    data: { tenantId, description: "Conta", amount, dueDate: new Date(), status },
  })
}

const linha = (grupo: string, descricao: string, valor: string) =>
  form({ group: grupo, description: descricao, amount: valor })

describe("os números vêm do banco", () => {
  it("caixa é o inicial mais o recebido, menos o pago", async () => {
    const t = await empresa()
    await testDb.db.tenant.update({ where: { id: t.id }, data: { openingCash: 5000 } })
    await Promise.all([receita(t.id, 42000), despesa(t.id, 31000)])

    const { balanco } = await (await acoes()).getBalanco()
    expect(balanco.caixa).toBe(16000)
  })

  it("conta CANCELADA não entra em lado nenhum", async () => {
    // Somá-la inflaria o ativo com dinheiro que ninguém vai receber.
    const t = await empresa()
    await Promise.all([
      receita(t.id, 1000, "PENDING"),
      receita(t.id, 9999, "CANCELLED"),
    ])

    const { balanco } = await (await acoes()).getBalanco()
    const receber = balanco.grupos
      .find((g) => g.grupo === "ATIVO_CIRCULANTE")!
      .linhas.find((l) => l.chave === "aReceber")!
    expect(receber.valor).toBe(1000)
  })

  it("estoque é saldo VEZES custo, peça a peça", async () => {
    const t = await empresa()
    await Promise.all([
      testDb.db.part.create({ data: { tenantId: t.id, name: "Compressor", stock: 2, costPrice: 800 } }),
      testDb.db.part.create({ data: { tenantId: t.id, name: "Filtro", stock: 10, costPrice: 15 } }),
    ])

    const { balanco } = await (await acoes()).getBalanco()
    const estoque = balanco.grupos
      .find((g) => g.grupo === "ATIVO_CIRCULANTE")!
      .linhas.find((l) => l.chave === "estoque")!
    expect(estoque.valor).toBe(1750)
  })

  it("peça SEM custo vale zero, e o conferente aponta", async () => {
    // Ela existe na prateleira e não existe no ativo.
    const t = await empresa()
    await testDb.db.part.create({ data: { tenantId: t.id, name: "Sem preço", stock: 5 } })

    const { balanco, achados } = await (await acoes()).getBalanco()
    const estoque = balanco.grupos
      .find((g) => g.grupo === "ATIVO_CIRCULANTE")!
      .linhas.find((l) => l.chave === "estoque")!
    expect(estoque.valor).toBe(0)
    expect(achados.find((a) => a.chave === "estoqueSemCusto")!.dados).toEqual({ pecas: 1 })
  })

  it("o imobilizado vem dos bens, já descontada a depreciação", async () => {
    const t = await empresa()
    await testDb.db.asset.create({
      data: {
        tenantId: t.id,
        name: "Van",
        category: "VEICULO", // 20% ao ano
        purchaseValue: 60000,
        purchasedAt: new Date("2025-09-02T12:00:00"),
      },
    })

    const { balanco } = await (await acoes()).getBalanco()
    const grupo = balanco.grupos.find((g) => g.grupo === "ATIVO_NAO_CIRCULANTE")!
    expect(grupo.linhas.find((l) => l.chave === "imobilizado")!.valor).toBe(60000)
    // Doze meses a 20% ao ano: R$ 12.000. A depreciação entra NEGATIVA.
    expect(grupo.linhas.find((l) => l.chave === "depreciacao")!.valor).toBe(-12000)
    expect(grupo.total).toBe(48000)
  })

  it("bem BAIXADO some do balanço E do conferente: não é mais da empresa", async () => {
    // O balanço sozinho não prova isto: `resumirPatrimonio` também descarta o
    // baixado, então tirar o filtro da consulta deixaria o total certo assim
    // mesmo. Quem paga o preço é o CONFERENTE, que passaria a cobrar nota
    // fiscal de uma van vendida há dois anos.
    const t = await empresa()
    await testDb.db.asset.create({
      data: {
        tenantId: t.id,
        name: "Van vendida",
        purchaseValue: 60000,
        purchasedAt: new Date("2025-01-01T12:00:00"),
        status: "BAIXADO",
        disposedAt: new Date("2026-01-01T12:00:00"),
      },
    })

    const { balanco, achados } = await (await acoes()).getBalanco()
    expect(balanco.grupos.find((g) => g.grupo === "ATIVO_NAO_CIRCULANTE")!.total).toBe(0)
    expect(achados.map((a) => a.chave)).not.toContain("bemSemNota")
    expect(achados.map((a) => a.chave)).not.toContain("depreciacaoForaDoCaixa")
  })

  it("não enxerga o dinheiro de OUTRA empresa", async () => {
    const t = await empresa()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    await Promise.all([
      receita(t.id, 100),
      receita(outra.id, 999999),
      despesa(outra.id, 888888),
      testDb.db.part.create({ data: { tenantId: outra.id, name: "P", stock: 9, costPrice: 100 } }),
      testDb.db.asset.create({
        data: { tenantId: outra.id, name: "Bem alheio", purchaseValue: 50000, purchasedAt: new Date() },
      }),
    ])

    const { balanco } = await (await acoes()).getBalanco()
    expect(balanco.ativo).toBe(100)
    expect(balanco.passivo).toBe(0)
  })

  it("a identidade fecha com dados de verdade", async () => {
    const t = await empresa()
    await testDb.db.tenant.update({
      where: { id: t.id },
      data: { openingCash: 1234.56, shareCapital: 10000 },
    })
    await Promise.all([
      receita(t.id, 4321.11),
      receita(t.id, 987.65, "PENDING"),
      despesa(t.id, 2222.22),
      despesa(t.id, 333.33, "PENDING"),
      testDb.db.part.create({ data: { tenantId: t.id, name: "P", stock: 3.5, costPrice: 19.99 } }),
      testDb.db.asset.create({
        data: {
          tenantId: t.id,
          name: "Notebook",
          category: "INFORMATICA",
          purchaseValue: 4999.99,
          purchasedAt: new Date("2025-03-15T12:00:00"),
        },
      }),
    ])

    const { balanco } = await (await acoes()).getBalanco()
    expect(balanco.fecha).toBe(true)
    expect(balanco.ativo).toBeCloseTo(balanco.passivo + balanco.patrimonioLiquido, 2)
  })
})

describe("o conferente, ligado ao banco", () => {
  it("acha o recebível velho pela DATA DE VENCIMENTO", async () => {
    const t = await empresa()
    await Promise.all([
      receita(t.id, 1200, "PENDING", dias(200)),
      receita(t.id, 800, "PENDING", dias(190)),
      // Este é recente: não conta.
      receita(t.id, 5000, "PENDING", dias(10)),
      // Este é velho mas foi PAGO: também não conta.
      receita(t.id, 7000, "PAID", dias(300)),
    ])

    const { achados } = await (await acoes()).getBalanco()
    const velho = achados.find((a) => a.chave === "recebivelVelho")!
    expect(velho.dados!.quantidade).toBe(2)
    expect(velho.dados!.valor).toBe(2000)
  })

  it("conta os bens sem nota anexada", async () => {
    const t = await empresa()
    const comNota = await testDb.db.asset.create({
      data: { tenantId: t.id, name: "Com nota", purchaseValue: 100, purchasedAt: new Date() },
    })
    await testDb.db.asset.create({
      data: { tenantId: t.id, name: "Sem nota", purchaseValue: 200, purchasedAt: new Date() },
    })
    await testDb.db.attachment.create({
      data: { assetId: comNota.id, url: "u", name: "nf.pdf" },
    })

    const { achados } = await (await acoes()).getBalanco()
    expect(achados.find((a) => a.chave === "bemSemNota")!.dados).toEqual({ bens: 1 })
  })

  it("bem DOADO (valor zero) não vira 'já depreciado'", async () => {
    // Ele nasce com valor contábil zero e não é caso de revisão de vida útil —
    // sem essa distinção o aviso apareceria para todo bem doado, para sempre.
    const t = await empresa()
    await testDb.db.asset.create({
      data: { tenantId: t.id, name: "Bancada doada", purchaseValue: 0, purchasedAt: new Date() },
    })

    const { achados } = await (await acoes()).getBalanco()
    expect(achados.map((a) => a.chave)).not.toContain("bemZerado")
  })
})

describe("o caixa inicial e o capital social", () => {
  it("gravam e voltam", async () => {
    await empresa()
    const a = await acoes()
    const r = await a.salvarBasesDoBalanco({}, form({ openingCash: "5000", shareCapital: "20000" }))
    expect(r.erro).toBeUndefined()

    const { caixaInicial, capitalSocial } = await a.getBalanco()
    expect(caixaInicial).toBe(5000)
    expect(capitalSocial).toBe(20000)
  })

  it("campo VAZIO apaga, e volta a ser 'não informado'", async () => {
    // "Não informou" e "informou zero" são coisas diferentes, e é dessa
    // diferença que o conferente tira qual mensagem mostrar.
    await empresa()
    const a = await acoes()
    await a.salvarBasesDoBalanco({}, form({ openingCash: "5000", shareCapital: "" }))
    await a.salvarBasesDoBalanco({}, form({ openingCash: "", shareCapital: "" }))

    const { caixaInicial } = await a.getBalanco()
    expect(caixaInicial).toBeNull()
  })

  it("zero informado NÃO é o mesmo que vazio", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarBasesDoBalanco({}, form({ openingCash: "0", shareCapital: "" }))

    const { caixaInicial, achados } = await a.getBalanco()
    expect(caixaInicial).toBe(0)
    // Com zero INFORMADO, a mensagem é a outra: não é cadastro faltando.
    await despesa((await testDb.db.tenant.findFirst())!.id, 500)
    const depois = await a.getBalanco()
    expect(depois.achados.map((x) => x.chave)).toContain("caixaNegativoComInicial")
    expect(achados).toBeDefined()
  })

  it("recusa texto e valor negativo", async () => {
    await empresa()
    const a = await acoes()
    expect((await a.salvarBasesDoBalanco({}, form({ openingCash: "abc" }))).erro).toBe(
      "valorInvalido"
    )
    expect((await a.salvarBasesDoBalanco({}, form({ shareCapital: "-1" }))).erro).toBe(
      "valorInvalido"
    )
  })

  it("técnico não mexe", async () => {
    await empresa("TECHNICIAN")
    const r = await (await acoes()).salvarBasesDoBalanco({}, form({ openingCash: "5000" }))
    expect(r.erro).toBe("semPermissao")
  })
})

describe("as linhas manuais", () => {
  it("entram no grupo escolhido e mudam o balanço", async () => {
    await empresa()
    const a = await acoes()
    const r = await a.salvarLinhaManual(
      null,
      {},
      linha("PASSIVO_NAO_CIRCULANTE", "Financiamento da van", "38000")
    )
    expect(r.erro).toBeUndefined()

    const { balanco } = await a.getBalanco()
    expect(balanco.passivo).toBe(38000)
    expect(balanco.patrimonioLiquido).toBe(-38000)
    expect(balanco.fecha).toBe(true)
  })

  it("aceitam valor NEGATIVO — conta retificadora existe", async () => {
    await empresa()
    const a = await acoes()
    const r = await a.salvarLinhaManual(
      null,
      {},
      linha("ATIVO_CIRCULANTE", "(-) Provisao para perdas", "-2000")
    )
    expect(r.erro).toBeUndefined()

    const { balanco } = await a.getBalanco()
    expect(balanco.ativo).toBe(-2000)
  })

  it("recusam descrição vazia, valor vazio e grupo inventado", async () => {
    await empresa()
    const a = await acoes()
    expect((await a.salvarLinhaManual(null, {}, linha("ATIVO_CIRCULANTE", "", "10"))).erro).toBe(
      "descricaoObrigatoria"
    )
    // Valor vazio gravaria uma linha de R$ 0,00 com nome e tudo.
    expect((await a.salvarLinhaManual(null, {}, linha("ATIVO_CIRCULANTE", "Algo", ""))).erro).toBe(
      "valorInvalido"
    )
    expect((await a.salvarLinhaManual(null, {}, linha("INVENTADO", "Algo", "10"))).erro).toBe(
      "grupoInvalido"
    )
    expect(await testDb.db.balanceEntry.count()).toBe(0)
  })

  it("editar troca grupo, descrição e valor", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarLinhaManual(null, {}, linha("PASSIVO_CIRCULANTE", "Emprestimo", "5000"))
    const gravada = await testDb.db.balanceEntry.findFirst()

    await a.salvarLinhaManual(
      gravada!.id,
      {},
      linha("PASSIVO_NAO_CIRCULANTE", "Emprestimo longo", "7000")
    )
    const depois = await testDb.db.balanceEntry.findUnique({ where: { id: gravada!.id } })
    expect(depois!.group).toBe("PASSIVO_NAO_CIRCULANTE")
    expect(depois!.description).toBe("Emprestimo longo")
    expect(Number(depois!.amount)).toBe(7000)
  })

  it("NÃO edita a linha de outra empresa", async () => {
    await empresa()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const alheia = await testDb.db.balanceEntry.create({
      data: {
        tenantId: outra.id,
        group: "PASSIVO_CIRCULANTE",
        description: "Divida alheia",
        amount: 1,
      },
    })

    const r = await (await acoes()).salvarLinhaManual(
      alheia.id,
      {},
      linha("ATIVO_CIRCULANTE", "Roubada", "999")
    )
    expect(r.erro).toBe("naoEncontrado")
    const intacta = await testDb.db.balanceEntry.findUnique({ where: { id: alheia.id } })
    expect(intacta!.description).toBe("Divida alheia")
  })

  it("NÃO apaga a linha de outra empresa", async () => {
    // `delete` por id puro apagaria a linha alheia para quem chamasse a Action
    // direto com um id adivinhado. O tenant tem de estar no WHERE.
    await empresa()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const alheia = await testDb.db.balanceEntry.create({
      data: { tenantId: outra.id, group: "PASSIVO_CIRCULANTE", description: "Alheia", amount: 1 },
    })

    const r = await (await acoes()).excluirLinhaManual(alheia.id)
    expect(r.erro).toBe("naoEncontrado")
    expect(await testDb.db.balanceEntry.count({ where: { id: alheia.id } })).toBe(1)
  })

  it("apaga a própria", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarLinhaManual(null, {}, linha("PASSIVO_CIRCULANTE", "Emprestimo", "5000"))
    const minha = await testDb.db.balanceEntry.findFirst()

    expect((await a.excluirLinhaManual(minha!.id)).erro).toBeUndefined()
    expect(await testDb.db.balanceEntry.count()).toBe(0)
  })

  it("técnico não cria nem apaga", async () => {
    await empresa("TECHNICIAN")
    const a = await acoes()
    expect(
      (await a.salvarLinhaManual(null, {}, linha("PASSIVO_CIRCULANTE", "X", "1"))).erro
    ).toBe("semPermissao")
    expect((await a.excluirLinhaManual("qualquer")).erro).toBe("semPermissao")
  })
})

describe("a exportação para o contador", () => {
  it("sai TRADUZIDO, e não com as chaves internas", async () => {
    // Quem abre este arquivo é o contador. "ATIVO_NAO_CIRCULANTE" e
    // "caixaNegativoSemInicial" não são para ninguém ler — ele abriria a
    // planilha e ligaria perguntando o que é isso.
    const t = await empresa()
    await despesa(t.id, 9000)

    const csv = await (await acoes()).exportarBalancoCsv()
    expect(csv).toContain("Ativo circulante")
    expect(csv).toContain("Caixa e bancos")
    expect(csv).toContain("Patrimônio líquido")
    expect(csv).toContain("TOTAL")
    expect(csv).not.toContain("ATIVO_CIRCULANTE")
    expect(csv).not.toContain("linhas.caixa")
  })

  it("leva as RESSALVAS junto, com o valor em dinheiro", async () => {
    // Mandar o número escondendo o que se sabe sobre ele é pior que não mandar.
    // E "ficou em -9000" não é frase para o contador ler.
    const t = await empresa()
    await despesa(t.id, 9000)

    const csv = await (await acoes()).exportarBalancoCsv()
    expect(csv).toContain("O conferente")
    expect(csv).toContain("Corrigir")
    expect(csv).toContain("caixa inicial faltando")
    expect(csv).toMatch(/ficou em .?R\$.?\s?-?9\.000,00/)
    expect(csv).not.toContain("caixaNegativoSemInicial")
  })

  it("começa com BOM, senão o Excel em português quebra os acentos", async () => {
    await empresa()
    const csv = await (await acoes()).exportarBalancoCsv()
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it("descrição com vírgula não quebra a coluna", async () => {
    await empresa()
    const a = await acoes()
    await a.salvarLinhaManual(
      null,
      {},
      linha("PASSIVO_NAO_CIRCULANTE", 'Financiamento 1/2", banco X', "1000")
    )
    const csv = await a.exportarBalancoCsv()
    expect(csv).toContain('"Financiamento 1/2"", banco X"')
  })
})
