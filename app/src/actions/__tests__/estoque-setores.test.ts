import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Os setores de estoque, pela Action que a tela chama.
//
// ─── O que este arquivo guarda ───────────────────────────────────────────────
//
// Criar os tipos RECEBIMENTO / PRODUCAO / EXPEDICAO no enum não entrega setor
// nenhum: o que entrega é conseguir PÔR peça dentro deles. E até 04/09/2026 não
// dava — `getSaldosDaPeca` devolvia só as linhas de StockBalance existentes, o
// setor recém-criado não aparecia como destino, e a única forma de ele ganhar
// saldo era receber uma transferência que a tela não deixava fazer.
//
// Um laço fechado: recurso inteiro no repositório, inútil no produto. É a mesma
// classe de defeito da peça na OS (ver os-peca-do-estoque.test.ts) — código
// pronto, alcançável por nenhuma tela.
//
// Por isso os testes daqui atravessam a Action de verdade, e não a regra pura.

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
  }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/estoque-locais")

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const dono = await testDb.db.user.create({
    data: { id: "u-dono", tenantId: tenant.id, name: "Adriel", email: "a@ex.com", role: "OWNER" },
  })
  const almox = await testDb.db.stockLocation.create({
    data: { tenantId: tenant.id, name: "Almoxarifado", type: "ALMOXARIFADO" },
  })
  // O setor NOVO, e vazio — que é o caso inteiro deste arquivo.
  const expedicao = await testDb.db.stockLocation.create({
    data: { tenantId: tenant.id, name: "Expedição", type: "EXPEDICAO" },
  })
  const peca = await testDb.db.part.create({
    data: { tenantId: tenant.id, name: "Mangueira 3/4", stock: 10, minStock: 2 },
  })
  await testDb.db.stockBalance.create({
    data: { partId: peca.id, locationId: almox.id, quantity: 10 },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: dono.id, role: "OWNER" })
  return { tenant, dono, almox, expedicao, peca }
}

function formulario(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

describe("o setor novo consegue receber a primeira peça", () => {
  it("um local VAZIO aparece na resposta de 'onde está'", async () => {
    // O defeito: enquanto isto devolvia só StockBalance, a Expedição sem saldo
    // não existia na lista — e o <select> de destino é montado a partir dela.
    const { expedicao, peca } = await cenario()
    const { getSaldosDaPeca } = await acoes()

    const linhas = await getSaldosDaPeca(peca.id)

    const daExpedicao = linhas.find((l) => l.locationId === expedicao.id)
    expect(daExpedicao).toBeDefined()
    expect(daExpedicao?.quantity).toBe(0)
  })

  it("a transferência para o setor vazio move o saldo de verdade", async () => {
    const { almox, expedicao, peca } = await cenario()
    const { transferir } = await acoes()

    const r = await transferir(
      {},
      formulario({
        partId: peca.id,
        origemId: almox.id,
        destinoId: expedicao.id,
        quantidade: "4",
      })
    )

    expect(r.erro).toBeUndefined()
    const saldos = await testDb.db.stockBalance.findMany({ where: { partId: peca.id } })
    const porLocal = new Map(saldos.map((s) => [s.locationId, Number(s.quantity)]))
    expect(porLocal.get(expedicao.id)).toBe(4)
    expect(porLocal.get(almox.id)).toBe(6)

    // A invariante do desenho: o total da empresa NÃO muda numa transferência.
    const depois = await testDb.db.part.findUnique({ where: { id: peca.id } })
    expect(Number(depois?.stock)).toBe(10)
  })

  it("um local de OUTRA empresa não entra na lista", async () => {
    // `getSaldosDaPeca` passou a ler StockLocation direto. Sem filtro de
    // tenant, a lista de destinos entregaria os setores do vizinho.
    const { peca } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    await testDb.db.stockLocation.create({
      data: { tenantId: outra.id, name: "Galpão alheio", type: "ALMOXARIFADO" },
    })
    const { getSaldosDaPeca } = await acoes()

    const linhas = await getSaldosDaPeca(peca.id)

    expect(linhas.map((l) => l.location.name)).not.toContain("Galpão alheio")
  })
})

describe("quem transferiu, quando e por quê", () => {
  it("o motivo digitado fica gravado nas DUAS pernas", async () => {
    // Uma perna em cada local. Gravar o motivo só na saída deixaria o
    // histórico da Expedição dizendo que a peça apareceu sem explicação.
    const { almox, expedicao, peca } = await cenario()
    const { transferir } = await acoes()

    await transferir(
      {},
      formulario({
        partId: peca.id,
        origemId: almox.id,
        destinoId: expedicao.id,
        quantidade: "4",
        motivo: "separado para a entrega de amanhã",
      })
    )

    const linhas = await testDb.db.stockMovement.findMany({ where: { partId: peca.id } })
    expect(linhas).toHaveLength(2)
    for (const l of linhas) expect(l.reason).toContain("separado para a entrega de amanhã")
    // E o para-onde/de-onde continua lá: o motivo entrou JUNTO, não no lugar.
    expect(linhas.find((l) => l.locationId === almox.id)?.reason).toContain("Expedição")
    expect(linhas.find((l) => l.locationId === expedicao.id)?.reason).toContain("Almoxarifado")
  })

  it("quem moveu e quando ficam registrados", async () => {
    // "Fica registrado" é o que o dono pediu. Sem autor, o histórico responde
    // metade da pergunta que faz alguém abri-lo.
    const { almox, expedicao, peca, dono } = await cenario()
    const { transferir } = await acoes()

    await transferir(
      {},
      formulario({ partId: peca.id, origemId: almox.id, destinoId: expedicao.id, quantidade: "1" })
    )

    const linhas = await testDb.db.stockMovement.findMany({ where: { partId: peca.id } })
    for (const l of linhas) {
      expect(l.userId).toBe(dono.id)
      expect(l.createdAt).toBeInstanceOf(Date)
    }
    // As duas pernas são a MESMA transferência, e é o transferId que liga uma
    // à outra — sem ele o histórico mostra uma saída e uma entrada soltas.
    expect(new Set(linhas.map((l) => l.transferId)).size).toBe(1)
    expect(linhas[0].transferId).toBeTruthy()
  })

  it("sem motivo digitado, a linha continua legível", async () => {
    // Motivo é opcional de propósito: exigir justificativa ensina a digitar
    // "x" para o formulário passar — e aí o campo passa a mentir.
    const { almox, expedicao, peca } = await cenario()
    const { transferir } = await acoes()

    await transferir(
      {},
      formulario({ partId: peca.id, origemId: almox.id, destinoId: expedicao.id, quantidade: "2" })
    )

    const saida = await testDb.db.stockMovement.findFirst({
      where: { partId: peca.id, locationId: almox.id },
    })
    expect(saida?.reason).toBe("Transferência para Expedição")
  })
})

describe("o histórico é LEGÍVEL pelo sistema", () => {
  it("devolve quem, quanto, quando, por quê e onde", async () => {
    // A consulta existia (`getPeca`) e nenhuma tela chamava. Registro que
    // ninguém consegue abrir não é registro.
    const { almox, expedicao, peca, dono } = await cenario()
    const { transferir } = await acoes()
    await transferir(
      {},
      formulario({
        partId: peca.id,
        origemId: almox.id,
        destinoId: expedicao.id,
        quantidade: "3",
        motivo: "carga da van",
      })
    )

    const { getMovimentosDaPeca } = await import("@/actions/estoque")
    const linhas = await getMovimentosDaPeca(peca.id)

    expect(linhas).toHaveLength(2)
    const saida = linhas.find((l) => l.location?.name === "Almoxarifado")
    expect(saida?.user?.name).toBe(dono.name)
    expect(saida?.reason).toContain("carga da van")
    expect(saida?.toLocation?.name).toBe("Expedição")
    expect(Number(saida?.quantity)).toBe(-3)
    expect(Number(saida?.balanceAfter)).toBe(7)
  })

  it("não devolve o histórico de outra empresa", async () => {
    const { peca } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const pecaAlheia = await testDb.db.part.create({
      data: { tenantId: outra.id, name: "Peça alheia", stock: 5 },
    })
    await testDb.db.stockMovement.create({
      data: {
        tenantId: outra.id,
        partId: pecaAlheia.id,
        type: "ENTRADA",
        quantity: 5,
        balanceAfter: 5,
        reason: "compra do vizinho",
      },
    })

    const { getMovimentosDaPeca } = await import("@/actions/estoque")

    // Pedindo a peça ALHEIA com o tenant do cenário: não pode vir nada.
    expect(await getMovimentosDaPeca(pecaAlheia.id)).toHaveLength(0)
    expect(await getMovimentosDaPeca(peca.id)).toHaveLength(0)
  })
})

describe("o filtro por setor", () => {
  it("lista só o que ESTÁ naquele setor", async () => {
    const { almox, expedicao, peca } = await cenario()
    const { transferir } = await acoes()
    await transferir(
      {},
      formulario({ partId: peca.id, origemId: almox.id, destinoId: expedicao.id, quantidade: "4" })
    )
    // Uma segunda peça que nunca saiu do almoxarifado.
    const parada = await testDb.db.part.create({
      data: { tenantId: (await testDb.db.tenant.findFirst())!.id, name: "Registro 1/2", stock: 5 },
    })
    await testDb.db.stockBalance.create({
      data: { partId: parada.id, locationId: almox.id, quantity: 5 },
    })

    const { getPecas } = await import("@/actions/estoque")
    const naExpedicao = await getPecas(undefined, expedicao.id)

    expect(naExpedicao.map((p) => p.name)).toEqual(["Mangueira 3/4"])
    // E vem o saldo DAQUELE setor, não o total da empresa — a tela mostra este
    // número embaixo do cabeçalho "Saldo em Expedição".
    expect(Number(naExpedicao[0].balances[0]?.quantity)).toBe(4)
  })

  it("peça que já SAIU do setor não aparece nele", async () => {
    // A linha de StockBalance fica para trás zerada. Listá-la faria a tela
    // responder o histórico no lugar da pergunta ("o que tem hoje aqui?").
    const { almox, expedicao, peca } = await cenario()
    const { transferir } = await acoes()
    await transferir(
      {},
      formulario({ partId: peca.id, origemId: almox.id, destinoId: expedicao.id, quantidade: "4" })
    )
    await transferir(
      {},
      formulario({ partId: peca.id, origemId: expedicao.id, destinoId: almox.id, quantidade: "4" })
    )

    const { getPecas } = await import("@/actions/estoque")

    expect(await getPecas(undefined, expedicao.id)).toHaveLength(0)
    // Mas a peça continua existindo no catálogo, inteira.
    const todas = await getPecas()
    expect(todas).toHaveLength(1)
    expect(Number(todas[0].stock)).toBe(10)
  })

  it("um local de outra empresa não vira filtro que devolve peça", async () => {
    await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const alheio = await testDb.db.stockLocation.create({
      data: { tenantId: outra.id, name: "Galpão alheio", type: "ALMOXARIFADO" },
    })

    const { getPecas } = await import("@/actions/estoque")

    expect(await getPecas(undefined, alheio.id)).toHaveLength(0)
  })
})
