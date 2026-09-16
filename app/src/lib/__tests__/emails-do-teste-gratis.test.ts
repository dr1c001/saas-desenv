import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DIAS_DE_TESTE } from "@/lib/teste-gratis"

// Os dois e-mails que chegam a quem está no teste grátis diziam que o acesso
// estava BLOQUEADO.
//
// Foram escritos quando o teste não existia: "escolha um plano para liberar o
// acesso" no boas-vindas, "você ainda não escolheu um plano — por isso o acesso
// continua bloqueado" no dia 3, os dois botões indo para /billing. O teste de
// 15 dias voltou em 14/09/2026 e os textos ficaram. Como o ÚNICO caminho que
// cria empresa carimba trialEndsAt, 100% dos destinatários tinham acesso total
// e liam que estavam bloqueados — e cinco dias depois recebiam "faltam 7 dias
// do seu teste". (Achado na auditoria de 13/09/2026.)
//
// Monta o e-mail de verdade com o Resend espiado — mesmo harness de
// past-due-email.test.ts.

const enviados: { subject: string; html: string; to: string }[] = []

beforeEach(() => {
  vi.resetModules()
  enviados.length = 0
  process.env.RESEND_API_KEY = "chave-de-teste"
  process.env.VERCEL_ENV = "production"
  vi.doMock("resend", () => ({
    Resend: class {
      emails = {
        send: async (p: { subject: string; html: string; to: string }) => {
          enviados.push(p)
          return { data: { id: "x" }, error: null }
        },
      }
    },
  }))
})

afterEach(() => {
  vi.doUnmock("resend")
  delete process.env.VERCEL_ENV
})

const PALAVRAS_DE_BLOQUEIO = /bloquead|blocked|liberar o acesso|unlock access|escolha um plano para|choose a plan to/i

describe("o boas-vindas", () => {
  it("diz quantos dias grátis a pessoa tem — o número da regra, não um escrito à mão", async () => {
    const { sendWelcomeEmail } = await import("@/lib/resend")
    await sendWelcomeEmail("dona@exemplo.com", "Priscila", { locale: "pt", vocabulary: null })

    expect(enviados[0].subject).toContain(`${DIAS_DE_TESTE} dias grátis`)
    expect(enviados[0].html).toContain(`${DIAS_DE_TESTE} dias de acesso completo`)
  })

  it("não fala em bloqueio, e o botão leva para DENTRO do sistema", async () => {
    const { sendWelcomeEmail } = await import("@/lib/resend")
    await sendWelcomeEmail("dona@exemplo.com", "Priscila", { locale: "pt", vocabulary: null })

    expect(enviados[0].subject).not.toMatch(PALAVRAS_DE_BLOQUEIO)
    expect(enviados[0].html).not.toMatch(PALAVRAS_DE_BLOQUEIO)
    expect(enviados[0].html).toContain("/dashboard")
    expect(enviados[0].html).not.toMatch(/href="[^"]*\/billing"/)
  })

  it("em inglês também", async () => {
    const { sendWelcomeEmail } = await import("@/lib/resend")
    await sendWelcomeEmail("owner@example.com", "Jane", { locale: "en", vocabulary: null })

    expect(enviados[0].subject).toContain(`${DIAS_DE_TESTE} free days`)
    expect(enviados[0].html).not.toMatch(PALAVRAS_DE_BLOQUEIO)
  })
})

describe("a dica do dia 3", () => {
  it("é uma dica de ativação: aponta para criar a primeira OS e diz quanto teste falta", async () => {
    const { sendOnboardingDay3Email } = await import("@/lib/resend")
    await sendOnboardingDay3Email("dona@exemplo.com", "Priscila", 12, { locale: "pt", vocabulary: null })

    const e = enviados[0]
    expect(e.html).toContain("/service-orders/new")
    expect(e.html).not.toMatch(/href="[^"]*\/billing"/)
    expect(e.html).toContain("12 dias")
    expect(e.subject).not.toMatch(PALAVRAS_DE_BLOQUEIO)
    expect(e.html).not.toMatch(PALAVRAS_DE_BLOQUEIO)
  })

  it("com um dia restante, o plural acompanha", async () => {
    // `n` vai como número para o plural ICU. Passar String quebraria a regra
    // em silêncio — é o que este caso guarda.
    const { sendOnboardingDay3Email } = await import("@/lib/resend")
    await sendOnboardingDay3Email("dona@exemplo.com", "Priscila", 1, { locale: "pt", vocabulary: null })

    expect(enviados[0].html).toContain("1 dia<")
    expect(enviados[0].html).not.toContain("1 dias")
  })

  it("o vocabulário padrão entra no lugar dos marcadores — nenhum [[...]] vaza", async () => {
    const { sendOnboardingDay3Email } = await import("@/lib/resend")
    await sendOnboardingDay3Email("dona@exemplo.com", "Priscila", 12, { locale: "pt", vocabulary: null })

    expect(enviados[0].subject).not.toContain("[[")
    expect(enviados[0].html).not.toContain("[[")
    expect(enviados[0].subject).toMatch(/ordem de serviço|OS/i)
  })
})

describe("o cron decide pela regra, e não por 'todo TRIAL no dia 3'", () => {
  // Estrutural: o bloco do dia 3 do cron precisa passar por lembreteDoDia3 —
  // a regra que só manda para quem está no teste e ainda não criou OS.
  it("o bloco do dia 3 consulta lembreteDoDia3 e passa os dias restantes", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/api/cron/daily/route.ts", "utf-8")
    )
    expect(fonte).toMatch(/lembreteDoDia3\(\{ trialEndsAt: t\.trialEndsAt, ordens: t\._count\.orders \}, now\)/)
    // A decisão GOVERNA o envio (o tipo também obriga: `diasRestantes` só existe
    // no ramo `enviar: true`, e o typecheck barra quem tirar o `continue`).
    expect(fonte).toContain("if (!decisao.enviar) continue")
    expect(fonte).toMatch(/sendOnboardingDay3Email\([^)]*decisao\.diasRestantes/)
  })
})
