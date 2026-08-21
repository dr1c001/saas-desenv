import { describe, expect, it } from "vitest"
import { getTranslator } from "@/lib/i18n"
import { mensagensComVocabulario } from "@/lib/mensagens"
import ptMessages from "../../../messages/pt.json"

// O defeito que estes testes travam: até 20/08/2026 existiam DOIS caminhos de
// tradução e só um trocava os marcadores de vocabulário. O que NÃO trocava era
// justamente o de e-mail, WhatsApp e PDF — as coisas que saem do sistema e
// chegam ao cliente final da empresa. Onze textos passavam por lá crus.

/** Todo texto do JSON que contém marcador, para varrer o arquivo inteiro em
 *  vez de conferir um punhado escolhido a dedo. */
function textosComMarcador(no: unknown, caminho = ""): { caminho: string; texto: string }[] {
  if (typeof no === "string") {
    return /\[\[[A-Za-z]/.test(no) ? [{ caminho, texto: no }] : []
  }
  if (Array.isArray(no)) {
    return no.flatMap((v, i) => textosComMarcador(v, `${caminho}[${i}]`))
  }
  if (no && typeof no === "object") {
    return Object.entries(no).flatMap(([k, v]) =>
      textosComMarcador(v, caminho ? `${caminho}.${k}` : k)
    )
  }
  return []
}

describe("os marcadores nunca escapam", () => {
  it("o arquivo de mensagens TEM marcadores — senão este teste não prova nada", () => {
    expect(textosComMarcador(ptMessages).length).toBeGreaterThan(0)
  })

  it("nenhum texto sai com marcador cru, em nenhum idioma", () => {
    for (const locale of ["pt", "en"] as const) {
      const aplicadas = mensagensComVocabulario(locale, null)
      const vazando = textosComMarcador(aplicadas).map((t) => t.caminho)
      expect(vazando, `${locale} deixou marcador cru`).toEqual([])
    }
  })
})

describe("getTranslator — o caminho de e-mail, WhatsApp e PDF", () => {
  it("resolve o marcador em vez de imprimir ele", () => {
    // O caso real: o cliente final da empresa recebia "[[osC]] #1234" no
    // e-mail e no recibo.
    const t = getTranslator("pt", "pdf")
    const texto = t("receipt.linkedOrderLabel")
    expect(texto).not.toContain("[[")
    expect(texto).toContain("OS")
  })

  it("varre TODOS os namespaces que o getTranslator serve", () => {
    // Escrito assim de propósito: um namespace novo com marcador entra na
    // varredura sozinho, em vez de esperar alguém lembrar de adicioná-lo.
    const comMarcador = textosComMarcador(ptMessages)
    const namespaces = [...new Set(comMarcador.map((t) => t.caminho.split(".")[0]))]
    expect(namespaces.length).toBeGreaterThan(0)

    for (const ns of namespaces) {
      const aplicadas = mensagensComVocabulario("pt", null) as Record<string, unknown>
      const sobrou = textosComMarcador(aplicadas[ns], ns)
      expect(sobrou.map((s) => s.caminho), `namespace ${ns}`).toEqual([])
    }
  })

  it("usa a palavra que a EMPRESA escolheu quando o vocabulário é passado", () => {
    const custom = { os: { singular: "chamado", plural: "chamados", curto: "CH", genero: "m" } }
    const t = getTranslator("pt", "pdf", custom)
    expect(t("receipt.linkedOrderLabel")).toContain("CH")
  })

  it("sem vocabulário, cai no padrão — e não no marcador", () => {
    // A escolha de desenho: errar para "texto padrão" é invisível; errar para
    // "marcador cru" é constrangedor na frente do cliente de outra empresa.
    const t = getTranslator("pt", "pdf")
    expect(t("receipt.linkedOrderLabel")).not.toContain("[[")
  })
})

describe("cache", () => {
  it("devolve a MESMA referência para o mesmo vocabulário", () => {
    // Se recalculasse, seriam ~1400 textos percorridos por e-mail enviado.
    expect(mensagensComVocabulario("pt", null)).toBe(mensagensComVocabulario("pt", null))
  })

  it("vocabulários diferentes não se misturam", () => {
    const a = mensagensComVocabulario("pt", null)
    const b = mensagensComVocabulario("pt", {
      os: { singular: "chamado", plural: "chamados", curto: "CH", genero: "m" },
    })
    expect(a).not.toBe(b)
  })
})
