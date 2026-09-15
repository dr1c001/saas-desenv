import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O cargo passou a valer de verdade.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// Financeiro, Relatórios, Contratos e Mapa eram OWNER/ADMIN por linha escrita à
// mão, em dois lugares cada: o `redirect` da página e o `if (role !== ...)` da
// Server Action. Ao mesmo tempo, `ABAS_PADRAO` (lib/cargos.ts) fazia o cargo
// FINANCEIRO nascer com "Financeiro" e "Relatórios" no menu, o COMERCIAL com
// "Contratos" e o GERENTE com o Mapa.
//
// As duas regras se contradiziam, e quem pagava era o cliente: o dono convidava
// a pessoa como FINANCEIRO, ela via o Financeiro no menu, clicava — e voltava
// para o painel sem explicação nenhuma. Seis dos oito cargos não serviam para
// nada no dia a dia; na prática o sistema tinha dois papéis, dono e resto.
//
// Este arquivo trava o que passou a decidir: a ABA. Ela é o que o dono configura
// em Configurações › Permissões, e é o que o layout usa para barrar a rota (ver
// aba-da-rota.test.ts). A parte estrutural no fim garante que as travas antigas
// não voltem por cópia e cola.
//
// Balanço e Assinatura ficaram FORA desta mudança de propósito: um é o
// patrimônio da empresa, o outro é a conta do dono com o ServiçoOS. Nenhum dos
// dois é trabalho de cargo operacional. (15/09/2026.)

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
  vi.doMock("@/lib/resend", () => ({ sendWelcomeEmail: vi.fn() }))
  vi.doMock("@/lib/avisar-plataforma", () => ({ avisarPlataforma: vi.fn() }))
  vi.doMock("@/lib/admin", () => ({
    tenantImpersonado: vi.fn().mockResolvedValue(null),
    isSuperAdmin: vi.fn().mockResolvedValue(false),
  }))
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }))
  vi.doMock("next/server", () => ({ after: vi.fn() }))
  vi.doMock("next-intl/server", () => ({ getTranslations: async () => (c: string) => c }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

async function empresa() {
  return testDb.db.tenant.create({ data: { name: "Polar Clima" } })
}

const abas = async (tenantId: string, cargo: string) => {
  const { getAllowedTabs } = await import("@/lib/auth")
  return getAllowedTabs(tenantId, cargo)
}

describe("a empresa que nunca configurou permissões", () => {
  it("o FINANCEIRO abre o Financeiro e os Relatórios", async () => {
    const t = await empresa()
    const permitidas = await abas(t.id, "FINANCEIRO")

    expect(permitidas).toContain("finance")
    expect(permitidas).toContain("reports")
  })

  it("o COMERCIAL abre os Contratos", async () => {
    const t = await empresa()
    expect(await abas(t.id, "COMERCIAL")).toContain("contracts")
  })

  it("o GERENTE abre o Mapa", async () => {
    const t = await empresa()
    expect(await abas(t.id, "GERENTE")).toContain("map")
  })

  it("mas o TÉCNICO não abre nenhuma das quatro", async () => {
    // O ponto da mudança não é liberar: é obedecer a configuração. O técnico
    // continua fora — e agora por uma regra só, e não por duas que se
    // contradizem.
    const t = await empresa()
    const permitidas = await abas(t.id, "TECHNICIAN")

    expect(permitidas).not.toContain("finance")
    expect(permitidas).not.toContain("reports")
    expect(permitidas).not.toContain("contracts")
    expect(permitidas).not.toContain("map")
  })
})

describe("a empresa que configurou", () => {
  it("o que o dono marcou vale — mesmo contra o padrão do cargo", async () => {
    // O dono tira o Financeiro do gerente dele. Antes isso mudava só o menu.
    const t = await empresa()
    await testDb.db.tenant.update({
      where: { id: t.id },
      data: { tabsConfiguredRoles: ["GERENTE"] },
    })
    for (const tab of ["dashboard", "service-orders", "reports"]) {
      await testDb.db.tabPermission.create({
        data: { tenantId: t.id, role: "GERENTE", tab },
      })
    }

    const permitidas = await abas(t.id, "GERENTE")
    expect(permitidas).toContain("reports")
    expect(permitidas).not.toContain("finance")
  })

  it("e o dono continua vendo tudo, configurem o que configurarem", async () => {
    const t = await empresa()
    await testDb.db.tenant.update({
      where: { id: t.id },
      data: { tabsConfiguredRoles: ["OWNER"] },
    })

    const permitidas = await abas(t.id, "OWNER")
    expect(permitidas).toContain("finance")
    expect(permitidas).toContain("balanco")
  })
})

describe("as travas de cargo escritas à mão não voltam", () => {
  // Estrutural, e não de comportamento: exercitar uma página do App Router
  // exigiria montar headers, sessão do Supabase e meia dúzia de componentes
  // para provar a AUSÊNCIA de uma linha. Mesma convenção de
  // cron-resumo.test.ts e sw-estrategia.test.ts.
  const ler = (p: string) =>
    import("node:fs/promises").then((fs) => fs.readFile(p, "utf-8"))

  const TELAS = [
    "src/app/(dashboard)/finance/page.tsx",
    "src/app/(dashboard)/reports/page.tsx",
    "src/app/(dashboard)/contracts/page.tsx",
    "src/app/(dashboard)/map/page.tsx",
  ]

  it.each(TELAS)("%s não redireciona por cargo", async (tela) => {
    const fonte = await ler(tela)
    expect(fonte).not.toMatch(/role !== "OWNER"/)
  })

  const ACOES = [
    ["src/actions/finance.ts", "finance"],
    ["src/actions/reports.ts", "reports"],
    ["src/actions/contracts.ts", "contracts"],
    ["src/actions/dashboard.ts", "finance"],
  ] as const

  it.each(ACOES)("%s se defende pela aba", async (arquivo, aba) => {
    // A Action é endereço HTTP próprio: a página deixar de barrar só é seguro
    // porque a Action barra sozinha. `requireAba` lança; `podeAba` devolve —
    // a segunda forma é a dos formulários com useActionState, onde a mensagem
    // é o que a tela mostra e lançar derrubaria a página.
    const fonte = await ler(arquivo)
    expect(fonte).toMatch(new RegExp(`(requireAba|podeAba)\\("${aba}"\\)`))
  })

  it("nenhuma Action de dinheiro OPERACIONAL ficou por cargo", async () => {
    // As duas que sobram em finance.ts são POLÍTICA (a base da comissão e a
    // opção de pagar em lote), e ficam com dono e administrador de propósito.
    const fonte = await ler("src/actions/finance.ts")
    const porCargo = fonte.match(/role !== "OWNER"/g) ?? []
    expect(porCargo).toHaveLength(2)
  })

  it.each([
    "src/app/api/location/list/route.ts",
    "src/app/api/location/orders/route.ts",
  ])("%s concorda com a página do mapa", async (rota) => {
    // Se a rota continuasse OWNER/ADMIN, o gerente abriria o mapa e ele nunca
    // atualizaria: 403 silencioso a cada polling.
    const fonte = await ler(rota)
    expect(fonte).toContain('requireAba("map")')
    expect(fonte).not.toMatch(/role !== "OWNER"/)
  })
})
