import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A peça do estoque saindo pela OS.
//
// ─── O que este arquivo guarda ───────────────────────────────────────────────
//
// O caminho inteiro já existia e estava INALCANÇÁVEL: `completeServiceOrder`
// aceitava `partId`, gravava em `ServiceItem`, e `baixarPecasDaOs` dava a baixa
// ao concluir. Só que nenhuma tela oferecia escolher a peça — o campo era
// sempre nulo, a baixa nunca disparava, e nenhum teste cobria a função.
//
// Código construído, sem tela e sem teste: as três coisas que fazem um recurso
// existir no repositório e não existir no produto.

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
  }))
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string) => chave,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/service-orders")

async function cenario(saldo = 10) {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const tecnico = await testDb.db.user.create({
    data: { id: "u1", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: tecnico.id, role: "OWNER" })

  const local = await testDb.db.stockLocation.create({
    data: { tenantId: tenant.id, name: "Almoxarifado" },
  })
  const peca = await testDb.db.part.create({
    data: { tenantId: tenant.id, name: "Filtro", unit: "un", stock: saldo, salePrice: 40 },
  })
  await testDb.db.stockBalance.create({
    data: { partId: peca.id, locationId: local.id, quantity: saldo },
  })

  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Dona Maria" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      number: 1,
      title: "Troca de filtro",
      technicianId: tecnico.id,
    },
  })
  return { tenant, tecnico, peca, local, os }
}

const saldoDa = async (id: string) =>
  Number((await testDb.db.part.findUnique({ where: { id } }))!.stock)

describe("concluir a OS baixa a peça", () => {
  it("o saldo cai pela quantidade usada", async () => {
    // O teste que faltava, e o que prova que o recurso deixou de ser morto.
    const { peca, os } = await cenario(10)

    await (await acoes()).completeServiceOrder(
      os.id,
      "Filtro trocado",
      [{ description: "Filtro", quantity: 2, unitPrice: 40, partId: peca.id }],
      false
    )

    expect(await saldoDa(peca.id)).toBe(8)
  })

  it("grava o MOVIMENTO, ligado à OS", async () => {
    // Sem o vínculo, o histórico do estoque diria "saiu 2" sem dizer para onde
    // — e ninguém consegue auditar uma saída sem destino.
    const { peca, os } = await cenario()
    await (await acoes()).completeServiceOrder(
      os.id,
      "ok",
      [{ description: "Filtro", quantity: 2, unitPrice: 40, partId: peca.id }],
      false
    )

    const mov = await testDb.db.stockMovement.findFirst({ where: { orderId: os.id } })
    expect(mov).not.toBeNull()
    expect(mov!.type).toBe("SAIDA")
    expect(Number(mov!.quantity)).toBe(-2)
    expect(mov!.partId).toBe(peca.id)
  })

  it("item SEM peça não mexe em estoque nenhum", async () => {
    // Mão de obra, taxa e deslocamento continuam sendo o caminho normal de
    // quem não controla estoque.
    const { peca, os } = await cenario(10)
    await (await acoes()).completeServiceOrder(
      os.id,
      "ok",
      [{ description: "Mão de obra", quantity: 1, unitPrice: 200 }],
      false
    )

    expect(await saldoDa(peca.id)).toBe(10)
    expect(await testDb.db.stockMovement.count()).toBe(0)
  })

  it("mistura peça e mão de obra na mesma OS", async () => {
    const { peca, os } = await cenario(10)
    await (await acoes()).completeServiceOrder(
      os.id,
      "ok",
      [
        { description: "Mão de obra", quantity: 1, unitPrice: 200 },
        { description: "Filtro", quantity: 3, unitPrice: 40, partId: peca.id },
      ],
      false
    )

    expect(await saldoDa(peca.id)).toBe(7)
    // Só a peça vira movimento.
    expect(await testDb.db.stockMovement.count()).toBe(1)
  })

  it("concluir DUAS VEZES não baixa em dobro", async () => {
    // O técnico reabre a OS para corrigir a nota de conclusão, ou a fila
    // offline reenvia. Baixar de novo faria o saldo despencar sem ninguém ter
    // tirado nada da prateleira.
    const { peca, os } = await cenario(10)
    const a = await acoes()
    const itens = [{ description: "Filtro", quantity: 2, unitPrice: 40, partId: peca.id }]

    await a.completeServiceOrder(os.id, "primeira", itens, false)
    await a.completeServiceOrder(os.id, "corrigindo a nota", itens, false)

    expect(await saldoDa(peca.id)).toBe(8)
    expect(await testDb.db.stockMovement.count()).toBe(1)
  })

  it("saldo insuficiente NÃO impede concluir — fica negativo", async () => {
    // O serviço aconteceu no mundo real. Recusar a conclusão porque o cadastro
    // estava desatualizado faria o técnico digitar a peça à mão e perder a
    // baixa — e a empresa pararia de registrar. O negativo é a pendência
    // honesta, e aparece em vermelho na tela de estoque.
    const { peca, os } = await cenario(1)
    // Nao lanca: a prova e o saldo, e nao um retorno (a Action nao devolve nada).
    await expect(
      (await acoes()).completeServiceOrder(
        os.id,
        "ok",
        [{ description: "Filtro", quantity: 3, unitPrice: 40, partId: peca.id }],
        false
      )
    ).resolves.not.toThrow()

    expect(await saldoDa(peca.id)).toBe(-2)
  })

  it("a peça sai do local do TÉCNICO quando ele tem van", async () => {
    // Baixar sempre do almoxarifado faria a van acumular peça já usada e o
    // depósito ficar negativo sem ninguém ter tirado nada de lá.
    const { tenant, tecnico, peca, os } = await cenario(10)
    const van = await testDb.db.stockLocation.create({
      data: { tenantId: tenant.id, name: "Van do Carlos", type: "VEICULO", userId: tecnico.id },
    })
    await testDb.db.stockBalance.create({
      data: { partId: peca.id, locationId: van.id, quantity: 5 },
    })

    await (await acoes()).completeServiceOrder(
      os.id,
      "ok",
      [{ description: "Filtro", quantity: 2, unitPrice: 40, partId: peca.id }],
      false
    )

    const mov = await testDb.db.stockMovement.findFirst({ where: { orderId: os.id } })
    expect(mov!.locationId).toBe(van.id)
    // O saldo da van cai; o do almoxarifado fica intacto.
    const naVan = await testDb.db.stockBalance.findFirst({
      where: { partId: peca.id, locationId: van.id },
    })
    expect(Number(naVan!.quantity)).toBe(3)
  })

  it("o vínculo com a peça FICA gravado no item", async () => {
    // É ele que permite reabrir a OS sem perder a ligação — e o que a tela
    // devolve ao diálogo para a linha continuar marcada como do estoque.
    const { peca, os } = await cenario()
    await (await acoes()).completeServiceOrder(
      os.id,
      "ok",
      [{ description: "Filtro", quantity: 1, unitPrice: 40, partId: peca.id }],
      false
    )

    const item = await testDb.db.serviceItem.findFirst({ where: { orderId: os.id } })
    expect(item!.partId).toBe(peca.id)
  })
})
