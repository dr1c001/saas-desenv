import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import type { Operacao } from "@/lib/fila-offline"

// A promessa que esta fila faz é séria: o técnico foi embora achando que o
// serviço estava registrado. Os dois testes que mais importam aqui são o de
// idempotência (repetir não pode duplicar dinheiro) e o de conflito (não
// sobrescrever quem estava com sinal).

let testDb: TestDatabase
const mockGetTenant = vi.fn()
const mockConcluir = vi.fn()
const mockStatus = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  // O efeito real já tem os próprios testes; aqui o que se verifica é SE ele é
  // chamado, e quantas vezes.
  vi.doMock("@/actions/service-orders", () => ({
    completeServiceOrder: mockConcluir,
    updateOrderStatus: mockStatus,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  mockConcluir.mockReset().mockResolvedValue(undefined)
  mockStatus.mockReset().mockResolvedValue(undefined)
})

async function cenario(status = "OPEN") {
  const tenant = await testDb.db.tenant.create({ data: { name: "Empresa" } })
  const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "Cliente" } })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      number: 1,
      title: "Serviço",
      status: status as never,
    },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
  return { tenant, os }
}

const op = (orderId: string, p: Partial<Operacao> = {}): Operacao => ({
  id: "op-1",
  tipo: "CONCLUIR_OS",
  orderId,
  criadaEm: Date.parse("2026-08-19T08:00:00.000Z"),
  tentativas: 0,
  dados: { conclusionNote: "Trocada a bomba", items: [], invoiceImmediately: false },
  ...p,
})

describe("idempotência", () => {
  it("aplica a operação uma vez", async () => {
    const { os } = await cenario()
    const { sincronizar } = await import("@/actions/sincronizar")

    const r = await sincronizar([op(os.id)])

    expect(r[0].veredito.estado).toBe("aplicada")
    expect(mockConcluir).toHaveBeenCalledOnce()
  })

  it("a MESMA operação enviada de novo não aplica de novo", async () => {
    // É o caso real: a resposta se perdeu no caminho depois de o servidor ter
    // aplicado, e o celular reenviou. Aplicar duas vezes criaria duas receitas
    // e baixaria o estoque em dobro.
    const { os } = await cenario()
    const { sincronizar } = await import("@/actions/sincronizar")

    await sincronizar([op(os.id)])
    const segunda = await sincronizar([op(os.id)])

    expect(segunda[0].veredito.estado).toBe("repetida")
    expect(mockConcluir).toHaveBeenCalledOnce()
  })

  it("operação repetida no MESMO lote também só aplica uma vez", async () => {
    const { os } = await cenario()
    const { sincronizar } = await import("@/actions/sincronizar")

    const r = await sincronizar([op(os.id), op(os.id)])

    expect(r.map((x) => x.veredito.estado)).toEqual(["aplicada", "repetida"])
    expect(mockConcluir).toHaveBeenCalledOnce()
  })

  it("uma recusa continua recusada quando reenviada, com o motivo", async () => {
    // O técnico precisa continuar vendo POR QUE não entrou, e não um
    // "repetida" que não explica nada.
    const { os } = await cenario("DONE")
    const { sincronizar } = await import("@/actions/sincronizar")

    await sincronizar([op(os.id)])
    const segunda = await sincronizar([op(os.id)])

    expect(segunda[0].veredito).toEqual({ estado: "recusada", motivo: "jaConcluida" })
  })
})

describe("conflito — não sobrescrever quem estava com sinal", () => {
  it("recusa concluir OS já concluída", async () => {
    const { os } = await cenario("DONE")
    const { sincronizar } = await import("@/actions/sincronizar")

    const r = await sincronizar([op(os.id)])

    expect(r[0].veredito).toEqual({ estado: "recusada", motivo: "jaConcluida" })
    expect(mockConcluir).not.toHaveBeenCalled()
  })

  it("recusa concluir OS já faturada", async () => {
    // Faturada tem NFS-e e assinatura vinculadas; sobrescrever
    // dessincronizaria tudo isso em silêncio.
    const { os } = await cenario("INVOICED")
    const { sincronizar } = await import("@/actions/sincronizar")

    expect((await sincronizar([op(os.id)]))[0].veredito).toEqual({
      estado: "recusada",
      motivo: "jaFaturada",
    })
  })

  it("recusa concluir OS cancelada", async () => {
    const { os } = await cenario("CANCELLED")
    const { sincronizar } = await import("@/actions/sincronizar")

    expect((await sincronizar([op(os.id)]))[0].veredito).toEqual({
      estado: "recusada",
      motivo: "cancelada",
    })
  })

  it("mudar para o status que a OS já tem conta como aplicada", async () => {
    // Não é erro: é a realidade alcançada por outro caminho. Tratar como
    // recusa deixaria pendência eterna na tela do técnico.
    const { os } = await cenario("IN_PROGRESS")
    const { sincronizar } = await import("@/actions/sincronizar")

    const r = await sincronizar([
      op(os.id, { tipo: "MUDAR_STATUS", dados: { status: "IN_PROGRESS" } }),
    ])

    expect(r[0].veredito.estado).toBe("aplicada")
    expect(mockStatus).not.toHaveBeenCalled()
  })
})

describe("isolamento entre empresas", () => {
  it("recusa OS de outra empresa", async () => {
    // A fila vem do celular e não é confiável. Sem o filtro por tenant, um
    // orderId de outra empresa seria concluído por aqui.
    const { os } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    mockGetTenant.mockResolvedValue({ tenantId: outra.id, userId: "u2", role: "TECHNICIAN" })
    const { sincronizar } = await import("@/actions/sincronizar")

    const r = await sincronizar([op(os.id)])

    expect(r[0].veredito).toEqual({ estado: "recusada", motivo: "osNaoEncontrada" })
    expect(mockConcluir).not.toHaveBeenCalled()
  })
})

describe("um lote não é tudo-ou-nada", () => {
  it("uma operação recusada não derruba as outras", async () => {
    // Abortar o lote inteiro por causa de uma OS cancelada faria o técnico
    // perder as outras conclusões do dia.
    const { tenant, os } = await cenario()
    const cliente2 = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C2" } })
    const cancelada = await testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id, clientId: cliente2.id, number: 2,
        title: "Cancelada", status: "CANCELLED",
      },
    })
    const { sincronizar } = await import("@/actions/sincronizar")

    const r = await sincronizar([
      op(cancelada.id, { id: "op-ruim" }),
      op(os.id, { id: "op-boa" }),
    ])

    expect(r.find((x) => x.id === "op-ruim")?.veredito.estado).toBe("recusada")
    expect(r.find((x) => x.id === "op-boa")?.veredito.estado).toBe("aplicada")
    expect(mockConcluir).toHaveBeenCalledOnce()
  })

  it("erro inesperado vira 'falhou', que é reenviável, e não 'recusada'", async () => {
    // Recusada descartaria trabalho de campo por causa de um problema
    // momentâneo do servidor.
    const { os } = await cenario()
    mockConcluir.mockRejectedValue(new Error("banco fora"))
    const { sincronizar } = await import("@/actions/sincronizar")

    const r = await sincronizar([op(os.id)])

    expect(r[0].veredito.estado).toBe("falhou")
  })
})

describe("o momento registrado", () => {
  it("guarda quando o TÉCNICO fez, não quando sincronizou", async () => {
    const { os } = await cenario()
    const { sincronizar } = await import("@/actions/sincronizar")

    await sincronizar([op(os.id)])

    const registro = await testDb.db.offlineOperation.findUnique({ where: { id: "op-1" } })
    expect(registro!.clientAt.toISOString()).toBe("2026-08-19T08:00:00.000Z")
  })
})
