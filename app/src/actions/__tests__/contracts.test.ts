import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
})

afterAll(async () => { await testDb.close() })
beforeEach(async () => { await testDb.reset(); mockGetTenant.mockReset() })

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Limpeza Ltda" } })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Condomínio Sol" },
  })
  return { tenant, cliente }
}

function form(dados: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(dados)) fd.set(k, v)
  return fd
}

const base = (clienteId: string) => ({
  clientId: clienteId,
  title: "Limpeza semanal",
  frequency: "WEEKLY",
  amount: "450",
  startsAt: "2026-08-01",
})

describe("contrato — cadastro", () => {
  it("cria e calcula a próxima execução", async () => {
    const { tenant, cliente } = await cenario()
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { salvarContrato } = await import("@/actions/contracts")

    expect(await salvarContrato({}, form(base(cliente.id)))).toEqual({ ok: true })

    const c = await testDb.db.serviceContract.findFirst()
    expect(c?.title).toBe("Limpeza semanal")
    expect(c?.active).toBe(true)
    // nextRunAt já alcançou o presente, então não nasce vencido.
    expect(c!.nextRunAt >= dia("2026-08-01")).toBe(true)
  })

  it("recusa cliente de outra empresa", async () => {
    // clientId vem do formulário: sem conferir o tenant, daria pra criar
    // contrato apontando pro cliente de outra empresa.
    const a = await cenario()
    const b = await cenario()
    mockGetTenant.mockResolvedValue({ tenantId: b.tenant.id, userId: "u1", role: "OWNER" })
    const { salvarContrato } = await import("@/actions/contracts")

    expect(await salvarContrato({}, form(base(a.cliente.id)))).toEqual({
      erro: "clienteNaoEncontrado",
    })
    expect(await testDb.db.serviceContract.count()).toBe(0)
  })

  it("recusa fim antes do início", async () => {
    const { tenant, cliente } = await cenario()
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { salvarContrato } = await import("@/actions/contracts")

    const r = await salvarContrato({}, form({ ...base(cliente.id), endsAt: "2026-07-01" }))
    expect(r).toEqual({ erro: "fimAntesDoInicio" })
  })

  it("bloqueia TECHNICIAN", async () => {
    // Contrato define faturamento recorrente — é decisão comercial.
    const { tenant, cliente } = await cenario()
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { salvarContrato } = await import("@/actions/contracts")

    expect(await salvarContrato({}, form(base(cliente.id)))).toEqual({ erro: "semPermissao" })
    expect(await testDb.db.serviceContract.count()).toBe(0)
  })

  it("não apaga contrato de outra empresa", async () => {
    const a = await cenario()
    const b = await cenario()
    const c = await testDb.db.serviceContract.create({
      data: {
        tenantId: a.tenant.id, clientId: a.cliente.id, title: "X",
        frequency: "MONTHLY", startsAt: dia("2026-08-01"), nextRunAt: dia("2026-09-01"),
      },
    })
    mockGetTenant.mockResolvedValue({ tenantId: b.tenant.id, userId: "u1", role: "OWNER" })
    const { excluirContrato } = await import("@/actions/contracts")

    expect(await excluirContrato(c.id)).toEqual({ erro: "naoEncontrado" })
    expect(await testDb.db.serviceContract.count()).toBe(1)
  })
})

describe("contrato — geração automática de OS", () => {
  async function contratoEm(tenantId: string, clientId: string, over = {}) {
    return testDb.db.serviceContract.create({
      data: {
        tenantId, clientId, title: "Limpeza mensal", frequency: "MONTHLY",
        dayOfMonth: 10, amount: 800, startsAt: dia("2026-01-10"),
        nextRunAt: dia("2026-08-10"), ...over,
      },
    })
  }

  it("gera a OS com a data agendada e o valor do contrato", async () => {
    const { tenant, cliente } = await cenario()
    const c = await contratoEm(tenant.id, cliente.id)
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    const n = await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))

    expect(n).toBe(1)
    const os = await testDb.db.serviceOrder.findFirst()
    expect(os?.title).toBe("Limpeza mensal")
    expect(os?.contractId).toBe(c.id)
    expect(os?.scheduledAt?.toISOString().slice(0, 10)).toBe("2026-08-10")
    expect(Number(os?.totalAmount)).toBe(800)
  })

  it("avança a próxima execução mantendo o dia escolhido", async () => {
    const { tenant, cliente } = await cenario()
    const c = await contratoEm(tenant.id, cliente.id)
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))

    const depois = await testDb.db.serviceContract.findUnique({ where: { id: c.id } })
    expect(depois?.nextRunAt.toISOString().slice(0, 10)).toBe("2026-09-10")
    expect(depois?.lastRunAt?.toISOString().slice(0, 10)).toBe("2026-08-10")
  })

  it("NÃO duplica quando o cron roda duas vezes", async () => {
    // É o que permite reprocessar o cron sem medo — e o que impede uma OS
    // repetida chegar ao cliente final.
    const { tenant, cliente } = await cenario()
    await contratoEm(tenant.id, cliente.id)
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))
    // Segunda rodada no mesmo dia: nextRunAt já avançou, então nem entra na
    // busca. Força o cenário voltando a data pra provar a guarda de fato.
    await testDb.db.serviceContract.updateMany({ data: { nextRunAt: dia("2026-08-10") } })
    const n2 = await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))

    expect(n2).toBe(0)
    expect(await testDb.db.serviceOrder.count()).toBe(1)
  })

  it("não gera o que ainda não venceu", async () => {
    const { tenant, cliente } = await cenario()
    await contratoEm(tenant.id, cliente.id, { nextRunAt: dia("2026-12-10") })
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    expect(await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))).toBe(0)
    expect(await testDb.db.serviceOrder.count()).toBe(0)
  })

  it("desliga o contrato encerrado em vez de gerar pra cliente que saiu", async () => {
    const { tenant, cliente } = await cenario()
    const c = await contratoEm(tenant.id, cliente.id, { endsAt: dia("2026-07-31") })
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    expect(await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))).toBe(0)
    const depois = await testDb.db.serviceContract.findUnique({ where: { id: c.id } })
    expect(depois?.active).toBe(false)
    expect(await testDb.db.serviceOrder.count()).toBe(0)
  })

  it("ignora contrato desativado", async () => {
    const { tenant, cliente } = await cenario()
    await contratoEm(tenant.id, cliente.id, { active: false })
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    expect(await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))).toBe(0)
  })

  it("numera a OS continuando a sequência da empresa", async () => {
    // Sem isso, a OS do contrato começaria em 1 e colidiria com a numeração
    // que a empresa já usa nos documentos.
    const { tenant, cliente } = await cenario()
    await testDb.db.serviceOrder.create({
      data: { number: 42, title: "Avulsa", tenantId: tenant.id, clientId: cliente.id },
    })
    await contratoEm(tenant.id, cliente.id)
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))

    const gerada = await testDb.db.serviceOrder.findFirst({ where: { contractId: { not: null } } })
    expect(gerada?.number).toBe(43)
  })

  it("cada empresa recebe só as suas", async () => {
    const a = await cenario()
    const b = await cenario()
    await contratoEm(a.tenant.id, a.cliente.id)
    await contratoEm(b.tenant.id, b.cliente.id)
    const { gerarOsDosContratos } = await import("@/actions/contracts")

    await gerarOsDosContratos(dia("2026-08-08"), dia("2026-08-11"))

    for (const t of [a.tenant.id, b.tenant.id]) {
      const os = await testDb.db.serviceOrder.findMany({ where: { tenantId: t } })
      expect(os).toHaveLength(1)
      expect(os[0].number).toBe(1)
    }
  })
})
