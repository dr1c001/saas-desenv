import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { VERSAO_CONTRATO } from "@/components/pdf/contrato-pdf"

// O contrato que chega anexado ao e-mail de confirmação de pagamento.
//
// ─── Dois defeitos da auditoria de 13/09/2026 ────────────────────────────────
//
// 1. O PREÇO era lido do Plan — a TABELA. Quem negociou mensalidade (o painel
//    grava `customPriceMonthly`) recebia um contrato dizendo R$ 197 enquanto a
//    Asaas cobrava R$ 120. No anual a divergência dobra, porque o combinado
//    vira doze vezes a mensalidade e não o `priceYearly` da tabela.
// 2. A VERSÃO e a CARÊNCIA eram sempre as de hoje. Quem assinou a v1.1 (5 dias)
//    baixava um PDF rotulado v1.2 prometendo 30 — e o cabeçalho do módulo já
//    dizia que "o prazo declarado no documento dela continua sendo o que ela
//    assinou".
//
// Aqui se testa o que o gerador MONTA; o desenho do PDF tem teste próprio em
// components/pdf/__tests__.

let testDb: TestDatabase
const mockRender = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  // O render de PDF é caro e já tem teste próprio: aqui interessa o que é
  // PASSADO para ele.
  vi.doMock("@react-pdf/renderer", () => ({ renderToBuffer: mockRender }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockRender.mockReset().mockResolvedValue(Buffer.alloc(2048))
})

async function cenario(opcoes: {
  combinado?: number | null
  ciclo?: "MONTHLY" | "YEARLY"
  versaoAceita?: string | null
  aceite?: { em: Date; ip: string } | null
} = {}) {
  const plano = await testDb.db.plan.create({
    data: {
      name: "Pro",
      slug: `pro-${Math.random().toString(36).slice(2, 8)}`,
      priceMonthly: 197,
      // A tabela dá desconto no anual: "pague 10, leve 12".
      priceYearly: 1970,
    },
  })
  const tenant = await testDb.db.tenant.create({
    data: {
      name: "Polar Clima",
      document: "12345678000190",
      customPriceMonthly: opcoes.combinado ?? null,
    },
  })
  await testDb.db.user.create({
    data: { id: `dono-${tenant.id}`, tenantId: tenant.id, name: "Adriel", email: `d-${tenant.id}@ex.com`, role: "OWNER" },
  })
  await testDb.db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plano.id,
      status: "ACTIVE",
      billingCycle: opcoes.ciclo ?? "MONTHLY",
      currentPeriodStart: new Date("2026-09-01T12:00:00Z"),
      currentPeriodEnd: new Date("2026-10-01T12:00:00Z"),
      contractVersion: opcoes.versaoAceita === undefined ? VERSAO_CONTRATO : opcoes.versaoAceita,
      acceptedAt: opcoes.aceite?.em ?? null,
      acceptedIp: opcoes.aceite?.ip ?? null,
    },
  })
  return { tenant, plano }
}

/** Os dados que o gerador entregou ao PDF. */
async function gerar(tenantId: string) {
  const { gerarContrato } = await import("@/lib/contrato")
  const r = await gerarContrato(tenantId)
  const elemento = mockRender.mock.calls[0]?.[0] as { props: { dados: Record<string, unknown> } }
  return { resultado: r, dados: elemento.props.dados }
}

describe("o preço impresso é o que a empresa PAGA", () => {
  it("sem combinado, é a tabela", async () => {
    const { tenant } = await cenario()
    const { dados } = await gerar(tenant.id)
    expect((dados.plano as { valorCobrado: number }).valorCobrado).toBe(197)
  })

  it("com mensalidade combinada, é a combinada — e não os R$ 197 da tabela", async () => {
    const { tenant } = await cenario({ combinado: 120 })
    const { dados } = await gerar(tenant.id)
    expect((dados.plano as { valorCobrado: number }).valorCobrado).toBe(120)
  })

  it("no ANUAL, o combinado é doze vezes a mensalidade — e não o priceYearly da tabela", async () => {
    // A divergência dobrava aqui: o contrato imprimia R$ 1.970 (tabela com
    // desconto anual) para quem combinou R$ 120/mês, ou seja R$ 1.440.
    const { tenant } = await cenario({ combinado: 120, ciclo: "YEARLY" })
    const { dados } = await gerar(tenant.id)
    expect((dados.plano as { valorCobrado: number }).valorCobrado).toBe(1440)
  })

  it("sem combinado, o anual segue a tabela", async () => {
    const { tenant } = await cenario({ ciclo: "YEARLY" })
    const { dados } = await gerar(tenant.id)
    expect((dados.plano as { valorCobrado: number }).valorCobrado).toBe(1970)
  })
})

describe("a versão impressa é a que o cliente ACEITOU", () => {
  it("quem aceitou a v1.1 recebe v1.1, com os 5 dias que ela declarava", async () => {
    const { tenant } = await cenario({ versaoAceita: "1.1" })
    const { resultado, dados } = await gerar(tenant.id)

    expect(dados.versao).toBe("1.1")
    expect(dados.diasCarencia).toBe(5)
    expect(resultado!.nomeArquivo).toContain("-v1.1.pdf")
  })

  it("quem aceitou a atual recebe a atual", async () => {
    const { tenant } = await cenario()
    const { dados } = await gerar(tenant.id)
    expect(dados.versao).toBe(VERSAO_CONTRATO)
  })

  it("assinatura anterior ao registro de versão cai na atual", async () => {
    const { tenant } = await cenario({ versaoAceita: null })
    const { dados } = await gerar(tenant.id)
    expect(dados.versao).toBe(VERSAO_CONTRATO)
  })
})

describe("o aceite registrado", () => {
  it("vai para o documento quando existe — é o que o quadro de fecho promete", async () => {
    const em = new Date("2026-09-22T14:30:00Z")
    const { tenant } = await cenario({ aceite: { em, ip: "200.150.10.20" } })

    const { dados } = await gerar(tenant.id)

    expect(dados.aceite).toEqual({ em, ip: "200.150.10.20" })
  })

  it("e NÃO é inventado para quem assinou antes de ele existir", async () => {
    const { tenant } = await cenario({ aceite: null })
    const { dados } = await gerar(tenant.id)
    expect(dados.aceite).toBeNull()
  })
})

describe("a Action grava o aceite no ato da contratação", () => {
  // Estrutural: exercitar `subscribeToPlan` inteira exigiria a Asaas, o
  // redirect do Next e os headers da requisição. O que se prova aqui é que os
  // quatro campos que o contrato promete são gravados — eles não existiam.
  it("versão, data, IP e quem aceitou", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/actions/billing.ts", "utf-8")
    )
    expect(fonte).toContain("contractVersion: VERSAO_CONTRATO")
    expect(fonte).toContain("acceptedAt: new Date()")
    expect(fonte).toContain("acceptedIp: await clientIp()")
    expect(fonte).toContain("acceptedByUserId: userId")
  })
})
