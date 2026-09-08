import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { AVISOS_ATRASO, decidirAviso, diasDeAtraso } from "@/lib/past-due"

// A cobrança da ASSINATURA vale para TODOS os planos.
//
// ─── O pedido ────────────────────────────────────────────────────────────────
//
// "a cobrança de pagamento de assinaturas tem que ser para todos os planos:
//  starter, pro, enterprise e outros planos."
//
// ─── Por que este arquivo existe se já funciona ─────────────────────────────
//
// Porque hoje funciona por AUSÊNCIA: a consulta filtra `status: PAST_DUE` e não
// olha o plano, e a criação da assinatura na Asaas não tem ramo por plano. Não
// há nada afirmando que é assim de propósito.
//
// Uma trava por plano é a coisa mais fácil do mundo de aparecer sem querer —
// basta alguém acrescentar `plan: { slug: { in: [...] } }` numa consulta para
// resolver outro problema. E o efeito seria invisível: o cliente inadimplente
// de um plano simplesmente pararia de ser avisado, e o primeiro sinal seria ele
// perdendo acesso sem nunca ter recebido aviso — que é exatamente o defeito que
// a régua de atraso existe para evitar.
//
// Este arquivo transforma "funciona porque ninguém filtrou" em "quebra se
// alguém filtrar".

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

const AGORA = new Date("2026-09-08T12:00:00Z")

/** Os planos vendidos hoje, mais um personalizado e um criado depois. */
const PLANOS = [
  { slug: "starter", nome: "Starter", preco: 97 },
  { slug: "pro", nome: "Pro", preco: 197 },
  { slug: "enterprise", nome: "Enterprise", preco: 397 },
  // "e outros planos": o que for criado no painel depois desta data.
  { slug: "plano-novo", nome: "Plano Novo", preco: 597 },
]

async function empresaAtrasada(plano: { slug: string; nome: string; preco: number }, dias: number) {
  const p = await testDb.db.plan.upsert({
    where: { slug: plano.slug },
    update: {},
    create: {
      slug: plano.slug,
      name: plano.nome,
      priceMonthly: plano.preco,
      priceYearly: plano.preco * 10,
      features: [],
    },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: `Empresa ${plano.slug}`, planId: p.id, subscriptionStatus: "PAST_DUE" },
  })
  await testDb.db.user.create({
    data: {
      id: `dono-${plano.slug}`,
      tenantId: tenant.id,
      name: "Dono",
      email: `dono-${plano.slug}@ex.com`,
      role: "OWNER",
    },
  })
  const venceu = new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000)
  const sub = await testDb.db.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: p.id,
      status: "PAST_DUE",
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date(venceu.getTime() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: venceu,
      pastDueWarningsSent: 0,
      asaasId: `asaas-${plano.slug}`,
    },
  })
  return { plano: p, tenant, sub }
}

/** A MESMA consulta que o cron faz para achar quem avisar. */
async function quemSeriaAvisado() {
  return testDb.db.subscription.findMany({
    where: { status: "PAST_DUE", pastDueWarningsSent: { lt: AVISOS_ATRASO.length } },
    select: {
      id: true,
      currentPeriodEnd: true,
      pastDueWarningsSent: true,
      plan: { select: { slug: true } },
    },
  })
}

describe("nenhum plano fica de fora da cobrança de assinatura", () => {
  it("Starter, Pro, Enterprise e um plano novo — todos entram", async () => {
    for (const p of PLANOS) await empresaAtrasada(p, 3)

    const alcancados = await quemSeriaAvisado()

    expect(alcancados.map((s) => s.plan?.slug).sort()).toEqual(
      PLANOS.map((p) => p.slug).sort()
    )
  })

  it("e todos os quatro recebem aviso de verdade, não só entram na lista", async () => {
    // Entrar na consulta não basta: a decisão poderia recusar depois.
    for (const p of PLANOS) await empresaAtrasada(p, 3)

    const avisados = (await quemSeriaAvisado()).filter(
      (s) =>
        decidirAviso(diasDeAtraso(s.currentPeriodEnd, AGORA), s.pastDueWarningsSent).enviar
    )

    expect(avisados).toHaveLength(PLANOS.length)
  })

  it("o plano PERSONALIZADO também é cobrado, e pelo valor combinado", async () => {
    // `customPriceMonthly` é a mensalidade acertada com aquela empresa. Ela
    // existia e NÃO era usada na cobrança: o painel gravava o valor e a Asaas
    // continuava cobrando a tabela — dar o combinado de graça.
    const { tenant, sub } = await empresaAtrasada(PLANOS[0], 3)
    await testDb.db.tenant.update({
      where: { id: tenant.id },
      data: { customPriceMonthly: 149 },
    })

    const alcancados = await quemSeriaAvisado()
    expect(alcancados.map((s) => s.id)).toContain(sub.id)

    const { precoCobrado } = await import("@/lib/preco")
    expect(precoCobrado({ priceMonthly: 97, priceYearly: 970 }, 149, "MONTHLY", 0)).toBe(149)
  })

  it("a escada de avisos é a mesma para todos", async () => {
    // Sete avisos ao longo da carência, iguais em qualquer plano. Um plano com
    // escada própria seria uma regra invisível: o cliente de um plano receberia
    // menos avisos que o de outro antes de perder acesso.
    const decisoes = new Map<string, number[]>()
    for (const p of PLANOS) {
      const { sub } = await empresaAtrasada(p, 0)
      const degraus: number[] = []
      let enviados = 0
      for (const dia of [1, 3, 10, 15, 20, 25, 30, 45]) {
        const d = decidirAviso(dia, enviados)
        if (d.enviar) {
          degraus.push(dia)
          enviados = d.total
        }
      }
      decisoes.set(p.slug, degraus)
      expect(sub.id).toBeTruthy()
    }

    const referencia = decisoes.get("starter")!
    for (const p of PLANOS) {
      expect(decisoes.get(p.slug), `${p.slug} tem escada diferente`).toEqual(referencia)
    }
    expect(referencia).toEqual([...AVISOS_ATRASO])
  })

  it("empresa em dia NÃO é cobrada, em plano nenhum", async () => {
    // O outro lado: cobrar quem está em dia é pior que não cobrar quem atrasou.
    for (const p of PLANOS) {
      const { tenant } = await empresaAtrasada(p, 3)
      await testDb.db.subscription.updateMany({
        where: { tenantId: tenant.id },
        data: { status: "ACTIVE" },
      })
    }

    expect(await quemSeriaAvisado()).toEqual([])
  })

  it("quem já recebeu os sete avisos para de receber", async () => {
    // Depois do corte a cobrança automática cessa — passar disso vira
    // perseguição, e quem chegou ao trigésimo dia já perdeu o acesso.
    for (const p of PLANOS) {
      const { tenant } = await empresaAtrasada(p, 40)
      await testDb.db.subscription.updateMany({
        where: { tenantId: tenant.id },
        data: { pastDueWarningsSent: AVISOS_ATRASO.length },
      })
    }

    expect(await quemSeriaAvisado()).toEqual([])
  })
})

describe("o cron NÃO filtra por plano — conferido no código-fonte", () => {
  // Os testes acima ESPELHAM a consulta do cron em vez de chamá-la: exercitar
  // o route handler exigiria simular Asaas, geocodificação, e-mail e emissor
  // fiscal para conferir um `where`.
  //
  // A cópia tem um custo honesto: se alguém puser um filtro de plano no cron e
  // não mexer no teste, o espelho continua verde. Este bloco fecha essa brecha
  // olhando o código de verdade — a mesma tática do resumo do cron e da lista
  // de rotas do service worker.

  const FONTE = "src/app/api/cron/daily/route.ts"

  async function trechoDaConsulta(): Promise<string> {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const fonte = readFileSync(join(process.cwd(), FONTE), "utf8")
    const i = fonte.indexOf('status: "PAST_DUE", pastDueWarningsSent')
    expect(i, "a consulta de inadimplência mudou de forma").toBeGreaterThan(-1)
    // O `where` inteiro, até o fim da linha.
    return fonte.slice(i, fonte.indexOf("\n", i))
  }

  it("a consulta de inadimplência não menciona plano nenhum", async () => {
    const where = await trechoDaConsulta()

    expect(where).not.toContain("plan")
    expect(where).not.toContain("slug")
    expect(where).not.toContain("planId")
  })

  it("e não menciona os nomes dos planos em lugar nenhum do arquivo", async () => {
    // Uma trava também pode aparecer fora do `where` — num `if` antes do envio,
    // por exemplo. O cron inteiro não tem por que citar um plano pelo nome.
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const fonte = readFileSync(join(process.cwd(), FONTE), "utf8")

    for (const slug of ["starter", "enterprise"]) {
      expect(fonte.toLowerCase(), `o cron cita o plano "${slug}"`).not.toContain(`"${slug}"`)
    }
  })
})
