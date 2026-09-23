import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { abasDeMentira } from "@/test-utils/abas-de-mentira"

// Duas portas que estavam abertas por papel.
//
// ─── GPS da equipe ───────────────────────────────────────────────────────────
//
// `getTeamMembers` trazia `latitude` e `longitude` de todos os colegas, e as
// suas únicas defesas eram tenant e assinatura. Qualquer usuário autenticado
// despachava a Server Action e recebia a localização atual de todo mundo.
//
// O projeto já tinha decidido que isso não pode: `/api/location/list` ganhou a
// trava de papel em 19/07/2026, e `/map` repete. Duas portas para a mesma
// coluna foram trancadas; esta terceira ficou aberta.
//
// A correção não foi uma quarta checagem de papel: foi PARAR DE ENVIAR o que
// nenhuma tela usa — a de Equipe imprime só a data da última posição.
//
// ─── Balanço patrimonial ─────────────────────────────────────────────────────
//
// `getBalanco` e `exportarBalancoCsv` não conferiam papel. As três funções de
// ESCRITA do mesmo arquivo conferiam, cada uma por conta própria. Ou seja: a
// guarda estava nos lugares que já estavam protegidos e faltava justamente nas
// duas que entregavam tudo — caixa, contas a receber e a pagar, estoque,
// imobilizado, capital social.
//
// (Achados na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    ...abasDeMentira(mockGetTenant),
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    filtroDeFilialAtual: vi.fn().mockResolvedValue({}),
    checarAcao: vi.fn().mockResolvedValue(null),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    temFuncao: vi.fn().mockResolvedValue(false),
  }))
  vi.doMock("@/lib/supabase/admin", () => ({ limparMetadataDoUsuario: vi.fn() }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

async function empresaComEquipe() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const dono = await testDb.db.user.create({
    data: { id: "dono", tenantId: tenant.id, name: "Adriel", email: "d@ex.com", role: "OWNER" },
  })
  const tecnico = await testDb.db.user.create({
    data: { id: "tec", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  await testDb.db.userLocation.create({
    data: { userId: tecnico.id, latitude: -22.72, longitude: -47.64 },
  })
  return { tenant, dono, tecnico }
}

const como = (t: string, u: string, role: string) =>
  mockGetTenant.mockResolvedValue({ tenantId: t, userId: u, role })

describe("a localização da equipe", () => {
  it("NÃO sai em getTeamMembers, nem para o dono", async () => {
    // Não é questão de papel: é dado que nenhuma tela usa. Devolvê-lo só para
    // o dono manteria a coluna viajando à toa, e a próxima porta repetiria o
    // erro.
    const { tenant, dono } = await empresaComEquipe()
    como(tenant.id, dono.id, "OWNER")
    const { getTeamMembers } = await import("@/actions/team")

    const membros = await getTeamMembers()
    const comLocal = membros.find((m) => m.location !== null)

    expect(comLocal).toBeDefined()
    expect(comLocal!.location).not.toHaveProperty("latitude")
    expect(comLocal!.location).not.toHaveProperty("longitude")
  })

  it("mas a DATA da última posição continua vindo — a tela mostra", async () => {
    const { tenant, dono } = await empresaComEquipe()
    como(tenant.id, dono.id, "OWNER")
    const { getTeamMembers } = await import("@/actions/team")

    const membros = await getTeamMembers()
    const comLocal = membros.find((m) => m.location !== null)

    expect(comLocal!.location).toHaveProperty("updatedAt")
  })
})

describe("o balanço patrimonial", () => {
  it("o TÉCNICO não consegue lê-lo", async () => {
    const { tenant, tecnico } = await empresaComEquipe()
    como(tenant.id, tecnico.id, "TECHNICIAN")
    const { getBalanco } = await import("@/actions/balanco")

    await expect(getBalanco()).rejects.toThrow()
  })

  it("nem pela exportação em CSV, que é a mesma porta por outro nome", async () => {
    const { tenant, tecnico } = await empresaComEquipe()
    como(tenant.id, tecnico.id, "FINANCEIRO")
    const { exportarBalancoCsv } = await import("@/actions/balanco")

    await expect(exportarBalancoCsv()).rejects.toThrow()
  })

  it("o dono lê normalmente", async () => {
    const { tenant, dono } = await empresaComEquipe()
    como(tenant.id, dono.id, "OWNER")
    const { getBalanco } = await import("@/actions/balanco")

    await expect(getBalanco()).resolves.toBeDefined()
  })

  it("e o administrador também", async () => {
    const { tenant, dono } = await empresaComEquipe()
    como(tenant.id, dono.id, "ADMIN")
    const { getBalanco } = await import("@/actions/balanco")

    await expect(getBalanco()).resolves.toBeDefined()
  })
})

describe("o layout barra a rota pela aba", () => {
  // Estrutural: exercitar o layout exigiria simular headers, sessão e meia
  // dúzia de componentes para provar uma linha. E o defeito era a AUSÊNCIA
  // dessa linha — `getAllowedTabs` existia e ninguém a consultava para barrar.
  it("o layout do painel consulta abaDaRota e redireciona", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/(dashboard)/layout.tsx", "utf-8")
    )
    expect(fonte).toContain("abaDaRota(pathname)")
    expect(fonte).toMatch(/allowedTabs\.includes\(.*\)\s*\)\s*redirect/)
  })
})
