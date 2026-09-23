import { describe, expect, it } from "vitest"
import { chegouAHora, decidirTroca, direcaoDaTroca } from "@/lib/troca-de-plano"

// A regra da troca de plano — a que decide DINHEIRO recorrente.
//
// O manual prometia a troca no verbete 3.5 desde sempre. A Action recusava
// qualquer assinatura nova enquanto existisse uma em andamento, com o
// comentário dizendo "troca de plano não é suportada ainda, precisa cancelar
// antes"; a tela, enquanto isso, mostrava *Assinar* em todos os planos e o
// cliente recebia erro ao clicar. E o caminho que o erro mandava tomar era
// destrutivo: cancelar e reassinar grava PENDING no tenant, e PENDING joga a
// equipe inteira em /expired até o pagamento novo ser confirmado.
// (Achado na auditoria de 13/09/2026.)

const STARTER = { id: "s", priceMonthly: 97, priceYearly: 970 }
const PRO = { id: "p", priceMonthly: 197, priceYearly: 1970 }

const pedido = (
  atual: typeof STARTER,
  novo: typeof STARTER,
  ciclo: "MONTHLY" | "YEARLY" = "MONTHLY",
  combinado: number | null = null
) => ({ atual, novo, ciclo, combinado })

describe("para onde a troca vai", () => {
  it("mais caro é SUBIR, mais barato é DESCER", () => {
    expect(direcaoDaTroca(pedido(STARTER, PRO))).toBe("subir")
    expect(direcaoDaTroca(pedido(PRO, STARTER))).toBe("descer")
  })

  it("o mesmo plano não é troca nenhuma", () => {
    expect(direcaoDaTroca(pedido(PRO, PRO))).toBe("mesmo")
  })

  it("no ANUAL compara o preço anual", () => {
    expect(direcaoDaTroca(pedido(STARTER, PRO, "YEARLY"))).toBe("subir")
  })

  it("com mensalidade COMBINADA, os dois lados usam o combinado — e aí não há troca de preço", () => {
    // O combinado substitui a tabela nos dois planos (lib/preco.ts), então
    // trocar de plano não muda o que a empresa paga. Isso é real: quem
    // negociou um valor negociou o valor, não o plano.
    expect(direcaoDaTroca(pedido(STARTER, PRO, "MONTHLY", 120))).toBe("mesmo")
  })
})

describe("pode trocar?", () => {
  it("com a assinatura ATIVA, sim", () => {
    const d = decidirTroca(pedido(STARTER, PRO), "ACTIVE")
    expect(d.ok).toBe(true)
  })

  it.each(["PENDING", "PAST_DUE", "CANCELLED", "TRIAL"])(
    "com a assinatura em %s, não",
    (status) => {
      const d = decidirTroca(pedido(STARTER, PRO), status)
      expect(d).toEqual({ ok: false, motivo: "assinaturaNaoAtiva" })
    }
  )

  it("para o MESMO plano, não", () => {
    expect(decidirTroca(pedido(PRO, PRO), "ACTIVE")).toEqual({ ok: false, motivo: "mesmoPlano" })
  })
})

describe("o que acontece quando troca", () => {
  it("SUBIR vale AGORA — o período já pago não é recobrado", () => {
    const d = decidirTroca(pedido(STARTER, PRO), "ACTIVE")
    expect(d).toMatchObject({ ok: true, direcao: "subir", valeApartirDe: "agora", valorNovo: 197 })
  })

  it("DESCER espera o fim do período pago — o contrato garante o que foi pago", () => {
    const d = decidirTroca(pedido(PRO, STARTER), "ACTIVE")
    expect(d).toMatchObject({
      ok: true,
      direcao: "descer",
      valeApartirDe: "fimDoPeriodo",
      valorNovo: 97,
    })
  })

  it("o valor novo é o do CICLO da assinatura, não o mensal sempre", () => {
    const d = decidirTroca(pedido(STARTER, PRO, "YEARLY"), "ACTIVE")
    expect(d).toMatchObject({ valorNovo: 1970 })
  })
})

describe("quando o agendamento vence", () => {
  const fim = new Date("2026-10-01T12:00:00Z")

  it("no fim do período, sim", () => {
    expect(chegouAHora({ pendingPlanId: "s", currentPeriodEnd: fim }, fim)).toBe(true)
    expect(
      chegouAHora({ pendingPlanId: "s", currentPeriodEnd: fim }, new Date("2026-10-02T12:00:00Z"))
    ).toBe(true)
  })

  it("antes, não — é o período que o cliente pagou", () => {
    expect(
      chegouAHora({ pendingPlanId: "s", currentPeriodEnd: fim }, new Date("2026-09-30T12:00:00Z"))
    ).toBe(false)
  })

  it("sem agendamento, nunca", () => {
    expect(chegouAHora({ pendingPlanId: null, currentPeriodEnd: fim }, fim)).toBe(false)
  })
})
