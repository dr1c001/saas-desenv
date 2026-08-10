import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PlatformRole } from "@/generated/prisma/client"

// Este é o código mais perigoso do sistema: decide quem, da equipe de
// administração, pode mexer na cobrança e entrar na conta das empresas
// clientes. Os testes que mais importam são os de recusa.

const FUNDADOR = "dono@servicoos.com.br"

let emailDaSessao: string | null = null
let cookieImpersonacao: string | undefined
let vezesQueConsultouASessao = 0
let registroNaEquipe:
  | { email: string; name: string; role: PlatformRole; active: boolean; acceptedAt?: Date | null }
  | null = null
let atualizacoes: unknown[] = []

beforeEach(() => {
  vi.resetModules()
  emailDaSessao = null
  cookieImpersonacao = undefined
  vezesQueConsultouASessao = 0
  registroNaEquipe = null
  atualizacoes = []
  process.env.SUPER_ADMIN_EMAIL = FUNDADOR

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
    cookies: async () => ({
      get: (n: string) => (n === "admin_ver_como" && cookieImpersonacao ? { value: cookieImpersonacao } : undefined),
    }),
  }))
  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      platformAdmin: {
        findUnique: async () => registroNaEquipe,
        update: async (args: unknown) => {
          atualizacoes.push(args)
          return registroNaEquipe
        },
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    },
  }))
})

afterEach(() => {
  vi.doUnmock("@/lib/supabase/server")
  vi.doUnmock("next/headers")
  vi.doUnmock("@/lib/prisma")
})

function naEquipe(role: PlatformRole, active = true) {
  emailDaSessao = "funcionario@servicoos.com.br"
  registroNaEquipe = { email: emailDaSessao, name: "Funcionário", role, active }
}

describe("admin — quem entra no painel", () => {
  it("o fundador é sempre DONO, mesmo sem linha na tabela", async () => {
    // Chave reserva: se ele se remover por engano, o painel não pode ficar
    // trancado sem ninguém dentro.
    emailDaSessao = FUNDADOR
    registroNaEquipe = null
    const { adminLogado } = await import("@/lib/admin")
    expect((await adminLogado())?.role).toBe("DONO")
  })

  it("reconhece membro ativo da equipe com o papel dele", async () => {
    naEquipe("FINANCEIRO")
    const { adminLogado } = await import("@/lib/admin")
    expect((await adminLogado())?.role).toBe("FINANCEIRO")
  })

  it("recusa membro DESATIVADO", async () => {
    // Demitir alguém é desativar o registro; o acesso tem que cair na hora.
    naEquipe("TI", false)
    const { adminLogado, isSuperAdmin } = await import("@/lib/admin")
    expect(await adminLogado()).toBeNull()
    expect(await isSuperAdmin()).toBe(false)
  })

  it("recusa quem não está na equipe", async () => {
    emailDaSessao = "dono@empresa-cliente.com.br"
    registroNaEquipe = null
    const { isSuperAdmin } = await import("@/lib/admin")
    expect(await isSuperAdmin()).toBe(false)
  })

  it("recusa quem não está logado", async () => {
    const { isSuperAdmin } = await import("@/lib/admin")
    expect(await isSuperAdmin()).toBe(false)
  })

  it("sessão sem e-mail não vira admin nem com SUPER_ADMIN_EMAIL vazio", async () => {
    process.env.SUPER_ADMIN_EMAIL = ""
    emailDaSessao = null
    const { isSuperAdmin } = await import("@/lib/admin")
    expect(await isSuperAdmin()).toBe(false)
  })
})

describe("admin — registro de acesso", () => {
  it("marca último acesso, e o primeiro acesso vira data de aceite", async () => {
    naEquipe("TI")
    const { adminLogado } = await import("@/lib/admin")
    await adminLogado()
    expect(atualizacoes).toHaveLength(1)
    const dados = (atualizacoes[0] as { data: Record<string, unknown> }).data
    expect(dados.lastSeenAt).toBeInstanceOf(Date)
    expect(dados.acceptedAt).toBeInstanceOf(Date)
  })

  it("quem já aceitou não tem a data de aceite reescrita", async () => {
    naEquipe("TI")
    registroNaEquipe!.acceptedAt = new Date("2026-01-01")
    const { adminLogado } = await import("@/lib/admin")
    await adminLogado()
    const dados = (atualizacoes[0] as { data: Record<string, unknown> }).data
    expect(dados.acceptedAt).toBeUndefined()
  })

  it("falha ao registrar acesso NÃO impede o login", async () => {
    // O registro é conveniência. Se o banco recusar o update — ou o método nem
    // existir, como aconteceu num refactor — a pessoa ainda tem que entrar.
    naEquipe("FINANCEIRO")
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        platformAdmin: {
          findUnique: async () => registroNaEquipe,
          update: () => {
            throw new Error("banco fora do ar")
          },
        },
        adminAuditLog: { create: vi.fn() },
      },
    }))
    const { adminLogado } = await import("@/lib/admin")
    expect((await adminLogado())?.role).toBe("FINANCEIRO")
  })
})

describe("admin — matriz de permissões", () => {
  // A tabela abaixo é a especificação. Se alguém mudar a matriz sem querer,
  // aqui quebra.
  const ESPERADO: Record<PlatformRole, Record<string, boolean>> = {
    DONO:       { verFinanceiro: true,  liberarAcesso: true,  cancelarAcesso: true,  trocarPlano: true,  entrarNaConta: true,  gerenciarEquipe: true },
    FINANCEIRO: { verFinanceiro: true,  liberarAcesso: true,  cancelarAcesso: true,  trocarPlano: true,  entrarNaConta: false, gerenciarEquipe: false },
    COMERCIAL:  { verFinanceiro: true,  liberarAcesso: false, cancelarAcesso: false, trocarPlano: true,  entrarNaConta: false, gerenciarEquipe: false },
    LOGISTICO:  { verFinanceiro: false, liberarAcesso: false, cancelarAcesso: false, trocarPlano: false, entrarNaConta: true,  gerenciarEquipe: false },
    TI:         { verFinanceiro: false, liberarAcesso: true,  cancelarAcesso: false, trocarPlano: false, entrarNaConta: true,  gerenciarEquipe: false },
  }

  it("cada área pode exatamente o que foi combinado", async () => {
    const { papelPode } = await import("@/lib/admin")
    for (const [role, permissoes] of Object.entries(ESPERADO)) {
      for (const [permissao, esperado] of Object.entries(permissoes)) {
        expect(
          papelPode(role as PlatformRole, permissao as never),
          `${role} → ${permissao}`
        ).toBe(esperado)
      }
    }
  })

  it("todo mundo da equipe vê o painel", async () => {
    const { papelPode } = await import("@/lib/admin")
    for (const role of Object.keys(ESPERADO) as PlatformRole[]) {
      expect(papelPode(role, "verPainel")).toBe(true)
    }
  })

  it("só o DONO administra a própria equipe", async () => {
    const { papelPode } = await import("@/lib/admin")
    const podem = (Object.keys(ESPERADO) as PlatformRole[]).filter((r) => papelPode(r, "gerenciarEquipe"))
    expect(podem).toEqual(["DONO"])
  })

  it("financeiro e comercial NÃO entram na conta do cliente", async () => {
    // Eles não precisam dos dados do cliente pra fazer o trabalho, e todo
    // acesso a mais é exposição a mais — inclusive perante a LGPD.
    const { papelPode } = await import("@/lib/admin")
    expect(papelPode("FINANCEIRO", "entrarNaConta")).toBe(false)
    expect(papelPode("COMERCIAL", "entrarNaConta")).toBe(false)
  })

  it("logística e TI NÃO veem o financeiro", async () => {
    const { papelPode } = await import("@/lib/admin")
    expect(papelPode("LOGISTICO", "verFinanceiro")).toBe(false)
    expect(papelPode("TI", "verFinanceiro")).toBe(false)
  })
})

describe("admin — requireSuperAdmin", () => {
  it("deixa passar quem tem a permissão", async () => {
    naEquipe("FINANCEIRO")
    const { requireSuperAdmin } = await import("@/lib/admin")
    await expect(requireSuperAdmin("liberarAcesso")).resolves.toMatchObject({ role: "FINANCEIRO" })
  })

  it("barra quem está na equipe mas não tem a permissão", async () => {
    // O comercial vê o painel inteiro, mas disparar a ação de cancelar direto
    // (Server Action é despachável sem passar por tela nenhuma) tem que falhar.
    naEquipe("COMERCIAL")
    const { requireSuperAdmin } = await import("@/lib/admin")
    await expect(requireSuperAdmin("cancelarAcesso")).rejects.toThrow(/permissão/i)
    await expect(requireSuperAdmin("entrarNaConta")).rejects.toThrow(/permissão/i)
    await expect(requireSuperAdmin("gerenciarEquipe")).rejects.toThrow(/permissão/i)
  })

  it("barra quem nem está na equipe", async () => {
    emailDaSessao = "qualquer@um.com"
    const { requireSuperAdmin } = await import("@/lib/admin")
    await expect(requireSuperAdmin()).rejects.toThrow(/restrito/i)
  })
})

describe("admin — entrar na conta do cliente", () => {
  it("SEM cookie não impersona, e nem chega a consultar a sessão", async () => {
    emailDaSessao = FUNDADOR
    const { tenantImpersonado } = await import("@/lib/admin")
    expect(await tenantImpersonado()).toBeNull()
    // O caminho normal de TODAS as requisições passa por aqui. Consultar a
    // sessão à toa seria uma ida de rede ao Supabase por carregamento de tela.
    expect(vezesQueConsultouASessao).toBe(0)
  })

  it("COM cookie mas sem ser da equipe, NÃO impersona", async () => {
    // Forjar o cookie numa conta qualquer não dá acesso a nada.
    emailDaSessao = "tecnico@empresa-cliente.com.br"
    cookieImpersonacao = "tenant-de-outra-empresa"
    const { tenantImpersonado } = await import("@/lib/admin")
    expect(await tenantImpersonado()).toBeNull()
  })

  it("COM cookie e sendo do FINANCEIRO, NÃO impersona", async () => {
    // Está na equipe, o cookie é válido — e mesmo assim não entra, porque a
    // área dele não tem essa permissão.
    naEquipe("FINANCEIRO")
    cookieImpersonacao = "tenant-abc"
    const { tenantImpersonado } = await import("@/lib/admin")
    expect(await tenantImpersonado()).toBeNull()
  })

  it("COM cookie e sendo do SUPORTE (logística ou TI), impersona", async () => {
    for (const role of ["LOGISTICO", "TI"] as PlatformRole[]) {
      vi.resetModules()
      naEquipe(role)
      cookieImpersonacao = "tenant-abc"
      const { tenantImpersonado } = await import("@/lib/admin")
      expect(await tenantImpersonado(), role).toBe("tenant-abc")
    }
  })

  it("membro desativado não impersona nem com cookie válido", async () => {
    naEquipe("TI", false)
    cookieImpersonacao = "tenant-abc"
    const { tenantImpersonado } = await import("@/lib/admin")
    expect(await tenantImpersonado()).toBeNull()
  })
})
