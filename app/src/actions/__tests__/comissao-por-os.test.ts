import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A comissão por OS, atravessando as ações de verdade.
//
// ─── Por que os testes daqui não usam a regra pura ───────────────────────────
//
// A conta está provada em lib/__tests__/comissao.test.ts. O que se prova AQUI é
// o que a conta sozinha não garante: que ela é CHAMADA nos caminhos certos.
//
// Uma OS chega a "concluída" ou "faturada" por mais caminhos do que parece —
// `completeServiceOrder`, `updateOrderStatus`, `emitNfse` (que grava
// `status: "INVOICED"` direto, sem passar pelas outras duas) e a conciliação
// diária da nota. Um gancho pendurado nos dois lugares óbvios nunca dispararia
// pelo botão de nota fiscal, que é justamente o único fluxo com imposto para
// descontar.

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
    requireCotaDeOs: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string) => chave,
  }))
  // Fora do que se testa aqui: aviso ao cliente, notificação e estoque.
  vi.doMock("@/lib/enviar-aviso-cliente", () => ({ avisarClienteDaOs: vi.fn() }))
  vi.doMock("@/lib/notificar", () => ({ notificar: vi.fn() }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/service-orders")

async function cenario(opts: { issRate?: number | null } = {}) {
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", fiscalIssRate: opts.issRate === undefined ? 5 : opts.issRate },
  })
  // O autor das acoes precisa existir: o historico da OS grava uma FK para ele.
  await testDb.db.user.create({
    data: { id: "u-dono", tenantId: tenant.id, name: "Adriel", email: "dono@ex.com", role: "OWNER" },
  })
  const tecnica = await testDb.db.user.create({
    data: { id: "u-ana", tenantId: tenant.id, name: "Ana Souza", email: "ana@ex.com", role: "TECHNICIAN" },
  })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Auto Posto Rodovia" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      number: 12,
      title: "Troca de compressor",
      clientId: cliente.id,
      technicianId: tecnica.id,
      status: "IN_PROGRESS",
      totalAmount: 0,
    },
  })
  mockGetTenant.mockResolvedValue({
    tenantId: tenant.id,
    userId: "u-dono",
    role: "OWNER",
    branchId: null,
  })
  return { tenant, tecnica, cliente, os }
}

async function comissaoDa(orderId: string) {
  return testDb.db.expense.findUnique({ where: { orderId } })
}

const item = { description: "Serviço", quantity: 1, unitPrice: 1200, partId: null }

describe("a comissão nasce na conclusão", () => {
  it("concluir com 10% cria a conta a pagar", async () => {
    // "assim que a ordem de serviço for concluída, já adicionar no contas a
    // pagar a porcentagem do funcionário."
    const { os, tecnica } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)

    const c = await comissaoDa(os.id)
    expect(Number(c?.amount)).toBe(120)
    expect(c?.payeeId).toBe(tecnica.id)
    expect(c?.status).toBe("PENDING")
    // A base e a porcentagem ficam gravadas, e não só no texto: "quanto de ISS
    // saiu das comissões deste mês" precisa ser uma consulta.
    expect(Number(c?.commissionBase)).toBe(1200)
    expect(Number(c?.commissionPct)).toBe(10)
  })

  it("sem porcentagem, não nasce comissão nenhuma", async () => {
    // NULL é o estado de toda OS que já existe. O recurso liga sozinho quando
    // alguém digita o primeiro número — nenhuma empresa acorda com contas a
    // pagar que não pediu.
    const { os } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false)

    expect(await comissaoDa(os.id)).toBeNull()
  })

  it("a descrição explica a conta, para a pessoa conferir", async () => {
    const { os } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)

    const c = await comissaoDa(os.id)
    expect(c?.description).toContain("10%")
    expect(c?.description).toContain("1.200,00")
    // E usa o formato de OS do produto, e não um inventado.
    expect(c?.description).toContain("OS")
  })

  it("não vence hoje — vence no fechamento seguinte", async () => {
    // Despesa que nasce vencendo hoje aparece como atrasada amanhã, dispara o
    // alerta de vencidos no topo de todas as telas e empurra para fora dele o
    // aluguel e o fornecedor — que é o que aquele aviso existe para mostrar.
    const { os } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)

    const c = await comissaoDa(os.id)
    const hoje = new Date()
    expect(c!.dueDate.getTime()).toBeGreaterThan(hoje.getTime())
  })
})

describe("reconcluir não duplica", () => {
  it("concluir a mesma OS duas vezes deixa UMA comissão", async () => {
    // Reconcluir é o fluxo NORMAL de correção: o botão vira "editar" e chama a
    // mesma ação. Sem chave única, cada correção viraria uma conta a pagar.
    const { os } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    await completeServiceOrder(os.id, "Trocado de novo", [item], false, 10)

    const todas = await testDb.db.expense.findMany({ where: { orderId: os.id } })
    expect(todas).toHaveLength(1)
    expect(Number(todas[0].amount)).toBe(120)
  })

  it("corrigir o valor da OS corrige a comissão junto", async () => {
    // Enquanto ninguém pagou, a linha é mantida viva: o dono conserta a OS e a
    // comissão acompanha, sem ninguém precisar lembrar de nada.
    const { os } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    await completeServiceOrder(
      os.id,
      "Era mais caro",
      [{ ...item, unitPrice: 1800 }],
      false,
      10
    )

    expect(Number((await comissaoDa(os.id))?.amount)).toBe(180)
  })

  it("mudar a porcentagem recalcula", async () => {
    const { os } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    await completeServiceOrder(os.id, "Trocado", [item], false, 15)

    expect(Number((await comissaoDa(os.id))?.amount)).toBe(180)
  })
})

describe("a comissão desfaz quando a OS desfaz", () => {
  it("reabrir a OS apaga a conta a pagar", async () => {
    // Uma OS reaberta não foi entregue. Deixar a comissão de pé faria o dono
    // pagar por serviço que voltou para a fila.
    const { os } = await cenario()
    const { completeServiceOrder, updateOrderStatus } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    expect(await comissaoDa(os.id)).not.toBeNull()

    await updateOrderStatus(os.id, "IN_PROGRESS")

    expect(await comissaoDa(os.id)).toBeNull()
  })

  it("cancelar a OS apaga a conta a pagar", async () => {
    const { os } = await cenario()
    const { completeServiceOrder, updateOrderStatus } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    await updateOrderStatus(os.id, "CANCELLED")

    expect(await comissaoDa(os.id)).toBeNull()
  })

  it("mas comissão JÁ PAGA congela — não some nem muda", async () => {
    // O dinheiro saiu do caixa. Apagar a linha faria a despesa sumir do
    // resultado do mês em que foi paga; reescrevê-la faria o sistema discordar
    // do extrato. Corrigir comissão paga é conversa entre pessoas.
    const { os } = await cenario()
    const { completeServiceOrder, updateOrderStatus } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    await testDb.db.expense.update({
      where: { orderId: os.id },
      data: { status: "PAID", paidAt: new Date() },
    })

    await updateOrderStatus(os.id, "IN_PROGRESS")

    const c = await comissaoDa(os.id)
    expect(c).not.toBeNull()
    expect(Number(c?.amount)).toBe(120)
    expect(c?.status).toBe("PAID")
  })
})

describe("faturada não é a mesma coisa que ter nota", () => {
  it("faturar SEM nota não desconta imposto nenhum", async () => {
    // O caso mais comum de quem cobra sem emitir nota. Descontar ISS aqui
    // tiraria dinheiro da técnica para pagar um tributo que ninguém recolheu.
    const { os } = await cenario()
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], true, 10)

    const c = await comissaoDa(os.id)
    expect(Number(c?.amount)).toBe(120)
    expect(Number(c?.commissionIss)).toBe(0)
  })

  it("com nota EMITIDA, desconta o imposto da base", async () => {
    // "se for faturada também, porém, descontar a taxa da nota fiscal."
    const { os } = await cenario({ issRate: 5 })
    const { completeServiceOrder, updateOrderStatus } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    expect(Number((await comissaoDa(os.id))?.amount)).toBe(120)

    // A prefeitura aceitou: é aqui que o desconto aparece.
    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { nfseStatus: "Issued", nfseIssuedAt: new Date() },
    })
    await updateOrderStatus(os.id, "DONE")

    const c = await comissaoDa(os.id)
    expect(Number(c?.commissionIss)).toBe(60)
    expect(Number(c?.commissionBase)).toBe(1140)
    expect(Number(c?.amount)).toBe(114)
  })

  it("nota REJEITADA não desconta imposto", async () => {
    // `nfseIssuedAt` é carimbado no ENVIO, antes de a prefeitura responder.
    // Quem descontasse por ele deixaria a comissão líquida de um imposto que
    // ninguém vai recolher — e sempre contra a funcionária.
    const { os } = await cenario()
    const { completeServiceOrder, updateOrderStatus } = await acoes()

    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { nfseStatus: "Cancelled", nfseIssuedAt: new Date() },
    })
    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    await updateOrderStatus(os.id, "DONE")

    expect(Number((await comissaoDa(os.id))?.amount)).toBe(120)
  })

  it("usa a alíquota DA EMPRESA", async () => {
    const { os } = await cenario({ issRate: 2 })
    const { completeServiceOrder, updateOrderStatus } = await acoes()

    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { nfseStatus: "Issued" },
    })
    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    await updateOrderStatus(os.id, "DONE")

    const c = await comissaoDa(os.id)
    expect(Number(c?.commissionIss)).toBe(24)
    expect(Number(c?.amount)).toBe(117.6)
  })
})

describe("quem recebe", () => {
  it("OS sem responsável não gera comissão", async () => {
    // Sem responsável não há a quem pagar. Criar a linha sem dono faria uma
    // conta a pagar que ninguém consegue liquidar.
    const { os } = await cenario()
    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { technicianId: null },
    })
    const { completeServiceOrder } = await acoes()

    await completeServiceOrder(os.id, "Trocado", [item], false, 10)

    expect(await comissaoDa(os.id)).toBeNull()
  })

  it("trocar o técnico troca o dono da conta a pagar", async () => {
    // Sem isto, a despesa continuaria no nome de quem saiu da empresa.
    const { os, tenant, tecnica } = await cenario()
    const { completeServiceOrder } = await acoes()
    await completeServiceOrder(os.id, "Trocado", [item], false, 10)
    expect((await comissaoDa(os.id))?.payeeId).toBe(tecnica.id)

    const outro = await testDb.db.user.create({
      data: { id: "u-bruno", tenantId: tenant.id, name: "Bruno", email: "b@ex.com", role: "TECHNICIAN" },
    })
    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { technicianId: outro.id },
    })
    await completeServiceOrder(os.id, "Trocado", [item], false, 10)

    expect((await comissaoDa(os.id))?.payeeId).toBe(outro.id)
  })
})

describe("isolamento entre empresas", () => {
  it("uma OS de outra empresa não gera comissão nesta", async () => {
    await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const clienteAlheio = await testDb.db.client.create({
      data: { tenantId: outra.id, name: "Cliente alheio" },
    })
    const osAlheia = await testDb.db.serviceOrder.create({
      data: {
        tenantId: outra.id,
        number: 1,
        title: "Serviço alheio",
        clientId: clienteAlheio.id,
        status: "DONE",
        totalAmount: 5000,
        commissionPct: 10,
      },
    })

    const { reconciliarComissao } = await import("@/lib/comissao-db")
    // O tenant do cenário tentando reconciliar a OS do vizinho.
    const tenantDoCenario = (await testDb.db.tenant.findFirst({ where: { name: "Polar Clima" } }))!
    const r = await reconciliarComissao(testDb.db, tenantDoCenario.id, osAlheia.id)

    expect(r.acao).toBe("nada")
    expect(await comissaoDa(osAlheia.id)).toBeNull()
  })
})

describe("o reconciliador é idempotente", () => {
  it("chamar duas vezes seguidas não muda nada", async () => {
    // É o que torna seguro chamá-lo de todo lugar que mexe na OS, sem ninguém
    // precisar saber o que os outros lugares já fizeram.
    const { os, tenant } = await cenario()
    const { completeServiceOrder } = await acoes()
    await completeServiceOrder(os.id, "Trocado", [item], false, 10)

    const { reconciliarComissao } = await import("@/lib/comissao-db")
    const antes = await comissaoDa(os.id)
    const r1 = await reconciliarComissao(testDb.db, tenant.id, os.id)
    const r2 = await reconciliarComissao(testDb.db, tenant.id, os.id)
    const depois = await comissaoDa(os.id)

    expect(r1.acao).toBe("nada")
    expect(r2.acao).toBe("nada")
    expect(depois?.id).toBe(antes?.id)
    expect(Number(depois?.amount)).toBe(Number(antes?.amount))
  })
})
