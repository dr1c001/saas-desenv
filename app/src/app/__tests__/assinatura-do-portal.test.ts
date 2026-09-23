import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// O portal público oferecia ao CLIENTE FINAL o que a empresa não comprou — e
// depois mostrava a ele a nossa cobrança de upgrade.
//
// A tela /p/[token] só perguntava por `temFuncao(tenantId, "portalCliente")`.
// O cartão "Assine aqui" era renderizado para toda OS concluída, de qualquer
// empresa, em qualquer plano. A rota que grava (api/signature) barrava
// corretamente com 403 — e a mensagem dela é "A assinatura digital do cliente
// faz parte do plano Pro. Faça upgrade em Configurações → Plano para liberar."
// O componente imprimia `data.error` cru na tela.
//
// O resultado, na prática: a empresa no Starter concluía um serviço e mandava
// o link ao cliente dela; o cliente via "Assine aqui", desenhava a assinatura
// no dedo, confirmava — e lia a NOSSA cobrança de upgrade numa página que fala
// em nome de quem o atendeu. Quem contrata plano é a empresa, não o cliente
// dela. (Achado na auditoria de 13/09/2026, grupo 9.)
//
// ─── Por que ESTRUTURAL ──────────────────────────────────────────────────────
//
// A tela é Server Component com prisma, getTranslator, cobrança PIX e QR; e
// nenhum teste do projeto importa um handler de rota (getTranslations de
// next-intl/server exige request context). Mesma convenção de
// checklist-alcancavel.test.ts, que é o precedente exato: tela pesada, defeito
// numa CONDIÇÃO. O lado comportamental — que o Starter não tem "signature" —
// já está provado em lib/__tests__/plan.test.ts.

const RAIZ = process.cwd()
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8")

const TELA = ler("src/app/p/[token]/page.tsx")
const ROTA = ler("src/app/api/signature/route.ts")
const PAD = ler("src/components/service-orders/signature-pad-public.tsx")

const mensagens = (idioma: "pt" | "en") =>
  JSON.parse(ler(`messages/${idioma}.json`)) as {
    errors: { signatureUnavailable: string; planFeature: { signature: string } }
    portal: {
      signature: { saveError: string }
      quote: { responseError: string }
      nps: { saveError: string }
    }
  }

describe("a tela só oferece assinatura a quem tem o recurso", () => {
  it("consulta o recurso, COM await", () => {
    // O `await` é parte da asserção, e não zelo de estilo: sem ele
    // `podeAssinar` é uma Promise — sempre truthy —, o cartão volta a aparecer
    // para toda empresa Starter, e nada mais pega isso. O tsc aceita
    // (ReactNode do React 19 admite Promise) e o ESLint do projeto não tem as
    // regras type-aware que reclamariam. Foi o buraco apontado na revisão do
    // plano desta correção, e é o mesmo que o precedente em
    // checklist-alcancavel.test.ts ainda tem.
    expect(TELA).toMatch(/podeAssinar\s*=\s*await temRecurso\(order\.tenant\.id, "signature"\)/)
  })

  it("e o cartão de assinatura depende disso", () => {
    // Regex ancorado no TÍTULO do cartão, e não um `not.toContain("{isDone &&")`
    // solto: o cartão do NPS, vinte linhas abaixo, tem exatamente a mesma
    // condição e não deve mudar — uma asserção literal ficaria vermelha contra
    // o código certo.
    expect(TELA).not.toMatch(/\{isDone && \(\r?\n[\s\S]{0,200}serviceOrder\.signatureTitle/)
    expect(TELA).toMatch(
      /\{isDone && \(podeAssinar \|\| order\.clientSignatureUrl\) && \(\r?\n[\s\S]{0,200}serviceOrder\.signatureTitle/
    )
  })

  it("mas quem JÁ assinou continua vendo a própria confirmação", () => {
    // Rebaixar o plano não pode apagar, da vista do cliente, o registro de que
    // ele confirmou o serviço. Mesmo cuidado do checklist.
    expect(TELA).toContain("order.clientSignatureUrl")
  })

  it("e a trava do portal em si continua lá", () => {
    // Somar as duas, e não trocar uma pela outra.
    expect(TELA).toContain('temFuncao(order.tenant.id, "portalCliente")')
  })
})

describe("a rota se defende sozinha, e escolhe com quem fala", () => {
  it("continua barrando por recurso — esconder o botão não é proteção", () => {
    expect(ROTA).toContain('temRecurso(order.tenantId, "signature")')
  })

  it("e a cobrança de upgrade NÃO vai para o cliente final", () => {
    // A mesma expressão tem de conter as duas mensagens e o que distingue os
    // ramos: trocar a mensagem dos DOIS perderia o upsell para o staff, que é
    // exatamente quem contrata o plano.
    const bloco = ROTA.match(/if \(!\(await temRecurso\(order\.tenantId, "signature"\)\)\)[\s\S]{0,500}?\n {4}\}/)
    expect(bloco, "o bloco do 403 por recurso sumiu").toBeTruthy()
    expect(bloco![0]).toContain("signatureUnavailable")
    expect(bloco![0]).toContain("planFeature.signature")
    expect(bloco![0]).toMatch(/clientToken|paraOCliente/)
  })
})

describe("o pad público não ecoa o servidor", () => {
  it("mostra mensagem própria, como os outros dois widgets do portal", () => {
    // Só CÓDIGO: o comentário que explica o defeito cita `setError(data.error)`
    // de propósito, e um `not.toContain` cru sobre o arquivo inteiro ficaria
    // vermelho contra a correção — foi o que aconteceu na primeira escrita.
    const codigo = PAD.split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n")
    expect(codigo).not.toContain("setError(data.error)")
    expect(codigo).toContain("signature.saveError")
  })

  it("e os outros dois continuam sem ecoar", () => {
    // Para "uniformizar" nunca ser no sentido errado.
    expect(ler("src/components/portal/quote-approval-buttons.tsx")).toContain("quote.responseError")
    expect(ler("src/components/portal/nps-widget.tsx")).toContain("nps.saveError")
  })
})

describe("os textos que o cliente final lê", () => {
  // A regra de ouro: as duas fontes, lidas juntas. O texto de venda é uma; o
  // que a rota pública devolve é outra.
  const FALA_DE_PLANO = /plano|Pro\b|upgrade|Configuraç|plan\b|Settings|Upgrade/i

  it.each(["pt", "en"] as const)("existem nos dois idiomas — %s", (idioma) => {
    const m = mensagens(idioma)
    expect(typeof m.errors.signatureUnavailable).toBe("string")
    expect(typeof m.portal.signature.saveError).toBe("string")
  })

  it.each(["pt", "en"] as const)("e nenhum deles fala de plano — %s", (idioma) => {
    const m = mensagens(idioma)
    // Âncora: o regex PRECISA casar com a mensagem interna, senão ele pode
    // estar quebrado e este teste passaria vazio.
    expect(m.errors.planFeature.signature, "o regex não está pegando nada").toMatch(FALA_DE_PLANO)

    expect(m.errors.signatureUnavailable).not.toMatch(FALA_DE_PLANO)
    expect(m.portal.signature.saveError).not.toMatch(FALA_DE_PLANO)
    expect(m.portal.quote.responseError).not.toMatch(FALA_DE_PLANO)
    expect(m.portal.nps.saveError).not.toMatch(FALA_DE_PLANO)
  })
})
