import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A regra pura está em acoes.test.ts. O que se prova AQUI é a leitura contra o
// banco: que o padrão vale para quem nunca configurou, que desmarcar tudo
// significa nada, e que uma empresa não enxerga a configuração da outra.

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

async function empresa(dados: { actionsConfigured?: boolean; tabsConfigured?: boolean } = {}) {
  return testDb.db.tenant.create({ data: { name: "Empresa", ...dados } })
}

describe("ações permitidas ao técnico", () => {
  it("empresa que nunca configurou fica com TUDO liberado", async () => {
    // É o comportamento de hoje, e o motivo de o padrão ser aberto: fechar por
    // padrão deixaria todo cliente atual com os técnicos parados sem ter
    // pedido mudança nenhuma.
    const t = await empresa()
    const { getAcoesPermitidas } = await import("@/lib/auth")
    const { ACOES } = await import("@/lib/acoes")

    expect(await getAcoesPermitidas(t.id, "TECHNICIAN")).toEqual(ACOES)
  })

  it("configurada e sem nenhuma linha = NADA liberado", async () => {
    // O defeito que a permissão por aba tinha: desmarcar tudo gravava zero
    // linhas, zero linhas era lido como "usar o padrão", e o padrão devolvia
    // acesso. A tela prometia uma coisa e o sistema fazia outra.
    const t = await empresa({ actionsConfigured: true })
    const { getAcoesPermitidas } = await import("@/lib/auth")

    expect(await getAcoesPermitidas(t.id, "TECHNICIAN")).toEqual([])
  })

  it("devolve exatamente o que foi gravado", async () => {
    const t = await empresa({ actionsConfigured: true })
    await testDb.db.actionPermission.createMany({
      data: [
        { tenantId: t.id, role: "TECHNICIAN", action: "os.concluir" },
        { tenantId: t.id, role: "TECHNICIAN", action: "os.status" },
      ],
    })
    const { getAcoesPermitidas } = await import("@/lib/auth")

    expect([...(await getAcoesPermitidas(t.id, "TECHNICIAN"))].sort()).toEqual([
      "os.concluir",
      "os.status",
    ])
  })

  it("ignora ação gravada que não existe mais no catálogo", async () => {
    // Se uma ação for removida do catálogo, a linha velha continua no banco.
    // Deixá-la passar concederia uma permissão que ninguém consegue mais ver
    // nem desmarcar na tela.
    const t = await empresa({ actionsConfigured: true })
    await testDb.db.actionPermission.createMany({
      data: [
        { tenantId: t.id, role: "TECHNICIAN", action: "os.concluir" },
        { tenantId: t.id, role: "TECHNICIAN", action: "acao.que.nao.existe" },
      ],
    })
    const { getAcoesPermitidas } = await import("@/lib/auth")

    expect(await getAcoesPermitidas(t.id, "TECHNICIAN")).toEqual(["os.concluir"])
  })

  it("OWNER e ADMIN não são afetados pela configuração", async () => {
    const t = await empresa({ actionsConfigured: true })
    const { getAcoesPermitidas } = await import("@/lib/auth")
    const { ACOES } = await import("@/lib/acoes")

    expect(await getAcoesPermitidas(t.id, "OWNER")).toEqual(ACOES)
    expect(await getAcoesPermitidas(t.id, "ADMIN")).toEqual(ACOES)
  })

  it("a configuração de uma empresa não vaza para a outra", async () => {
    const fechada = await empresa({ actionsConfigured: true })
    const aberta = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const { getAcoesPermitidas } = await import("@/lib/auth")
    const { ACOES } = await import("@/lib/acoes")

    expect(await getAcoesPermitidas(fechada.id, "TECHNICIAN")).toEqual([])
    expect(await getAcoesPermitidas(aberta.id, "TECHNICIAN")).toEqual(ACOES)
  })
})
