import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Este é o código mais perigoso do sistema: decide quem pode entrar na conta
// das empresas clientes. O teste que mais importa aqui é o de baixo — provar
// que o cookie de impersonação, sozinho, não concede absolutamente nada.

const ADMIN = "dono@servicoos.com.br"

let emailDaSessao: string | null = null
let cookieImpersonacao: string | undefined = undefined
let vezesQueConsultouASessao = 0

beforeEach(() => {
  vi.resetModules()
  emailDaSessao = null
  cookieImpersonacao = undefined
  vezesQueConsultouASessao = 0
  process.env.SUPER_ADMIN_EMAIL = ADMIN

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: {
        getUser: async () => {
          vezesQueConsultouASessao++
          return { data: { user: emailDaSessao ? { email: emailDaSessao } : null } }
        },
      },
    }),
  }))
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ get: (nome: string) => (nome === "admin_ver_como" && cookieImpersonacao ? { value: cookieImpersonacao } : undefined) }),
  }))
  vi.doMock("@/lib/prisma", () => ({ prisma: { adminAuditLog: { create: vi.fn().mockResolvedValue({}) } } }))
})

afterEach(() => {
  vi.doUnmock("@/lib/supabase/server")
  vi.doUnmock("next/headers")
  vi.doUnmock("@/lib/prisma")
})

describe("admin — quem é o dono da plataforma", () => {
  it("reconhece o dono", async () => {
    emailDaSessao = ADMIN
    const { superAdminEmail, isSuperAdmin } = await import("@/lib/admin")
    expect(await superAdminEmail()).toBe(ADMIN)
    expect(await isSuperAdmin()).toBe(true)
  })

  it("ignora diferença de maiúsculas e espaços no e-mail", async () => {
    emailDaSessao = `  ${ADMIN.toUpperCase()}  `
    const { isSuperAdmin } = await import("@/lib/admin")
    expect(await isSuperAdmin()).toBe(true)
  })

  it("recusa qualquer outro usuário logado", async () => {
    emailDaSessao = "tecnico@empresa-cliente.com.br"
    const { isSuperAdmin, requireSuperAdmin } = await import("@/lib/admin")
    expect(await isSuperAdmin()).toBe(false)
    await expect(requireSuperAdmin()).rejects.toThrow()
  })

  it("recusa quem não está logado", async () => {
    emailDaSessao = null
    const { isSuperAdmin } = await import("@/lib/admin")
    expect(await isSuperAdmin()).toBe(false)
  })

  it("sessão sem e-mail não vira admin nem com SUPER_ADMIN_EMAIL vazio", async () => {
    // Cenário real: alguém apaga a variável na Vercel por engano. Sem a guarda
    // de "só compara depois de confirmar que há e-mail", undefined === undefined
    // liberaria o painel inteiro.
    process.env.SUPER_ADMIN_EMAIL = ""
    emailDaSessao = null
    const { isSuperAdmin } = await import("@/lib/admin")
    expect(await isSuperAdmin()).toBe(false)
  })
})

describe("admin — entrar na conta do cliente", () => {
  it("SEM cookie não impersona, e nem chega a consultar a sessão", async () => {
    emailDaSessao = ADMIN
    cookieImpersonacao = undefined
    const { tenantImpersonado } = await import("@/lib/admin")

    expect(await tenantImpersonado()).toBeNull()
    // O caminho normal de TODAS as requisições do sistema passa por aqui. Se
    // consultasse a sessão à toa, seria uma ida de rede ao Supabase por
    // carregamento de tela — regressão de capacidade disfarçada de segurança.
    expect(vezesQueConsultouASessao).toBe(0)
  })

  it("COM cookie mas sem ser o dono, NÃO impersona", async () => {
    // O teste que justifica o desenho inteiro: forjar o cookie numa conta
    // qualquer não dá acesso a nada. Quem decide é a sessão verificada.
    emailDaSessao = "tecnico@empresa-cliente.com.br"
    cookieImpersonacao = "tenant-de-outra-empresa"
    const { tenantImpersonado } = await import("@/lib/admin")

    expect(await tenantImpersonado()).toBeNull()
  })

  it("COM cookie e deslogado, NÃO impersona", async () => {
    emailDaSessao = null
    cookieImpersonacao = "tenant-de-outra-empresa"
    const { tenantImpersonado } = await import("@/lib/admin")

    expect(await tenantImpersonado()).toBeNull()
  })

  it("COM cookie e sendo o dono, impersona a empresa do cookie", async () => {
    emailDaSessao = ADMIN
    cookieImpersonacao = "tenant-abc"
    const { tenantImpersonado } = await import("@/lib/admin")

    expect(await tenantImpersonado()).toBe("tenant-abc")
  })
})
