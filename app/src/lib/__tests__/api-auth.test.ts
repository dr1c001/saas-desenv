import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { gerarChave } from "@/lib/api-chave"

// A API não tem sessão, não tem cookie e não passa pelo proxy.ts. A chave é a
// autorização inteira, e o tenantId que sai daqui é a ÚNICA coisa separando as
// empresas. É o ponto do sistema onde um erro vaza dado de terceiro.

let testDb: TestDatabase
const mockAssinaturaAtiva = vi.fn()
const mockTemRecurso = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({ hasActiveSubscription: mockAssinaturaAtiva }))
  vi.doMock("@/lib/plan", () => ({ temRecurso: mockTemRecurso }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockAssinaturaAtiva.mockReset().mockResolvedValue(true)
  mockTemRecurso.mockReset().mockResolvedValue(true)
})

/** Cria uma empresa com uma chave válida e devolve o texto da chave. */
async function comChave(nome = "Empresa", revogada = false) {
  const tenant = await testDb.db.tenant.create({ data: { name: nome } })
  const { chave, prefixo, hash } = gerarChave()
  await testDb.db.apiKey.create({
    data: {
      tenantId: tenant.id,
      name: "teste",
      prefix: prefixo,
      hash,
      revokedAt: revogada ? new Date() : null,
    },
  })
  return { tenant, chave }
}

function req(chave?: string) {
  return new Request("https://exemplo/api/v1/clients", {
    headers: chave ? { authorization: `Bearer ${chave}` } : {},
  })
}

describe("quem entra", () => {
  it("chave válida devolve o tenant DELA", async () => {
    const a = await comChave("A")
    const b = await comChave("B")
    const { autenticarApi } = await import("@/lib/api-auth")

    const ra = await autenticarApi(req(a.chave))
    const rb = await autenticarApi(req(b.chave))

    expect(ra.ok && ra.auth.tenantId).toBe(a.tenant.id)
    expect(rb.ok && rb.auth.tenantId).toBe(b.tenant.id)
    // O teste que importa: a chave de uma empresa NUNCA resolve para a outra.
    expect(ra.ok && ra.auth.tenantId).not.toBe(b.tenant.id)
  })

  it("sem cabeçalho é 401 e diz como mandar", async () => {
    const { autenticarApi } = await import("@/lib/api-auth")
    const r = await autenticarApi(req())

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.resposta.status).toBe(401)
    expect(await r.resposta.json()).toMatchObject({ error: { code: "missing_authorization" } })
  })

  it("chave inexistente, malformada e revogada dão a MESMA resposta", async () => {
    // Distinguir contaria a quem tenta se o prefixo existe.
    const { autenticarApi } = await import("@/lib/api-auth")
    const revogada = await comChave("C", true)

    const respostas = await Promise.all([
      autenticarApi(req(gerarChave().chave)),
      autenticarApi(req("lixo")),
      autenticarApi(req(revogada.chave)),
    ])

    for (const r of respostas) {
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.resposta.status).toBe(401)
      expect(await r.resposta.json()).toMatchObject({ error: { code: "invalid_key" } })
    }
  })

  it("chave de outra empresa com o segredo trocado não passa", async () => {
    // O prefixo é público. Se a conferência olhasse só ele, saber o prefixo
    // (que aparece na tela mascarada) bastaria para entrar.
    const a = await comChave("A")
    const prefixo = a.chave.split("_")[1]
    const forjada = `sos_${prefixo}_${"a".repeat(32)}`
    const { autenticarApi } = await import("@/lib/api-auth")

    const r = await autenticarApi(req(forjada))

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.resposta.status).toBe(401)
  })
})

describe("o plano e a assinatura são verificados A CADA chamada", () => {
  it("assinatura cancelada desliga a chave que já existia", async () => {
    // Sem isso, cancelar o plano deixaria a integração rodando para sempre.
    const a = await comChave()
    mockAssinaturaAtiva.mockResolvedValue(false)
    const { autenticarApi } = await import("@/lib/api-auth")

    const r = await autenticarApi(req(a.chave))

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.resposta.status).toBe(402)
    expect(await r.resposta.json()).toMatchObject({ error: { code: "subscription_inactive" } })
  })

  it("downgrade de Enterprise para Pro desliga a chave", async () => {
    // A API é o que justifica o preço do Enterprise. Se continuasse valendo
    // depois do downgrade, seria vitalícia para quem passou por lá uma vez.
    const a = await comChave()
    mockTemRecurso.mockResolvedValue(false)
    const { autenticarApi } = await import("@/lib/api-auth")

    const r = await autenticarApi(req(a.chave))

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.resposta.status).toBe(403)
    expect(await r.resposta.json()).toMatchObject({ error: { code: "plan_required" } })
  })
})

describe("último uso", () => {
  it("é registrado na primeira chamada", async () => {
    const a = await comChave()
    const { autenticarApi } = await import("@/lib/api-auth")

    await autenticarApi(req(a.chave))

    const chave = await testDb.db.apiKey.findFirst({ where: { tenantId: a.tenant.id } })
    expect(chave!.lastUsedAt).not.toBeNull()
  })

  it("não é regravado a cada chamada", async () => {
    // Uma escrita por leitura numa API que existe para ser chamada em laço.
    const a = await comChave()
    const { autenticarApi } = await import("@/lib/api-auth")

    await autenticarApi(req(a.chave))
    const primeira = (await testDb.db.apiKey.findFirst({ where: { tenantId: a.tenant.id } }))!.lastUsedAt
    await autenticarApi(req(a.chave))
    const segunda = (await testDb.db.apiKey.findFirst({ where: { tenantId: a.tenant.id } }))!.lastUsedAt

    expect(segunda!.getTime()).toBe(primeira!.getTime())
  })
})
