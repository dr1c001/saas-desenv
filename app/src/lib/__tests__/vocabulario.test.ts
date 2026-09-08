import { describe, expect, it } from "vitest"
import {
  aplicarEmTexto,
  aplicarNasMensagens,
  lerVocabulario,
  normalizarTermo,
  tabelaDeTrocas,
  validarTermo,
  VOCABULARIO_PADRAO,
  type Vocabulario,
} from "@/lib/vocabulario"

const CHAMADO: Vocabulario = {
  os: { curto: "Chamado", singular: "chamado", plural: "chamados", genero: "m" },
  tec: { curto: "Consultor", singular: "consultor", plural: "consultores", genero: "m" },
}

const VISITA: Vocabulario = {
  os: { curto: "Visita", singular: "visita", plural: "visitas", genero: "f" },
  tec: { curto: "Equipe", singular: "equipe", plural: "equipes", genero: "f" },
}

const tab = (v: Vocabulario) => tabelaDeTrocas(v)

describe("tabela de trocas", () => {
  it("monta singular, plural, curto e artigo", () => {
    const t = tab(CHAMADO)
    expect(t.os).toBe("chamado")
    expect(t.Os).toBe("Chamado")
    expect(t.osP).toBe("chamados")
    expect(t.OsP).toBe("Chamados")
    expect(t.osC).toBe("Chamado")
    expect(t.osArt).toBe("o")
    expect(t.osArtP).toBe("os")
  })

  it("concorda o artigo com o gênero", () => {
    // O ponto inteiro do módulo: "a ordem de serviço" mas "o chamado".
    expect(tab(CHAMADO).osArt).toBe("o")
    expect(tab(VISITA).osArt).toBe("a")
    expect(tab(VOCABULARIO_PADRAO.pt).osArt).toBe("a")
  })

  it("capitaliza o artigo para começo de frase", () => {
    expect(tab(VISITA).OsArt).toBe("A")
    expect(tab(CHAMADO).OsArt).toBe("O")
    expect(tab(VISITA).OsArtP).toBe("As")
  })

  it("faz o mesmo para o termo de técnico, com prefixo próprio", () => {
    const t = tab(VISITA)
    expect(t.tec).toBe("equipe")
    expect(t.TecP).toBe("Equipes")
    expect(t.tecArt).toBe("a")
    // Prefixo evita marcador solto como [[ato]], que é palavra de verdade.
    expect(t.ato).toBeUndefined()
  })
})

describe("troca em texto", () => {
  it("substitui os marcadores", () => {
    expect(aplicarEmTexto("[[OsP]] em aberto", tab(CHAMADO))).toBe("Chamados em aberto")
  })

  it("concorda o adjetivo com o gênero", () => {
    const frase = "[[OsArt]] [[os]] foi concluíd[[osFim]]"
    expect(aplicarEmTexto(frase, tab(VISITA))).toBe("A visita foi concluída")
    expect(aplicarEmTexto(frase, tab(CHAMADO))).toBe("O chamado foi concluído")
  })

  it("concorda no plural", () => {
    const frase = "[[OsArtP]] [[osP]] concluíd[[osFimP]]"
    expect(aplicarEmTexto(frase, tab(VISITA))).toBe("As visitas concluídas")
    expect(aplicarEmTexto(frase, tab(CHAMADO))).toBe("Os chamados concluídos")
  })

  it("determinante irregular NÃO tem marcador — é escrito em forma neutra", () => {
    // "nenhum/nenhuma" não segue o padrão o/a: no masculino a desinência é
    // vazia, e "Nenhum[[osFim]]" produziria "Nenhumo". Estas frases são
    // reescritas em construção que não flexiona.
    const neutra = "Ainda não há [[osP]]"
    expect(aplicarEmTexto(neutra, tab(VISITA))).toBe("Ainda não há visitas")
    expect(aplicarEmTexto(neutra, tab(CHAMADO))).toBe("Ainda não há chamados")
  })

  it("NÃO toca em texto sem marcador", () => {
    // O motivo de existir marcador explícito: substituição cega estragaria a
    // política de privacidade, onde "os dados" é artigo, não a sigla.
    const legal = "Utilizamos os dados coletados para as seguintes finalidades:"
    expect(aplicarEmTexto(legal, tab(CHAMADO))).toBe(legal)
  })

  it("preserva a sintaxe de plural do ICU em volta", () => {
    const icu = "{count, plural, one {# [[os]]} other {# [[osP]]}}"
    expect(aplicarEmTexto(icu, tab(CHAMADO))).toBe(
      "{count, plural, one {# chamado} other {# chamados}}"
    )
  })

  it("deixa marcador desconhecido visível em vez de apagar", () => {
    // Erro de digitação nosso tem que aparecer, não sumir calado.
    expect(aplicarEmTexto("[[osTypo]] aqui", tab(CHAMADO))).toBe("[[osTypo]] aqui")
  })
})

describe("troca na árvore de mensagens", () => {
  it("percorre objetos, listas e textos", () => {
    const msgs = {
      nav: { orders: "[[OsP]]" },
      list: { empty: "Nenhum[[osArt]] [[os]]", items: ["[[Os]] A", "[[Os]] B"] },
      naoTexto: 42,
    }
    expect(aplicarNasMensagens(msgs, tab(VISITA))).toEqual({
      nav: { orders: "Visitas" },
      list: { empty: "Nenhuma visita", items: ["Visita A", "Visita B"] },
      naoTexto: 42,
    })
  })
})

describe("leitura do que está gravado", () => {
  it("devolve o padrão quando não há nada", () => {
    expect(lerVocabulario(null, "pt")).toEqual(VOCABULARIO_PADRAO.pt)
    expect(lerVocabulario(undefined, "pt").os.curto).toBe("OS")
  })

  it("aguenta Json malformado sem derrubar o sistema", () => {
    // Isto roda no caminho de TODA página: no pior caso a empresa vê o
    // vocabulário padrão, nunca uma tela de erro.
    expect(lerVocabulario("texto solto", "pt")).toEqual(VOCABULARIO_PADRAO.pt)
    expect(lerVocabulario(["a"], "pt")).toEqual(VOCABULARIO_PADRAO.pt)
    expect(lerVocabulario({ os: { curto: "X" } }, "pt")).toEqual(VOCABULARIO_PADRAO.pt)
    expect(lerVocabulario({ os: { curto: "X", singular: "x", plural: "xs", genero: "z" } }, "pt"))
      .toEqual(VOCABULARIO_PADRAO.pt)
  })

  it("aceita um termo customizado e mantém o outro no padrão", () => {
    const lido = lerVocabulario({ os: CHAMADO.os }, "pt")
    expect(lido.os.curto).toBe("Chamado")
    expect(lido.tec).toEqual(VOCABULARIO_PADRAO.pt.tec)
  })

  it("tem padrão para os dois idiomas", () => {
    expect(lerVocabulario(null, "en").os.singular).toBe("service order")
  })
})

describe("validação do que a empresa digita", () => {
  const ok = { curto: "Chamado", singular: "chamado", plural: "chamados", genero: "m" }

  it("aceita entrada comum", () => {
    expect(validarTermo(ok)).toBeNull()
  })

  it("recusa termo curto ou longo demais", () => {
    expect(validarTermo({ ...ok, curto: "C" })).toBe("termoCurto")
    expect(validarTermo({ ...ok, plural: "x".repeat(31) })).toBe("termoLongo")
  })

  it("recusa gênero fora de f/m", () => {
    expect(validarTermo({ ...ok, genero: "n" })).toBe("generoInvalido")
  })

  it("normaliza singular e plural para minúsculo", () => {
    // Eles aparecem no meio de frase ("Nenhuma Visita encontrada" ficaria
    // errado); o marcador maiúsculo cuida do começo de frase.
    const t = normalizarTermo({ curto: " Visita ", singular: " Visita ", plural: "VISITAS", genero: "f" })
    expect(t).toEqual({ curto: "Visita", singular: "visita", plural: "visitas", genero: "f" })
  })
})

describe("marcadores nos arquivos de tradução", () => {
  const FORA_DO_VOCABULARIO = ["landing", "terms", "privacy", "legal", "planFeatures"]

  async function textos(idioma: string) {
    const { readFile } = await import("node:fs/promises")
    const msgs = JSON.parse(await readFile(`messages/${idioma}.json`, "utf8"))
    const saida: { caminho: string; texto: string }[] = []
    const anda = (o: unknown, p: string) => {
      if (typeof o === "string") saida.push({ caminho: p, texto: o })
      else if (Array.isArray(o)) o.forEach((v, i) => anda(v, `${p}[${i}]`))
      else if (o && typeof o === "object")
        for (const [k, v] of Object.entries(o)) anda(v, p ? `${p}.${k}` : k)
    }
    anda(msgs, "")
    return saida
  }

  for (const idioma of ["pt", "en"]) {
    it(`${idioma}: todo marcador usado existe na tabela`, async () => {
      // Marcador com erro de digitação não quebra build nem tipo: aparece cru
      // ("[[osFimm]]") na tela do cliente.
      const conhecidos = new Set(Object.keys(tabelaDeTrocas(VOCABULARIO_PADRAO.pt)))
      const desconhecidos: string[] = []

      for (const { caminho, texto } of await textos(idioma)) {
        for (const m of texto.matchAll(/\[\[([A-Za-z]+)\]\]/g)) {
          if (!conhecidos.has(m[1])) desconhecidos.push(`${caminho}: [[${m[1]}]]`)
        }
      }

      expect(desconhecidos, `marcador inexistente: ${desconhecidos.join(", ")}`).toEqual([])
    })

    it(`${idioma}: textos legais e da landing não têm marcador`, async () => {
      // A landing e os documentos jurídicos falam com quem ainda não é cliente
      // e não pertencem a nenhuma empresa — não podem mudar de vocabulário.
      const invasores = (await textos(idioma))
        .filter((t) => FORA_DO_VOCABULARIO.includes(t.caminho.split(".")[0]))
        .filter((t) => t.texto.includes("[["))
        .map((t) => t.caminho)

      expect(invasores, `marcador em área proibida: ${invasores.join(", ")}`).toEqual([])
    })

    it(`${idioma}: nada sobra cru depois da substituição`, async () => {
      // A prova final: aplicar a tabela e conferir texto por texto. Checar o
      // JSON inteiro com stringify não serve — "[[" aparece sozinho sempre que
      // uma lista tem outra lista dentro, e o teste acusaria falha onde não há.
      const { readFile } = await import("node:fs/promises")
      const msgs = JSON.parse(await readFile(`messages/${idioma}.json`, "utf8"))
      const aplicado = aplicarNasMensagens(msgs, tabelaDeTrocas(idioma === "pt" ? CHAMADO : VISITA))

      const sobrou: string[] = []
      const anda = (o: unknown, p: string) => {
        if (typeof o === "string") {
          if (o.includes("[[")) sobrou.push(`${p}: ${o}`)
        } else if (Array.isArray(o)) o.forEach((v, i) => anda(v, `${p}[${i}]`))
        else if (o && typeof o === "object")
          for (const [k, v] of Object.entries(o)) anda(v, p ? `${p}.${k}` : k)
      }
      anda(aplicado, "")

      expect(sobrou, `marcador não substituído: ${sobrou.join(" | ")}`).toEqual([])
    })
  }
})
