import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O estoque por local, num banco de verdade.
//
// A regra pura está em estoque-local.test.ts. O que se prova AQUI é a
// INVARIANTE que o desenho inteiro depende:
//
//     Part.stock === soma dos StockBalance daquela peça
//
// `Part.stock` continuou existindo como total porque é lido pelo alerta de
// mínimo, pela listagem, pela escolha na OS e pelos relatórios. Manter um total
// ao lado das parcelas é conveniente e é exatamente o desenho que convida os
// dois a divergirem em silêncio — o saldo certo numa tela e errado na outra,
// sem erro nenhum aparecer.
//
// Por isso todo teste daqui termina conferindo a invariante.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

const mover = async () => (await import("@/lib/estoque-db")).aplicarMovimento
const resolver = async () => (await import("@/lib/estoque-db")).resolverLocal

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const tecnico = await testDb.db.user.create({
    data: { id: "u-carlos", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  const almox = await testDb.db.stockLocation.create({
    data: { tenantId: tenant.id, name: "Almoxarifado", type: "ALMOXARIFADO" },
  })
  const van = await testDb.db.stockLocation.create({
    data: { tenantId: tenant.id, name: "Van 01", type: "VEICULO", userId: tecnico.id },
  })
  const peca = await testDb.db.part.create({
    data: { tenantId: tenant.id, name: "Compressor 2HP", stock: 0, minStock: 2 },
  })
  return { tenant, tecnico, almox, van, peca }
}

/** O total bate com a soma dos locais? É a pergunta que importa. */
async function conferirInvariante(partId: string) {
  const peca = await testDb.db.part.findUnique({ where: { id: partId }, select: { stock: true } })
  const saldos = await testDb.db.stockBalance.findMany({
    where: { partId },
    select: { quantity: true },
  })
  const soma = saldos.reduce((t, s) => t + Number(s.quantity), 0)
  expect(Number(peca!.stock), "Part.stock não é a soma dos locais").toBeCloseTo(soma, 3)
  return { total: Number(peca!.stock), soma }
}

const saldoEm = async (partId: string, locationId: string) => {
  const b = await testDb.db.stockBalance.findUnique({
    where: { partId_locationId: { partId, locationId } },
  })
  return b ? Number(b.quantity) : 0
}

describe("o total é sempre a soma dos locais", () => {
  it("uma entrada no almoxarifado", async () => {
    const { tenant, almox, peca } = await cenario()
    await testDb.db.$transaction((tx) =>
      mover().then((f) =>
        f(tx, { tenantId: tenant.id, partId: peca.id, locationId: almox.id, tipo: "ENTRADA", quantidade: 10 })
      )
    )
    expect(await saldoEm(peca.id, almox.id)).toBe(10)
    expect((await conferirInvariante(peca.id)).total).toBe(10)
  })

  it("entradas em DOIS locais somam no total", async () => {
    // O caso que o desenho inteiro existe para suportar: a mesma peça em dois
    // lugares, e um total que continua fazendo sentido.
    const { tenant, almox, van, peca } = await cenario()
    const f = await mover()
    await testDb.db.$transaction((tx) =>
      f(tx, { tenantId: tenant.id, partId: peca.id, locationId: almox.id, tipo: "ENTRADA", quantidade: 10 })
    )
    await testDb.db.$transaction((tx) =>
      f(tx, { tenantId: tenant.id, partId: peca.id, locationId: van.id, tipo: "ENTRADA", quantidade: 4 })
    )

    expect(await saldoEm(peca.id, almox.id)).toBe(10)
    expect(await saldoEm(peca.id, van.id)).toBe(4)
    expect((await conferirInvariante(peca.id)).total).toBe(14)
  })

  it("a saída tira do local certo, e só dele", async () => {
    const { tenant, almox, van, peca } = await cenario()
    const f = await mover()
    for (const [loc, q] of [[almox.id, 10], [van.id, 4]] as const) {
      await testDb.db.$transaction((tx) =>
        f(tx, { tenantId: tenant.id, partId: peca.id, locationId: loc, tipo: "ENTRADA", quantidade: q })
      )
    }
    await testDb.db.$transaction((tx) =>
      f(tx, { tenantId: tenant.id, partId: peca.id, locationId: van.id, tipo: "SAIDA", quantidade: 3 })
    )

    expect(await saldoEm(peca.id, almox.id), "o almoxarifado não podia mexer").toBe(10)
    expect(await saldoEm(peca.id, van.id)).toBe(1)
    expect((await conferirInvariante(peca.id)).total).toBe(11)
  })

  it("o AJUSTE num local não zera os outros", async () => {
    // O defeito que este teste existe para impedir, e que quase entrou: no
    // AJUSTE a quantidade é o saldo CONTADO, não a diferença. Se o total fosse
    // recalculado com `saldoApos` em vez de somar a variação, contar 3 na van
    // faria o total da empresa virar 3 — apagando as 10 do almoxarifado sem
    // nenhum movimento que explicasse.
    const { tenant, almox, van, peca } = await cenario()
    const f = await mover()
    for (const [loc, q] of [[almox.id, 10], [van.id, 5]] as const) {
      await testDb.db.$transaction((tx) =>
        f(tx, { tenantId: tenant.id, partId: peca.id, locationId: loc, tipo: "ENTRADA", quantidade: q })
      )
    }
    await testDb.db.$transaction((tx) =>
      f(tx, {
        tenantId: tenant.id, partId: peca.id, locationId: van.id,
        tipo: "AJUSTE", quantidade: 3, motivo: "contagem",
      })
    )

    expect(await saldoEm(peca.id, almox.id), "o almoxarifado foi apagado pelo ajuste").toBe(10)
    expect(await saldoEm(peca.id, van.id)).toBe(3)
    expect((await conferirInvariante(peca.id)).total).toBe(13)
  })

  it("o histórico guarda o saldo DAQUELE local", async () => {
    // `balanceAfter` deixou de ser o total. Se guardasse o total, o histórico
    // da van mostraria números que não têm relação com o que há dentro dela.
    const { tenant, almox, van, peca } = await cenario()
    const f = await mover()
    await testDb.db.$transaction((tx) =>
      f(tx, { tenantId: tenant.id, partId: peca.id, locationId: almox.id, tipo: "ENTRADA", quantidade: 10 })
    )
    await testDb.db.$transaction((tx) =>
      f(tx, { tenantId: tenant.id, partId: peca.id, locationId: van.id, tipo: "ENTRADA", quantidade: 4 })
    )

    const daVan = await testDb.db.stockMovement.findFirst({
      where: { locationId: van.id },
      select: { balanceAfter: true },
    })
    expect(Number(daVan!.balanceAfter), "guardou o total em vez do saldo do local").toBe(4)
  })
})

describe("resolverLocal", () => {
  it("escolhe a van de quem move", async () => {
    const { tenant, tecnico, van } = await cenario()
    const r = await resolver()
    const escolhido = await testDb.db.$transaction((tx) => r(tx, tenant.id, tecnico.id))
    expect(escolhido).toBe(van.id)
  })

  it("sem usuário, cai no almoxarifado", async () => {
    // É o recebimento de compra: a peça chega no depósito, não no carro de
    // quem digitou.
    const { tenant, almox } = await cenario()
    const r = await resolver()
    expect(await testDb.db.$transaction((tx) => r(tx, tenant.id, null))).toBe(almox.id)
  })

  it("ignora local de OUTRA empresa", async () => {
    // Sem o filtro por tenant, um id vindo do formulário moveria estoque
    // alheio — e o saldo sumiria da empresa certa.
    const { tenant, almox } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const dela = await testDb.db.stockLocation.create({
      data: { tenantId: outra.id, name: "Almoxarifado", type: "ALMOXARIFADO" },
    })
    const r = await resolver()
    const escolhido = await testDb.db.$transaction((tx) => r(tx, tenant.id, null, dela.id))
    expect(escolhido).toBe(almox.id)
  })

  it("ignora local desativado e cai no padrão", async () => {
    const { tenant, almox, van } = await cenario()
    await testDb.db.stockLocation.update({ where: { id: van.id }, data: { active: false } })
    const r = await resolver()
    expect(await testDb.db.$transaction((tx) => r(tx, tenant.id, "u-carlos"))).toBe(almox.id)
  })

  it("CRIA o almoxarifado quando a empresa não tem local nenhum", async () => {
    // A migração só criou local para quem já tinha peça. Empresa nova chega
    // aqui sem nada, e recusar o movimento seria pedir que ela adivinhe que
    // precisa criar um lugar antes de guardar a primeira peça.
    const nova = await testDb.db.tenant.create({ data: { name: "Nova" } })
    const r = await resolver()
    const id = await testDb.db.$transaction((tx) => r(tx, nova.id, null))
    const criado = await testDb.db.stockLocation.findUnique({ where: { id } })
    expect(criado?.name).toBe("Almoxarifado")
    expect(criado?.tenantId).toBe(nova.id)
  })
})

describe("uma empresa não mexe no estoque da outra", () => {
  it("movimentar com peça de outra empresa não faz nada", async () => {
    const { tenant, almox } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const pecaDela = await testDb.db.part.create({
      data: { tenantId: outra.id, name: "Peça alheia", stock: 5 },
    })

    const f = await mover()
    await expect(
      testDb.db.$transaction((tx) =>
        f(tx, {
          tenantId: tenant.id, partId: pecaDela.id, locationId: almox.id,
          tipo: "SAIDA", quantidade: 1,
        })
      )
    ).rejects.toThrow()

    const intacta = await testDb.db.part.findUnique({ where: { id: pecaDela.id } })
    expect(Number(intacta!.stock)).toBe(5)
  })
})
