import { describe, expect, it } from "vitest"
import { avaliarDmarc, DOMINIO_DE_EMAIL, NOME_DMARC } from "@/lib/dmarc"
import { conferirDmarc } from "@/lib/conferir-dmarc"

// `_dmarc.servicoos.com.br` nunca foi publicado, e nada no sistema olhava.
//
// Todo e-mail sai como noreply@servicoos.com.br — inclusive cobrança em nome
// das empresas clientes. Sem política, um remetente forjado com o nosso
// domínio chega à caixa do cliente final sem instrução para o Gmail rejeitar,
// e ninguém recebe relatório. A Resend devolve sucesso porque ELA aceitou, e
// a ausência passou por duas migrações de DNS sem ninguém ver.
//
// A correção de verdade é o TXT no registro.br. Estes testes cobrem o vigia:
// a regra que lê o que está publicado, o mapeamento dos erros de DNS, e a
// amarração entre o domínio conferido e o domínio do remetente.
// (Achado na auditoria de 13/09/2026.)

const erroDns = (code: string) => Object.assign(new Error(code), { code })

describe("a regra", () => {
  it("sem registro: AUSENTE, e precisa de ação", () => {
    expect(avaliarDmarc(null)).toMatchObject({ estado: "ausente", precisaDeAcao: true })
    expect(avaliarDmarc([])).toMatchObject({ estado: "ausente", precisaDeAcao: true })
    // TXT que existe mas não é DMARC (um SPF perdido no nome errado) também é ausente.
    expect(avaliarDmarc(["v=spf1 include:amazonses.com ~all"])).toMatchObject({ estado: "ausente" })
  })

  it("p=none só observa — conta como FRACA", () => {
    const v = avaliarDmarc(["v=DMARC1; p=none; rua=mailto:dmarc@servicoos.com.br"])
    expect(v).toMatchObject({ estado: "fraca", precisaDeAcao: true })
    expect(v.motivo).toContain("p=none")
  })

  it("quarantine com relatório: OK", () => {
    expect(avaliarDmarc(["v=DMARC1; p=quarantine; rua=mailto:dmarc@servicoos.com.br"])).toEqual({
      estado: "ok",
      precisaDeAcao: false,
      motivo: "p=quarantine",
    })
  })

  it("reject também é OK", () => {
    expect(avaliarDmarc(["v=DMARC1; p=reject; rua=mailto:x@servicoos.com.br"]).estado).toBe("ok")
  })

  it("sem rua= ninguém recebe relatório — FRACA", () => {
    expect(avaliarDmarc(["v=DMARC1; p=quarantine"])).toMatchObject({ estado: "fraca" })
  })

  it("pct abaixo de 100 deixa passar parte do tráfego forjado — FRACA", () => {
    expect(avaliarDmarc(["v=DMARC1; p=reject; pct=50; rua=mailto:x@s.com"])).toMatchObject({ estado: "fraca" })
    // pct=100 explícito é igual a omitir.
    expect(avaliarDmarc(["v=DMARC1; p=reject; pct=100; rua=mailto:x@s.com"]).estado).toBe("ok")
  })

  it("dois registros DMARC: os provedores ignoram todos — FRACA", () => {
    expect(
      avaliarDmarc(["v=DMARC1; p=reject; rua=mailto:a@s.com", "v=DMARC1; p=none"])
    ).toMatchObject({ estado: "fraca" })
  })

  it("tags em qualquer caixa e com espaços", () => {
    expect(avaliarDmarc(["V=DMARC1 ; P=Quarantine ; RUA=mailto:x@s.com ;"]).estado).toBe("ok")
  })
})

describe("o lado do DNS", () => {
  it("nome inexistente (NXDOMAIN) é AUSENTE — o achado", async () => {
    const v = await conferirDmarc(async () => {
      throw erroDns("ENOTFOUND")
    })
    expect(v).toMatchObject({ estado: "ausente", precisaDeAcao: true })
  })

  it("nome sem TXT (ENODATA) também é AUSENTE", async () => {
    const v = await conferirDmarc(async () => {
      throw erroDns("ENODATA")
    })
    expect(v.estado).toBe("ausente")
  })

  it("DNS que não respondeu é INDISPONÍVEL e NÃO conta como erro", async () => {
    // Um soluço de rede não pode acordar o fundador à toa; amanhã confere de novo.
    const v = await conferirDmarc(async () => {
      throw erroDns("ETIMEOUT")
    })
    expect(v).toMatchObject({ estado: "indisponivel", precisaDeAcao: false })
  })

  it("junta os pedaços de 255 bytes de um TXT antes de avaliar", async () => {
    const v = await conferirDmarc(async () => [["v=DMARC1; p=quarantine; ", "rua=mailto:dmarc@servicoos.com.br"]])
    expect(v.estado).toBe("ok")
  })

  it("resolve o nome certo", async () => {
    let pedido = ""
    await conferirDmarc(async (nome) => {
      pedido = nome
      return [["v=DMARC1; p=reject; rua=mailto:x@s.com"]]
    })
    expect(pedido).toBe(NOME_DMARC)
    expect(NOME_DMARC).toBe(`_dmarc.${DOMINIO_DE_EMAIL}`)
  })
})

describe("o vigia e o remetente falam do mesmo domínio", () => {
  // Estrutural: se o remetente mudar de domínio e o vigia continuar olhando o
  // antigo, o cron diria "ok" para um domínio que já não manda nada.
  const ler = (p: string) => import("node:fs/promises").then((fs) => fs.readFile(p, "utf-8"))

  it("lib/resend.ts monta o FROM a partir de DOMINIO_DE_EMAIL", async () => {
    const fonte = await ler("src/lib/resend.ts")
    expect(fonte).toContain("noreply@${DOMINIO_DE_EMAIL}")
    // Nenhuma STRING de código com o domínio escrito à mão (comentário pode).
    expect(fonte).not.toMatch(/["`']ServiçoOS <noreply@servicoos\.com\.br>["`']/)
  })

  it("o cron confere todo dia, conta como erro quando precisa de ação, e grava o estado", async () => {
    const fonte = await ler("src/app/api/cron/daily/route.ts")
    expect(fonte).toContain("await conferirDmarc()")
    // A política ausente é PENDÊNCIA, e não erro do cron — ver pendencia.test.ts,
    // que é quem trava isso. Esta linha afirmava o contrário até 22/09/2026, e
    // passava por acidente: o `[\s\S]*?` atravessava até o `results.errors++`
    // do catch, então ela teria continuado verde com o defeito corrigido OU no
    // lugar. Asserção que passa nos dois casos não protege nada.
    expect(fonte).toContain("avisarPendenciaUmaVez({")
    expect(fonte).toContain("`dmarc ${results.dmarc}`")
  })

  it("lib/dmarc.ts continua puro — sem node:dns", async () => {
    // lib/resend.ts importa daqui; `node:dns` no import quebraria quem
    // empacota resend.ts para o cliente.
    const fonte = await ler("src/lib/dmarc.ts")
    expect(fonte).not.toMatch(/from "node:dns"/)
    expect(fonte).not.toMatch(/from "@\/lib\/prisma"/)
  })
})
