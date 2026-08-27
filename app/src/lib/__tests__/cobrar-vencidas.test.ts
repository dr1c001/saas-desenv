import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { REGUA_PADRAO } from "@/lib/regua-cobranca"

// A REGRA da régua está em regua-cobranca.test.ts, e é pura. O que se prova
// AQUI é o resto — que é onde mora o risco de verdade:
//
//   1. a CONSULTA traz as contas certas (e, principalmente, não traz as pagas);
//   2. a cobrança vai para QUEM PAGA, e não para quem recebeu o serviço;
//   3. o CONTADOR anda no banco, que é o que torna o cron idempotente.
//
// Nada disso um teste de módulo puro alcança: são a forma do `where`, o
// caminho da relação e a escrita.

let testDb: TestDatabase
const mockWhats = vi.fn()
const mockEmail = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/whatsapp", () => ({ sendWhatsApp: mockWhats }))
  vi.doMock("@/lib/resend", () => ({ sendDunningEmail: mockEmail }))
  // A régua não pode depender de sessão: o cron roda sem usuário nenhum.
  vi.doMock("@/lib/auth", () => ({ hasActiveSubscription: async () => true }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockWhats.mockReset().mockResolvedValue(true)
  mockEmail.mockReset().mockResolvedValue(true)
})

/** Importa depois dos mocks — doMock não é içado. */
const rodar = async (agora: Date) => {
  const { cobrarVencidas } = await import("@/lib/cobrar-vencidas")
  return cobrarVencidas(agora)
}

const HOJE = new Date("2026-09-10T12:00:00Z")
/** Dias antes de HOJE. Negativo = vence no futuro. */
const vencimento = (diasAtras: number) =>
  new Date(HOJE.getTime() - diasAtras * 86_400_000)

async function empresaComRegua(config: object = { ...REGUA_PADRAO, ativo: true }) {
  return testDb.db.tenant.create({
    data: {
      name: "Desentupidora Silva",
      dunningConfig: config,
      subscriptionStatus: "ACTIVE",
      zapiInstance: "inst",
      zapiToken: "tok",
    },
  })
}

async function contaDe(
  tenantId: string,
  opcoes: {
    diasAtras: number
    status?: "PENDING" | "PAID" | "OVERDUE"
    paidAt?: Date | null
    amount?: number
    remindersSent?: number
    clienteEmail?: string | null
    parentId?: string | null
    payerId?: string | null
    semOs?: boolean
  }
) {
  const cliente = await testDb.db.client.create({
    data: {
      tenantId,
      name: "Condomínio Aurora",
      email: opcoes.clienteEmail === undefined ? "aurora@ex.com" : opcoes.clienteEmail,
      whatsapp: "11988887777",
      parentId: opcoes.parentId ?? null,
    },
  })

  let orderId: string | null = null
  if (!opcoes.semOs) {
    const os = await testDb.db.serviceOrder.create({
      data: {
        tenantId,
        clientId: cliente.id,
        number: Math.floor(Math.random() * 100000),
        title: "Desentupimento",
        payerId: opcoes.payerId ?? null,
      },
    })
    orderId = os.id
  }

  const receita = await testDb.db.revenue.create({
    data: {
      tenantId,
      orderId,
      description: "Desentupimento",
      amount: opcoes.amount ?? 500,
      dueDate: vencimento(opcoes.diasAtras),
      status: opcoes.status ?? "PENDING",
      paidAt: opcoes.paidAt ?? null,
      remindersSent: opcoes.remindersSent ?? 0,
    },
  })
  return { cliente, receita }
}

const releu = (id: string) => testDb.db.revenue.findUnique({ where: { id } })

describe("a consulta", () => {
  it("cobra uma conta vencida e marca o contador", async () => {
    const empresa = await empresaComRegua()
    const { receita } = await contaDe(empresa.id, { diasAtras: 7 })

    const r = await rodar(HOJE)

    expect(r).toEqual({ enviadas: 1, erros: 0 })
    expect(mockWhats).toHaveBeenCalledTimes(1)
    expect((await releu(receita.id))!.remindersSent).toBe(3) // -3, 1 e 7 já passaram
  })

  it("NUNCA cobra uma conta paga", async () => {
    // O pior defeito possível deste recurso. Dois guardas: o `where` da
    // consulta e o `paga` da regra — este teste prova o primeiro.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 30, status: "PAID", paidAt: new Date() })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(0)
    expect(mockWhats).not.toHaveBeenCalled()
    expect(mockEmail).not.toHaveBeenCalled()
  })

  it("não cobra conta que ainda está longe de vencer", async () => {
    // Vence daqui a 20 dias: nenhum degrau chegou, nem o lembrete de -3.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: -20 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("manda o LEMBRETE antes de vencer", async () => {
    // A metade do recurso que previne o atraso em vez de correr atrás dele —
    // e a que a janela da consulta erraria se `limiteDaJanela` somasse em vez
    // de subtrair o degrau negativo.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: -3 })

    expect((await rodar(HOJE)).enviadas).toBe(1)
    const texto = mockWhats.mock.calls[0][3] as string
    expect(texto).toContain("vence em")
  })

  it("ignora empresa que não ligou a régua", async () => {
    const empresa = await empresaComRegua(REGUA_PADRAO) // ativo: false
    await contaDe(empresa.id, { diasAtras: 30 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("ignora empresa que nunca configurou nada", async () => {
    const empresa = await testDb.db.tenant.create({
      data: { name: "Sem régua", subscriptionStatus: "ACTIVE" },
    })
    await contaDe(empresa.id, { diasAtras: 30 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("não cobra em nome de quem cancelou a assinatura", async () => {
    const empresa = await testDb.db.tenant.create({
      data: {
        name: "Saiu",
        dunningConfig: { ...REGUA_PADRAO, ativo: true },
        subscriptionStatus: "CANCELLED",
      },
    })
    await contaDe(empresa.id, { diasAtras: 30 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })

  it("receita lançada à mão, sem OS, não tem a quem cobrar", async () => {
    // Revenue não tem cliente próprio — ele vem da OS. Sem OS não há
    // destinatário, e o certo é passar em silêncio, não quebrar.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7, semOs: true })

    const r = await rodar(HOJE)
    expect(r).toEqual({ enviadas: 0, erros: 0 })
  })
})

describe("quem recebe a cobrança", () => {
  it("é o CONTRATANTE quando o cliente é subcliente", async () => {
    // A razão de lib/subcliente.ts existir: a administradora contrata, o
    // condomínio recebe o serviço. Cobrar o condomínio é cobrar quem não deve
    // — constrange o cliente final e não chega em quem tem a fatura.
    const empresa = await empresaComRegua()
    const administradora = await testDb.db.client.create({
      data: {
        tenantId: empresa.id,
        name: "Administradora Central",
        email: "financeiro@central.com",
        whatsapp: "11955554444",
      },
    })
    await contaDe(empresa.id, { diasAtras: 7, parentId: administradora.id })

    await rodar(HOJE)

    expect(mockWhats).toHaveBeenCalledTimes(1)
    // Argumento 3 do sendWhatsApp é o telefone.
    expect(mockWhats.mock.calls[0][2]).toBe("11955554444")
    expect(mockEmail.mock.calls[0][0]).toBe("financeiro@central.com")
  })

  it("é o próprio cliente quando a OS diz que ele paga", async () => {
    // O caso do serviço extra: a administradora paga quase tudo, mas este o
    // condomínio pagou direto. A escolha está gravada na OS e manda.
    const empresa = await empresaComRegua()
    const administradora = await testDb.db.client.create({
      data: { tenantId: empresa.id, name: "Administradora", whatsapp: "11955554444" },
    })
    const cliente = await testDb.db.client.create({
      data: {
        tenantId: empresa.id,
        name: "Condomínio",
        whatsapp: "11988887777",
        parentId: administradora.id,
      },
    })
    const os = await testDb.db.serviceOrder.create({
      data: {
        tenantId: empresa.id,
        clientId: cliente.id,
        number: 7,
        title: "Extra",
        payerId: cliente.id,
      },
    })
    await testDb.db.revenue.create({
      data: {
        tenantId: empresa.id,
        orderId: os.id,
        description: "Extra",
        amount: 300,
        dueDate: vencimento(7),
      },
    })

    await rodar(HOJE)

    expect(mockWhats.mock.calls[0][2]).toBe("11988887777")
  })
})

describe("o contador no banco", () => {
  it("rodar duas vezes no mesmo dia manda uma mensagem só", async () => {
    // A idempotência que faz o cron poder ser reexecutado à mão sem
    // constranger ninguém.
    const empresa = await empresaComRegua()
    await contaDe(empresa.id, { diasAtras: 7 })

    await rodar(HOJE)
    await rodar(HOJE)

    expect(mockWhats).toHaveBeenCalledTimes(1)
  })

  it("anda um degrau por dia, e para no fim", async () => {
    const empresa = await empresaComRegua()
    const { receita } = await contaDe(empresa.id, { diasAtras: -5 })

    // Do 5º dia antes de vencer até 40 dias depois, um "dia" de cron por vez.
    for (let dia = -5; dia <= 40; dia++) {
      await rodar(new Date(HOJE.getTime() + (dia + 5) * 86_400_000))
    }

    // Cinco degraus, cinco mensagens — nunca mais que isso.
    expect(mockWhats).toHaveBeenCalledTimes(5)
    expect((await releu(receita.id))!.remindersSent).toBe(5)
  })

  it("o contador avança mesmo no degrau que a empresa desligou", async () => {
    // Com `lembrarAntes` desligado, o degrau -3 passa em silêncio mas PRECISA
    // ser contado. Se não fosse, a régua andaria deslocada e a mensagem do
    // dia seguinte ao vencimento sairia com o tom de lembrete.
    const empresa = await empresaComRegua({
      ...REGUA_PADRAO,
      ativo: true,
      lembrarAntes: false,
    })
    const { receita } = await contaDe(empresa.id, { diasAtras: -3 })

    await rodar(HOJE)

    expect(mockWhats).not.toHaveBeenCalled()
    expect((await releu(receita.id))!.remindersSent).toBe(1)
  })

  it("uma carteira antiga recebe UMA mensagem por conta, não a escada inteira", async () => {
    // O dia em que a empresa liga a régua: cinco contas vencidas há meses,
    // contador em zero. Se a régua disparasse todos os degraus vencidos, cada
    // cliente receberia cinco mensagens no mesmo minuto.
    const empresa = await empresaComRegua()
    for (let i = 0; i < 5; i++) await contaDe(empresa.id, { diasAtras: 60 + i })

    const r = await rodar(HOJE)

    expect(r.enviadas).toBe(5)
    expect(mockWhats).toHaveBeenCalledTimes(5)
  })
})

describe("os canais", () => {
  it("sem WhatsApp configurado, o e-mail ainda sai", async () => {
    const empresa = await testDb.db.tenant.create({
      data: {
        name: "Sem Zapi",
        dunningConfig: { ...REGUA_PADRAO, ativo: true },
        subscriptionStatus: "ACTIVE",
      },
    })
    await contaDe(empresa.id, { diasAtras: 7 })

    expect((await rodar(HOJE)).enviadas).toBe(1)
    expect(mockWhats).not.toHaveBeenCalled()
    expect(mockEmail).toHaveBeenCalledTimes(1)
  })

  it("cliente sem e-mail e sem telefone não gera erro", async () => {
    const empresa = await empresaComRegua()
    const cliente = await testDb.db.client.create({
      data: { tenantId: empresa.id, name: "Sem contato", email: null, whatsapp: null },
    })
    const os = await testDb.db.serviceOrder.create({
      data: { tenantId: empresa.id, clientId: cliente.id, number: 9, title: "X" },
    })
    await testDb.db.revenue.create({
      data: {
        tenantId: empresa.id,
        orderId: os.id,
        description: "X",
        amount: 200,
        dueDate: vencimento(7),
      },
    })

    expect(await rodar(HOJE)).toEqual({ enviadas: 0, erros: 0 })
  })

  it("valor abaixo do mínimo da empresa não vira mensagem", async () => {
    const empresa = await empresaComRegua({ ...REGUA_PADRAO, ativo: true, valorMinimo: 100 })
    await contaDe(empresa.id, { diasAtras: 7, amount: 40 })

    expect((await rodar(HOJE)).enviadas).toBe(0)
  })
})

describe("uma empresa não cobra pela outra", () => {
  it("a régua de uma não alcança as contas da outra", async () => {
    // Isolamento entre tenants no caminho novo. A consulta filtra por
    // tenantId; um esquecimento aqui mandaria a empresa A cobrar o cliente
    // da empresa B, em nome de A.
    const a = await empresaComRegua()
    const b = await testDb.db.tenant.create({
      data: { name: "Outra", subscriptionStatus: "ACTIVE" }, // sem régua
    })
    await contaDe(a.id, { diasAtras: 7 })
    const daOutra = await contaDe(b.id, { diasAtras: 7 })

    await rodar(HOJE)

    expect(mockWhats).toHaveBeenCalledTimes(1)
    expect((await releu(daOutra.receita.id))!.remindersSent).toBe(0)
  })
})
