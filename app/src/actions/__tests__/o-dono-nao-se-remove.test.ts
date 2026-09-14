import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Um ADMIN não pode apagar o OWNER.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `removeTeamMember` conferia assinatura, papel de quem pede, e que a pessoa não
// estava se removendo — e nunca o papel do ALVO. A função irmã do mesmo arquivo,
// `updateTeamMemberRole`, já recusava mexer no papel de um OWNER desde a revisão
// de segurança de 19/07/2026. Só remover ficou de fora.
//
// O estrago não é perder um usuário:
//   - no login seguinte o dono cai em `getTenant()` sem linha de User, não é
//     super admin, e o código CRIA UMA EMPRESA NOVA E VAZIA no nome dele — ele
//     perde a empresa que paga, os clientes, as OS e o financeiro;
//   - a empresa original fica sem OWNER, e `subscribeToPlan` passa a recusar com
//     "ownerNotFound" enquanto o e-mail de pagamento confirmado fica sem
//     destinatário;
//   - quem apagou continua com acesso total.
//
// ADMIN não é cargo raro: outro ADMIN o distribui por convite.
// (Achado na auditoria de 13/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    limparMetadataDoUsuario: vi.fn().mockResolvedValue(undefined),
    supabaseAdmin: { auth: { admin: { updateUserById: vi.fn(), deleteUser: vi.fn() } } },
  }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/team")

async function equipe() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const dono = await testDb.db.user.create({
    data: { id: "dono", tenantId: tenant.id, name: "Adriel", email: "d@ex.com", role: "OWNER" },
  })
  const admin = await testDb.db.user.create({
    data: { id: "adm", tenantId: tenant.id, name: "Rita", email: "r@ex.com", role: "ADMIN" },
  })
  const tecnico = await testDb.db.user.create({
    data: { id: "tec", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  return { tenant, dono, admin, tecnico }
}

const como = (t: string, u: string, role: string) =>
  mockGetTenant.mockResolvedValue({ tenantId: t, userId: u, role })

describe("remover da equipe", () => {
  it("o ADMIN não consegue apagar o OWNER", async () => {
    const { tenant, dono, admin } = await equipe()
    como(tenant.id, admin.id, "ADMIN")
    const { removeTeamMember } = await acoes()

    await removeTeamMember(dono.id)

    const aindaLa = await testDb.db.user.findUnique({ where: { id: dono.id } })
    expect(aindaLa).not.toBeNull()
    expect(aindaLa?.role).toBe("OWNER")
  })

  it("nem o próprio OWNER apaga outro OWNER", async () => {
    // Empresa com dois donos é estado alcançável (o primeiro convida o sócio).
    // Nenhum dos dois deve conseguir apagar o outro por esta porta — a saída de
    // um dono é decisão que merece outro caminho, não um clique na lista.
    const { tenant, dono } = await equipe()
    const socio = await testDb.db.user.create({
      data: { id: "socio", tenantId: tenant.id, name: "Ana", email: "a@ex.com", role: "OWNER" },
    })
    como(tenant.id, dono.id, "OWNER")
    const { removeTeamMember } = await acoes()

    await removeTeamMember(socio.id)

    expect(await testDb.db.user.findUnique({ where: { id: socio.id } })).not.toBeNull()
  })

  it("remover um TÉCNICO continua funcionando", async () => {
    // A trava não pode virar um "ninguém sai da equipe".
    const { tenant, admin, tecnico } = await equipe()
    como(tenant.id, admin.id, "ADMIN")
    const { removeTeamMember } = await acoes()

    await removeTeamMember(tecnico.id)

    expect(await testDb.db.user.findUnique({ where: { id: tecnico.id } })).toBeNull()
  })

  it("um id de OUTRA empresa não apaga ninguém", async () => {
    // O alvo é lido com `tenantId` junto: sem isso, a consulta do papel poderia
    // encontrar o OWNER da empresa vizinha e a decisão sairia do registro errado.
    const { tenant, admin } = await equipe()
    const outra = await testDb.db.tenant.create({ data: { name: "Vizinha" } })
    const alheio = await testDb.db.user.create({
      data: { id: "alheio", tenantId: outra.id, name: "Zé", email: "z@ex.com", role: "TECHNICIAN" },
    })
    como(tenant.id, admin.id, "ADMIN")
    const { removeTeamMember } = await acoes()

    await removeTeamMember(alheio.id)

    expect(await testDb.db.user.findUnique({ where: { id: alheio.id } })).not.toBeNull()
  })
})
