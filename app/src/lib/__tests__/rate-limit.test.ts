import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

describe("checkRateLimit", () => {
  it("permite requisições dentro do limite", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit")
    const r1 = await checkRateLimit("login:email:a@b.com", 3, 15)
    const r2 = await checkRateLimit("login:email:a@b.com", 3, 15)
    const r3 = await checkRateLimit("login:email:a@b.com", 3, 15)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
  })

  it("bloqueia ao atingir o limite dentro da janela", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit")
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("login:email:brute@force.com", 3, 15)
    }
    const blocked = await checkRateLimit("login:email:brute@force.com", 3, 15)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    }
  })

  it("chaves diferentes têm limites independentes", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit")
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("login:email:victim@a.com", 3, 15)
    }
    const blockedVictim = await checkRateLimit("login:email:victim@a.com", 3, 15)
    const otherEmail = await checkRateLimit("login:email:someone-else@a.com", 3, 15)
    expect(blockedVictim.allowed).toBe(false)
    expect(otherEmail.allowed).toBe(true)
  })

  it("reseta depois que a janela expira", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit")
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("login:email:expiring@a.com", 3, 15)
    }
    expect((await checkRateLimit("login:email:expiring@a.com", 3, 15)).allowed).toBe(false)

    // Força a janela a já ter expirado, mexendo direto no banco de teste
    // (mais confiável que esperar 15 minutos de verdade).
    await testDb.db.authRateLimit.update({
      where: { key: "login:email:expiring@a.com" },
      data: { windowStart: new Date(Date.now() - 16 * 60 * 1000) },
    })

    const afterWindow = await checkRateLimit("login:email:expiring@a.com", 3, 15)
    expect(afterWindow.allowed).toBe(true)
  })
})
