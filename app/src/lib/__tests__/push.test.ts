import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// O defeito que estes testes travam: `sendPushToUser` devolvia o resultado de
// cada envio e NINGUÉM olhava — os dois pontos que chamam descartavam a
// resposta dentro de um `catch` vazio. Inscrição morta ficava no banco para
// sempre, e se todas falhassem ninguém descobriria.

const envios: { endpoint: string }[] = []
let proximoErro: { statusCode?: number } | null = null
/** Erro por endpoint, para testar sucesso e falha na mesma rodada. */
const erroPorEndpoint = new Map<string, { statusCode?: number }>()

const mockDeleteMany = vi.fn()

beforeAll(() => {
  vi.doMock("web-push", () => ({
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: async (sub: { endpoint: string }) => {
        envios.push({ endpoint: sub.endpoint })
        const erro = erroPorEndpoint.get(sub.endpoint) ?? proximoErro
        if (erro) throw erro
        return { statusCode: 201 }
      },
    },
  }))
  vi.doMock("@/lib/prisma", () => ({
    prisma: { pushSubscription: { deleteMany: mockDeleteMany } },
  }))
  process.env.VAPID_CONTACT = "mailto:x@y.com"
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub"
  process.env.VAPID_PRIVATE_KEY = "priv"
})

afterAll(() => {
  vi.doUnmock("web-push")
  vi.doUnmock("@/lib/prisma")
})

beforeEach(() => {
  envios.length = 0
  proximoErro = null
  erroPorEndpoint.clear()
  mockDeleteMany.mockReset().mockResolvedValue({ count: 0 })
})

const inscricao = (endpoint: string) => ({ endpoint, p256dh: "p", auth: "a" })
const PAYLOAD = { title: "Nova OS", body: "Troca da bomba" }

describe("a inscrição morreu ou foi tropeço?", () => {
  it("404 e 410 são definitivos", async () => {
    const { inscricaoMorreu } = await import("@/lib/push")
    expect(inscricaoMorreu(404)).toBe(true)
    expect(inscricaoMorreu(410)).toBe(true)
  })

  it("o resto é passageiro e NÃO apaga a inscrição", async () => {
    // Apagar por instabilidade de dez segundos faria a pessoa parar de receber
    // notificação para sempre, e ninguém ligaria uma coisa à outra.
    const { inscricaoMorreu } = await import("@/lib/push")
    for (const s of [429, 500, 502, 503, undefined]) {
      expect(inscricaoMorreu(s), String(s)).toBe(false)
    }
  })
})

describe("envio", () => {
  it("manda para todos os aparelhos inscritos", async () => {
    const { sendPushToUser } = await import("@/lib/push")

    const r = await sendPushToUser([inscricao("a"), inscricao("b")], PAYLOAD)

    expect(envios.map((e) => e.endpoint)).toEqual(["a", "b"])
    expect(r).toEqual({ enviadas: 2, removidas: 0, falharam: 0 })
  })

  it("lista vazia não fala com a rede", async () => {
    const { sendPushToUser } = await import("@/lib/push")

    const r = await sendPushToUser([], PAYLOAD)

    expect(envios).toEqual([])
    expect(r.enviadas).toBe(0)
  })
})

describe("limpeza do que morreu", () => {
  it("apaga a inscrição que voltou 410", async () => {
    const { sendPushToUser } = await import("@/lib/push")
    erroPorEndpoint.set("morta", { statusCode: 410 })

    const r = await sendPushToUser([inscricao("viva"), inscricao("morta")], PAYLOAD)

    expect(r).toEqual({ enviadas: 1, removidas: 1, falharam: 0 })
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { endpoint: { in: ["morta"] } } })
  })

  it("NÃO apaga por falha passageira", async () => {
    const { sendPushToUser } = await import("@/lib/push")
    erroPorEndpoint.set("instavel", { statusCode: 503 })

    const r = await sendPushToUser([inscricao("instavel")], PAYLOAD)

    expect(r).toEqual({ enviadas: 0, removidas: 0, falharam: 1 })
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it("apaga várias de uma vez, numa consulta só", async () => {
    const { sendPushToUser } = await import("@/lib/push")
    erroPorEndpoint.set("m1", { statusCode: 410 })
    erroPorEndpoint.set("m2", { statusCode: 404 })

    const r = await sendPushToUser([inscricao("m1"), inscricao("m2"), inscricao("ok")], PAYLOAD)

    expect(r.removidas).toBe(2)
    expect(mockDeleteMany).toHaveBeenCalledTimes(1)
  })

  it("falhar ao limpar não derruba o envio que deu certo", async () => {
    const { sendPushToUser } = await import("@/lib/push")
    erroPorEndpoint.set("morta", { statusCode: 410 })
    mockDeleteMany.mockRejectedValue(new Error("banco fora"))

    const r = await sendPushToUser([inscricao("viva"), inscricao("morta")], PAYLOAD)

    expect(r.enviadas).toBe(1)
  })
})

describe("nunca derruba quem chamou", () => {
  it("todas falhando devolve resumo em vez de lançar", async () => {
    // Notificação é acessório: falhar em avisar não pode derrubar a criação da
    // OS que gerou o aviso.
    const { sendPushToUser } = await import("@/lib/push")
    proximoErro = { statusCode: 500 }

    const r = await sendPushToUser([inscricao("a"), inscricao("b")], PAYLOAD)

    expect(r).toEqual({ enviadas: 0, removidas: 0, falharam: 2 })
  })

  it("o resumo permite saber que NADA chegou", async () => {
    // Era o caso invisível: uma configuração errada de VAPID silenciaria as
    // notificações da empresa inteira sem deixar rastro.
    const { sendPushToUser } = await import("@/lib/push")
    proximoErro = { statusCode: 500 }

    const r = await sendPushToUser([inscricao("a")], PAYLOAD)

    expect(r.enviadas).toBe(0)
    expect(r.falharam + r.removidas).toBeGreaterThan(0)
  })
})
