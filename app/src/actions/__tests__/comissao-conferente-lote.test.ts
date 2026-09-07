import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O conferente diário das comissões, e o pagamento em lote.
//
// ─── O que o conferente existe para achar ────────────────────────────────────
//
// Comissão FALTANDO alguém reclama — o técnico cobra no dia 5.
// Comissão ERRADA ninguém nota — R$ 120 e R$ 180 são os dois plausíveis.
//
// Os testes daqui provam que ele acha os dois casos, que ele NÃO acusa o que
// está certo (um conferente que grita todo dia é desligado, e aí não serve para
// nada), e que ele não escreve nada.

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
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const agora = new Date("2026-09-20T12:00:00Z")

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima", fiscalIssRate: 5 } })
  const ana = await testDb.db.user.create({
    data: { id: "u-ana", tenantId: tenant.id, name: "Ana Souza", email: "ana@ex.com", role: "TECHNICIAN" },
  })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Auto Posto Rodovia" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u-dono", role: "OWNER", branchId: null })
  return { tenant, ana, cliente }
}

/** Uma OS concluída com comissão de 10% sobre o total informado. */
async function osComComissao(
  ctx: { tenant: { id: string }; ana: { id: string }; cliente: { id: string } },
  opts: { numero: number; total: number; valorGravado?: number | null; concluidaEm?: Date }
) {
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: ctx.tenant.id,
      number: opts.numero,
      title: "Serviço",
      clientId: ctx.cliente.id,
      technicianId: ctx.ana.id,
      status: "DONE",
      totalAmount: opts.total,
      commissionPct: 10,
      concludedAt: opts.concluidaEm ?? new Date("2026-09-10T12:00:00Z"),
      items: { create: [{ description: "Mão de obra", quantity: 1, unitPrice: opts.total, total: opts.total }] },
    },
  })
  if (opts.valorGravado !== null && opts.valorGravado !== undefined) {
    await testDb.db.expense.create({
      data: {
        tenantId: ctx.tenant.id,
        orderId: os.id,
        payeeId: ctx.ana.id,
        description: "Comissão",
        amount: opts.valorGravado,
        dueDate: new Date("2026-10-05T00:00:00Z"),
        category: "VARIABLE",
      },
    })
  }
  return os
}

const conferir = () => import("@/lib/comissao-conferente")

describe("o conferente acha o que ninguém reclamaria", () => {
  it("não acusa nada quando está tudo certo", async () => {
    // O teste mais importante: um conferente que grita todo dia é desligado na
    // primeira semana, e aí ele deixa de servir para o que serve.
    const ctx = await cenario()
    await osComComissao(ctx, { numero: 1, total: 1200, valorGravado: 120 })
    const { conferirComissoes } = await conferir()

    const r = await conferirComissoes(testDb.db, ctx.tenant.id, agora)

    expect(r.divergencias).toEqual([])
    expect(r.conferidas).toBe(1)
  })

  it("acha comissão com VALOR diferente", async () => {
    // O caso que ninguém nota: a OS passou a valer R$ 1.800 e a comissão
    // continua sendo os R$ 120 de R$ 1.200. Os dois números são plausíveis.
    const ctx = await cenario()
    await osComComissao(ctx, { numero: 1, total: 1800, valorGravado: 120 })
    const { conferirComissoes } = await conferir()

    const r = await conferirComissoes(testDb.db, ctx.tenant.id, agora)

    expect(r.divergencias).toHaveLength(1)
    expect(r.divergencias[0].tipo).toBe("valorDiferente")
    expect(r.divergencias[0].esperado).toBe(180)
    expect(r.divergencias[0].atual).toBe(120)
    // Pelo número da OS, e não pelo id: o aviso vai para uma pessoa ler.
    expect(r.divergencias[0].numero).toContain("OS")
  })

  it("acha comissão FALTANDO", async () => {
    const ctx = await cenario()
    await osComComissao(ctx, { numero: 1, total: 1200, valorGravado: null })
    const { conferirComissoes } = await conferir()

    const r = await conferirComissoes(testDb.db, ctx.tenant.id, agora)

    expect(r.divergencias).toHaveLength(1)
    expect(r.divergencias[0].tipo).toBe("faltando")
    expect(r.divergencias[0].esperado).toBe(120)
  })

  it("acha comissão SOBRANDO numa OS reaberta", async () => {
    // A OS voltou para a fila e a exclusão da despesa falhou. O dono pagaria
    // por serviço que não foi entregue.
    const ctx = await cenario()
    const os = await osComComissao(ctx, { numero: 1, total: 1200, valorGravado: 120 })
    await testDb.db.serviceOrder.update({ where: { id: os.id }, data: { status: "IN_PROGRESS" } })
    const { conferirComissoes } = await conferir()

    const r = await conferirComissoes(testDb.db, ctx.tenant.id, agora)

    expect(r.divergencias).toHaveLength(1)
    expect(r.divergencias[0].tipo).toBe("sobrando")
    expect(r.divergencias[0].atual).toBe(120)
  })

  it("comissão JÁ PAGA não é divergência", async () => {
    // Paga é congelada por decisão de desenho. Acusá-la seria gritar lobo todo
    // dia, para sempre — e o conferente acabaria desligado.
    const ctx = await cenario()
    const os = await osComComissao(ctx, { numero: 1, total: 1800, valorGravado: 120 })
    await testDb.db.expense.update({
      where: { orderId: os.id },
      data: { status: "PAID", paidAt: new Date() },
    })
    const { conferirComissoes } = await conferir()

    expect((await conferirComissoes(testDb.db, ctx.tenant.id, agora)).divergencias).toEqual([])
  })

  it("NÃO escreve nada", async () => {
    // Corrigir sozinho reescreveria um número que a pessoa já viu — e, se o
    // reconciliador tiver defeito, espalharia o defeito em silêncio.
    const ctx = await cenario()
    const os = await osComComissao(ctx, { numero: 1, total: 1800, valorGravado: 120 })
    const { conferirComissoes } = await conferir()

    await conferirComissoes(testDb.db, ctx.tenant.id, agora)

    const depois = await testDb.db.expense.findUnique({ where: { orderId: os.id } })
    expect(Number(depois?.amount)).toBe(120)
  })

  it("usa a MESMA regra do reconciliador", async () => {
    // Um conferente com regra própria acusaria divergência onde não há, todo
    // dia. Aqui: com a empresa comissionando só mão de obra, a peça sai da base
    // nos dois lados.
    const ctx = await cenario()
    await testDb.db.tenant.update({
      where: { id: ctx.tenant.id },
      data: { commissionBase: "MAO_DE_OBRA" },
    })
    const peca = await testDb.db.part.create({
      data: { tenantId: ctx.tenant.id, name: "Compressor", stock: 1 },
    })
    const os = await testDb.db.serviceOrder.create({
      data: {
        tenantId: ctx.tenant.id,
        number: 7,
        title: "Serviço",
        clientId: ctx.cliente.id,
        technicianId: ctx.ana.id,
        status: "DONE",
        totalAmount: 1200,
        commissionPct: 10,
        concludedAt: new Date("2026-09-10T12:00:00Z"),
        items: {
          create: [
            { description: "Compressor", quantity: 1, unitPrice: 1000, total: 1000, partId: peca.id },
            { description: "Mão de obra", quantity: 1, unitPrice: 200, total: 200 },
          ],
        },
      },
    })
    await testDb.db.expense.create({
      data: {
        tenantId: ctx.tenant.id,
        orderId: os.id,
        payeeId: ctx.ana.id,
        description: "Comissão",
        amount: 20,
        dueDate: new Date("2026-10-05T00:00:00Z"),
        category: "VARIABLE",
      },
    })
    const { conferirComissoes } = await conferir()

    expect((await conferirComissoes(testDb.db, ctx.tenant.id, agora)).divergencias).toEqual([])
  })

  it("diz quantas ficaram FORA da janela, em vez de esconder", async () => {
    // "0 divergências" não pode significar "não olhei". O que fica fora dos 45
    // dias é contado e devolvido.
    const ctx = await cenario()
    await osComComissao(ctx, {
      numero: 1,
      total: 1200,
      valorGravado: null,
      concluidaEm: new Date("2026-01-10T12:00:00Z"),
    })
    const { conferirComissoes } = await conferir()

    const r = await conferirComissoes(testDb.db, ctx.tenant.id, agora)

    expect(r.divergencias).toEqual([])
    expect(r.foraDaJanela).toBe(1)
  })

  it("uma comissão PENDENTE antiga é conferida mesmo fora da janela", async () => {
    // A janela limita a busca por comissão FALTANDO. As pendentes são poucas e
    // são o caso que interessa — deixá-las de fora esconderia o dinheiro que
    // está prestes a sair.
    const ctx = await cenario()
    await osComComissao(ctx, {
      numero: 1,
      total: 1800,
      valorGravado: 120,
      concluidaEm: new Date("2026-01-10T12:00:00Z"),
    })
    const { conferirComissoes } = await conferir()

    const r = await conferirComissoes(testDb.db, ctx.tenant.id, agora)

    expect(r.divergencias).toHaveLength(1)
    expect(r.divergencias[0].tipo).toBe("valorDiferente")
  })

  it("não olha a empresa do vizinho", async () => {
    const ctx = await cenario()
    await osComComissao(ctx, { numero: 1, total: 1800, valorGravado: 120 })
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const { conferirComissoes } = await conferir()

    expect((await conferirComissoes(testDb.db, outra.id, agora)).divergencias).toEqual([])
  })

  it("o resumo cita as primeiras e conta o resto", async () => {
    // Um aviso que só informa a contagem obriga a abrir a tela para saber o que
    // olhar; um que lista trinta não cabe numa notificação de celular.
    const { resumirDivergencias } = await conferir()
    const d = (n: string) => ({ orderId: n, numero: n, tipo: "faltando" as const, esperado: 1, atual: null })

    expect(resumirDivergencias([d("OS1"), d("OS2")])).toBe("OS1, OS2")
    expect(resumirDivergencias([d("OS1"), d("OS2"), d("OS3"), d("OS4"), d("OS5")])).toBe(
      "OS1, OS2, OS3 e mais 2"
    )
  })
})

describe("pagar as comissões em lote", () => {
  async function comTresComissoes() {
    const ctx = await cenario()
    for (const n of [1, 2, 3]) {
      await osComComissao(ctx, { numero: n, total: 1200, valorGravado: 120 })
    }
    return ctx
  }

  it("paga todas as pendentes da pessoa de uma vez", async () => {
    // Quatro técnicos com vinte OS são oitenta cliques no fechamento.
    const ctx = await comTresComissoes()
    const { pagarComissoesDe } = await import("@/actions/finance")

    const r = await pagarComissoesDe(ctx.ana.id)

    expect(r.ok).toBe(true)
    expect(r.pagas).toBe(3)
    expect(r.total).toBe(360)
    const pagas = await testDb.db.expense.count({
      where: { payeeId: ctx.ana.id, status: "PAID" },
    })
    expect(pagas).toBe(3)
  })

  it("não toca nas comissões de OUTRA pessoa", async () => {
    const ctx = await comTresComissoes()
    const bruno = await testDb.db.user.create({
      data: { id: "u-bruno", tenantId: ctx.tenant.id, name: "Bruno", email: "b@ex.com", role: "TECHNICIAN" },
    })
    const osDoBruno = await testDb.db.serviceOrder.create({
      data: {
        tenantId: ctx.tenant.id,
        number: 9,
        title: "Serviço",
        clientId: ctx.cliente.id,
        technicianId: bruno.id,
        status: "DONE",
        totalAmount: 500,
        commissionPct: 10,
        concludedAt: new Date("2026-09-10T12:00:00Z"),
      },
    })
    await testDb.db.expense.create({
      data: {
        tenantId: ctx.tenant.id,
        orderId: osDoBruno.id,
        payeeId: bruno.id,
        description: "Comissão",
        amount: 50,
        dueDate: new Date("2026-10-05T00:00:00Z"),
        category: "VARIABLE",
      },
    })
    const { pagarComissoesDe } = await import("@/actions/finance")

    await pagarComissoesDe(ctx.ana.id)

    const doBruno = await testDb.db.expense.findUnique({ where: { orderId: osDoBruno.id } })
    expect(doBruno?.status).toBe("PENDING")
  })

  it("não toca em despesa comum — só em comissão", async () => {
    // O filtro exige orderId. Sem ele, "pagar as comissões da Ana" pagaria o
    // aluguel junto se alguém tivesse posto payeeId numa despesa qualquer.
    const ctx = await comTresComissoes()
    const aluguel = await testDb.db.expense.create({
      data: {
        tenantId: ctx.tenant.id,
        payeeId: ctx.ana.id,
        description: "Aluguel",
        amount: 3000,
        dueDate: new Date("2026-10-05T00:00:00Z"),
        category: "FIXED",
      },
    })
    const { pagarComissoesDe } = await import("@/actions/finance")

    await pagarComissoesDe(ctx.ana.id)

    expect((await testDb.db.expense.findUnique({ where: { id: aluguel.id } }))?.status).toBe("PENDING")
  })

  it("com a opção DESLIGADA, recusa", async () => {
    // A trava mora na Action, e não só no botão: a Action é endereço HTTP.
    const ctx = await comTresComissoes()
    await testDb.db.tenant.update({
      where: { id: ctx.tenant.id },
      data: { commissionBulkPay: false },
    })
    const { pagarComissoesDe } = await import("@/actions/finance")

    const r = await pagarComissoesDe(ctx.ana.id)

    expect(r.erro).toBe("loteDesligado")
    expect(await testDb.db.expense.count({ where: { status: "PAID" } })).toBe(0)
  })

  it("técnico não paga a própria comissão", async () => {
    const ctx = await comTresComissoes()
    mockGetTenant.mockResolvedValue({
      tenantId: ctx.tenant.id,
      userId: ctx.ana.id,
      role: "TECHNICIAN",
      branchId: null,
    })
    const { pagarComissoesDe } = await import("@/actions/finance")

    expect((await pagarComissoesDe(ctx.ana.id)).erro).toBe("semPermissao")
    expect(await testDb.db.expense.count({ where: { status: "PAID" } })).toBe(0)
  })

  it("pessoa de outra empresa não tem nada a pagar aqui", async () => {
    const ctx = await comTresComissoes()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    mockGetTenant.mockResolvedValue({
      tenantId: outra.id,
      userId: "x",
      role: "OWNER",
      branchId: null,
    })
    const { pagarComissoesDe } = await import("@/actions/finance")

    expect((await pagarComissoesDe(ctx.ana.id)).erro).toBe("nadaAPagar")
    expect(await testDb.db.expense.count({ where: { status: "PAID" } })).toBe(0)
  })

  it("sem comissão pendente, diz que não há o que pagar", async () => {
    const ctx = await cenario()
    const { pagarComissoesDe } = await import("@/actions/finance")

    expect((await pagarComissoesDe(ctx.ana.id)).erro).toBe("nadaAPagar")
  })
})
