import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Parcelar o recebimento de uma OS, pela ação de verdade.
//
// A conta está provada em lib/__tests__/plano-de-pagamento.test.ts. O que se
// prova AQUI é o que a conta não garante: que o contas a receber fica certo —
// sem somar o serviço duas vezes, sem apagar dinheiro que já entrou, e com a
// competência no lugar para o DRE não partir o mês ao meio.

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    filtroDeFilialAtual: vi.fn().mockResolvedValue({}),
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

const execucao = new Date("2026-09-10T12:00:00Z")
const dia = 24 * 60 * 60 * 1000

async function cenario(opts: { total?: number; comReceita?: boolean } = {}) {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Auto Posto Rodovia" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      number: 42,
      title: "Troca de compressor",
      clientId: cliente.id,
      status: "INVOICED",
      totalAmount: opts.total ?? 2000,
      concludedAt: execucao,
    },
  })
  // Faturar já cria UMA receita com o valor cheio: é ela que o plano substitui.
  if (opts.comReceita !== false) {
    await testDb.db.revenue.create({
      data: {
        tenantId: tenant.id,
        orderId: os.id,
        description: "OS20260042 — Troca de compressor",
        amount: opts.total ?? 2000,
        dueDate: execucao,
      },
    })
  }
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER", branchId: null })
  return { tenant, cliente, os }
}

const acao = () => import("@/actions/parcelamento")

async function recebimentos(orderId: string) {
  return testDb.db.revenue.findMany({ where: { orderId }, orderBy: { dueDate: "asc" } })
}

describe("o caso do dono: R$ 500 à vista e o resto em 7 dias", () => {
  it("substitui a receita cheia pelo plano", async () => {
    // Acrescentar as parcelas ao lado da receita cheia faria o contas a receber
    // somar o serviço duas vezes — o dono cobraria R$ 4.000 de um serviço de
    // R$ 2.000.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()

    const r = await parcelarRecebimento(os.id, 500, 1, 7, true)

    expect(r.ok).toBe(true)
    const linhas = await recebimentos(os.id)
    expect(linhas).toHaveLength(2)
    expect(linhas.reduce((s, l) => s + Number(l.amount), 0)).toBe(2000)
  })

  it("a entrada vence na execução e o saldo 7 dias depois", async () => {
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()

    await parcelarRecebimento(os.id, 500, 1, 7, true)

    const [entrada, saldo] = await recebimentos(os.id)
    expect(Number(entrada.amount)).toBe(500)
    expect(entrada.dueDate.getTime()).toBe(execucao.getTime())
    expect(Number(saldo.amount)).toBe(1500)
    expect(saldo.dueDate.getTime()).toBe(execucao.getTime() + 7 * dia)
  })

  it("a entrada já recebida nasce PAGA", async () => {
    // Ela é paga na hora. Obrigar um segundo clique para marcar seria atrito
    // num gesto que a pessoa acabou de fazer.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()

    await parcelarRecebimento(os.id, 500, 1, 7, true)

    const [entrada, saldo] = await recebimentos(os.id)
    expect(entrada.status).toBe("PAID")
    expect(entrada.paidAt).toBeInstanceOf(Date)
    expect(saldo.status).toBe("PENDING")
  })

  it("entrada combinada mas ainda não recebida fica PENDENTE", async () => {
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()

    await parcelarRecebimento(os.id, 500, 1, 7, false)

    expect((await recebimentos(os.id))[0].status).toBe("PENDING")
  })

  it("a descrição diz qual parcela é", async () => {
    // O cliente lê isto no extrato. "2/3" diz quantas faltam sem obrigar
    // ninguém a contar.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()

    await parcelarRecebimento(os.id, 500, 3, 15, true)

    const d = (await recebimentos(os.id)).map((l) => l.description)
    expect(d[0]).toContain("entrada")
    expect(d[1]).toContain("1/3")
    expect(d[3]).toContain("3/3")
    // E com o número da OS, no formato do produto.
    expect(d[0]).toContain("OS2026")
  })
})

describe("a competência mantém o mês inteiro", () => {
  it("TODAS as parcelas têm competência na execução", async () => {
    // É o ponto: um serviço de R$ 2.000 feito em setembro é resultado de
    // setembro inteiro, mesmo com R$ 1.500 entrando em outubro. Sem isto, o DRE
    // em competência mostraria o mês partido ao meio.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()

    await parcelarRecebimento(os.id, 500, 3, 30, true)

    const linhas = await recebimentos(os.id)
    expect(linhas).toHaveLength(4)
    for (const l of linhas) {
      expect(l.accrualDate?.getTime()).toBe(execucao.getTime())
    }
    // E os vencimentos, esses sim, se espalham pelos meses seguintes.
    expect(linhas[3].dueDate.getTime()).toBe(execucao.getTime() + 90 * dia)
  })
})

describe("o que não pode acontecer", () => {
  it("não refaz o plano por cima de parcela JÁ RECEBIDA", async () => {
    // O dinheiro entrou, está no extrato e está no resultado do mês em que
    // entrou. Refazer por cima é conversa entre pessoas.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()
    await parcelarRecebimento(os.id, 500, 2, 15, true)

    const r = await parcelarRecebimento(os.id, 1000, 3, 30, true)

    expect(r.erro).toBe("jaTemRecebimento")
    // E nada mudou.
    expect(await recebimentos(os.id)).toHaveLength(3)
  })

  it("refazer o plano ANTES de qualquer recebimento é permitido", async () => {
    // Errar o prazo na primeira tentativa é normal, e travar isso obrigaria o
    // dono a apagar receita a mão.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()
    await parcelarRecebimento(os.id, 0, 2, 15, false)

    const r = await parcelarRecebimento(os.id, 500, 3, 30, false)

    expect(r.ok).toBe(true)
    const linhas = await recebimentos(os.id)
    expect(linhas).toHaveLength(4)
    expect(linhas.reduce((s, l) => s + Number(l.amount), 0)).toBe(2000)
  })

  it("técnico não mexe no contas a receber", async () => {
    const { os, tenant } = await cenario()
    mockGetTenant.mockResolvedValue({
      tenantId: tenant.id,
      userId: "u-tec",
      role: "TECHNICIAN",
      branchId: null,
    })
    const { parcelarRecebimento } = await acao()

    expect((await parcelarRecebimento(os.id, 500, 1, 7, true)).erro).toBe("semPermissao")
    expect(await recebimentos(os.id)).toHaveLength(1)
  })

  it("OS de outra empresa não é parcelada", async () => {
    const { os } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    mockGetTenant.mockResolvedValue({ tenantId: outra.id, userId: "x", role: "OWNER", branchId: null })
    const { parcelarRecebimento } = await acao()

    expect((await parcelarRecebimento(os.id, 500, 1, 7, true)).erro).toBe("naoEncontrada")
    expect(await recebimentos(os.id)).toHaveLength(1)
  })

  it("plano inválido não apaga a receita que existia", async () => {
    // A ação apaga as pendentes antes de criar as novas. Uma validação que
    // passasse batido deixaria a OS sem recebimento nenhum.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()

    const r = await parcelarRecebimento(os.id, 5000, 1, 7, true)

    expect(r.erro).toBe("entradaMaiorQueTotal")
    expect(await recebimentos(os.id)).toHaveLength(1)
  })

  it("OS sem valor não vira plano", async () => {
    const { os } = await cenario({ total: 0, comReceita: false })
    const { parcelarRecebimento } = await acao()

    expect((await parcelarRecebimento(os.id, 0, 3, 30, false)).erro).toBe("totalInvalido")
  })
})

describe("as parcelas aparecem no FINANCEIRO", () => {
  // A pergunta do dono, literal: "estes serviços que foram parcelados vão
  // aparecer na aba do financeiro? precisa."
  //
  // A resposta é sim, e por construção: cada parcela é uma linha de Revenue, e
  // o Financeiro lista Revenue. Mas "por construção" é exatamente o tipo de
  // certeza que este projeto já viu falhar três vezes — código pronto,
  // alcançável por nenhuma tela. Então o teste atravessa a tela de verdade.

  async function financeiro() {
    const { getFinanceSummary } = await import("@/actions/finance")
    return getFinanceSummary()
  }

  it("cada parcela vira uma linha no contas a receber", async () => {
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()
    await parcelarRecebimento(os.id, 500, 3, 30, true)

    const f = await financeiro()

    // Quatro linhas: a entrada mais as três parcelas.
    const daOs = f.revenues.filter((r) => r.orderId === os.id)
    expect(daOs).toHaveLength(4)
    // E somam o serviço inteiro, sem contar duas vezes.
    expect(daOs.reduce((s, r) => s + Number(r.amount), 0)).toBe(2000)
  })

  it("o A RECEBER mostra só o que ainda não entrou", async () => {
    // O dono olha este número para saber quanto tem a receber. A entrada já
    // recebida não pode estar nele.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()
    await parcelarRecebimento(os.id, 500, 3, 30, true)

    const f = await financeiro()

    const aReceber = f.pendingRevenues
      .filter((r) => r.orderId === os.id)
      .reduce((s, r) => s + Number(r.amount), 0)
    expect(aReceber).toBe(1500)
    expect(f.pendingRevenues.filter((r) => r.orderId === os.id)).toHaveLength(3)
  })

  it("a entrada recebida entra na receita DO MÊS", async () => {
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()
    await parcelarRecebimento(os.id, 500, 3, 30, true)

    const f = await financeiro()

    // `monthlyRevenue` soma o que foi PAGO no mês corrente. A entrada foi paga
    // agora, então ela está lá — e as parcelas futuras não.
    expect(f.monthlyRevenue).toBe(500)
  })

  it("cada linha diz qual parcela é, para o dono conferir na tela", async () => {
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()
    await parcelarRecebimento(os.id, 500, 3, 30, true)

    const f = await financeiro()

    const descricoes = f.revenues.filter((r) => r.orderId === os.id).map((r) => r.description)
    expect(descricoes.some((d) => d.includes("entrada"))).toBe(true)
    expect(descricoes.some((d) => d.includes("2/3"))).toBe(true)
  })

  it("os vencimentos ficam espalhados, e não todos hoje", async () => {
    // Era o defeito de origem: faturar criava UMA receita vencendo hoje com o
    // valor cheio, e no dia seguinte o dono via em atraso um valor que ninguém
    // combinou pagar hoje.
    const { os } = await cenario()
    const { parcelarRecebimento } = await acao()
    await parcelarRecebimento(os.id, 500, 3, 30, true)

    const f = await financeiro()

    const vencimentos = f.pendingRevenues
      .filter((r) => r.orderId === os.id)
      .map((r) => Math.round((r.dueDate.getTime() - execucao.getTime()) / dia))
      .sort((a, b) => a - b)
    expect(vencimentos).toEqual([30, 60, 90])
  })
})
