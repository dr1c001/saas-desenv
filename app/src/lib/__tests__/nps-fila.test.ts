import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A fila do NPS entupia com linhas que nunca podiam sair.
//
// O cron pegava as 100 primeiras OS elegíveis e PULAVA, sem marcar, as que
// não tinham para onde ir — cliente sem e-mail, empresa com o NPS desligado.
// Pular não grava nada: a linha voltava amanhã, na mesma vaga, porque a
// consulta não tinha orderBy. Cem clientes sem e-mail travavam o NPS da
// plataforma inteira, para sempre, com o cron gravando "nps 0" em silêncio.
// (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockEmail = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/resend", () => ({ sendNpsEmail: mockEmail }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  // Devolve o que a função real devolve (nada) — o sucesso é a ausência de throw.
  mockEmail.mockReset().mockResolvedValue(undefined)
})

const AGORA = new Date("2026-09-15T12:00:00Z")
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000)

async function empresa(opcoes: { npsDesligado?: boolean; name?: string } = {}) {
  const t = await testDb.db.tenant.create({
    data: {
      name: opcoes.name ?? "Desentupidora Silva",
      disabledFeatures: opcoes.npsDesligado ? ["nps"] : [],
    },
  })
  await testDb.db.user.create({
    data: { id: `dono-${t.id}`, tenantId: t.id, name: "Silva", email: `dono-${t.id}@ex.com`, role: "OWNER" },
  })
  return t
}

async function osConcluida(
  tenantId: string,
  opcoes: { email?: string | null; concluidaHa?: number; status?: "DONE" | "INVOICED" | "OPEN"; token?: string | null } = {}
) {
  const cliente = await testDb.db.client.create({
    data: { tenantId, name: "Morador", email: opcoes.email === undefined ? "morador@ex.com" : opcoes.email },
  })
  return testDb.db.serviceOrder.create({
    data: {
      tenantId,
      clientId: cliente.id,
      number: Math.floor(Math.random() * 100000),
      title: "Desentupimento",
      status: opcoes.status ?? "DONE",
      concludedAt: diasAtras(opcoes.concluidaHa ?? 8),
      ...(opcoes.token === null ? { clientToken: null } : {}),
    },
  })
}

const rodar = async () => {
  const { enviarPesquisasDeSatisfacao } = await import("@/lib/nps-fila")
  return enviarPesquisasDeSatisfacao(AGORA)
}

describe("quem não tem para onde ir não ocupa vaga", () => {
  it("cliente sem e-mail nem ENTRA na fila — o filtro é no banco", async () => {
    const t = await empresa()
    await osConcluida(t.id, { email: null })

    const r = await rodar()

    expect(mockEmail).not.toHaveBeenCalled()
    expect(r.enviadas).toBe(0)
    expect(r.descartadas).toBe(0)
  })

  it("e-mail VAZIO (dado antigo) passa pelo banco e SAI marcado — não volta amanhã", async () => {
    // "" não é null: o filtro do banco deixa passar. É o caso do cinto e
    // suspensório dentro do laço, e a diferença para o `continue` antigo é que
    // ele MARCA: a linha não ocupa a vaga de novo no dia seguinte.
    const t = await empresa()
    const vazio = await osConcluida(t.id, { email: "" })

    const r1 = await rodar()
    const r2 = await rodar()

    expect(mockEmail).not.toHaveBeenCalled()
    expect(r1.descartadas).toBe(1)
    expect(r2.descartadas).toBe(0)
    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: vazio.id } })
    expect(depois!.npsSentAt).not.toBeNull()
  })

  it("empresa com o NPS desligado não entra — e o cliente dela também não fica preso", async () => {
    const desligada = await empresa({ npsDesligado: true })
    const ligada = await empresa({ name: "Refrigeração Norte" })
    await osConcluida(desligada.id)
    await osConcluida(ligada.id)

    const r = await rodar()

    expect(r.enviadas).toBe(1)
    expect(mockEmail).toHaveBeenCalledTimes(1)
    expect(mockEmail.mock.calls[0][2]).toBe("Refrigeração Norte")
    // Nem entrou: o filtro é no banco, e a vaga fica para quem pode receber.
    expect(r.descartadas).toBe(0)
  })

  it("cem clientes sem e-mail não travam a pesquisa de quem tem", async () => {
    // O cenário do achado, em miniatura: a fila é cheia de linhas mortas, e a
    // única OS com destino está atrás delas. Antes, ela nunca saía.
    const t = await empresa()
    for (let i = 0; i < 12; i++) await osConcluida(t.id, { email: null, concluidaHa: 20 })
    await osConcluida(t.id, { email: "vivo@ex.com", concluidaHa: 8 })

    const r = await rodar()

    expect(r.enviadas).toBe(1)
    expect(mockEmail.mock.calls[0][0]).toBe("vivo@ex.com")
  })
})

describe("a janela", () => {
  it("só depois de 7 dias da conclusão", async () => {
    const t = await empresa()
    await osConcluida(t.id, { concluidaHa: 6 })
    expect((await rodar()).enviadas).toBe(0)
  })

  it("e não depois de 30 — aí mede memória, não satisfação", async () => {
    const t = await empresa()
    await osConcluida(t.id, { concluidaHa: 31 })
    expect((await rodar()).enviadas).toBe(0)
  })

  it("INVOICED conta como concluída — a maioria das OS em produção está lá", async () => {
    const t = await empresa()
    await osConcluida(t.id, { status: "INVOICED" })
    expect((await rodar()).enviadas).toBe(1)
  })

  it("mais antigas primeiro", async () => {
    const t = await empresa()
    await osConcluida(t.id, { email: "recente@ex.com", concluidaHa: 8 })
    await osConcluida(t.id, { email: "antiga@ex.com", concluidaHa: 25 })

    await rodar()

    expect(mockEmail.mock.calls[0][0]).toBe("antiga@ex.com")
    expect(mockEmail.mock.calls[1][0]).toBe("recente@ex.com")
  })
})

describe("o envio", () => {
  it("fala em nome da empresa, com a resposta indo para o dono dela", async () => {
    const t = await empresa()
    await osConcluida(t.id)

    await rodar()

    const [, , empresaNome, , , responderPara] = mockEmail.mock.calls[0]
    expect(empresaNome).toBe("Desentupidora Silva")
    expect(responderPara).toBe(`dono-${t.id}@ex.com`)
  })

  it("marca a tentativa ANTES de enviar: falha perde uma pesquisa, não repete amanhã", async () => {
    const t = await empresa()
    const os = await osConcluida(t.id)
    mockEmail.mockRejectedValueOnce(new Error("Resend: recusado"))

    const r1 = await rodar()
    const r2 = await rodar()

    expect(r1.erros).toBe(1)
    expect(r1.enviadas).toBe(0)
    expect(r2.enviadas).toBe(0)
    expect(mockEmail).toHaveBeenCalledTimes(1)
    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois!.npsSentAt).not.toBeNull()
  })

  it("quem já recebeu não recebe de novo", async () => {
    const t = await empresa()
    await osConcluida(t.id)

    await rodar()
    const r2 = await rodar()

    expect(r2.enviadas).toBe(0)
    expect(mockEmail).toHaveBeenCalledTimes(1)
  })
})
