import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEGRAUS_DA_REGUA, tomDoDegrau } from "@/lib/regua-cobranca"

// Toda chave que a régua usa existe nos DOIS idiomas?
//
// Com next-intl, chave faltando não é texto em branco: é exceção na hora de
// renderizar. Uma chave esquecida no `en.json` derruba a tela de Configurações
// inteira — e só para o cliente em inglês, que é justamente quem ninguém testa
// antes de subir.
//
// A lista de TONS não é escrita à mão aqui de propósito: sai da própria escada.
// Se a régua ganhar um degrau com um tom novo, este teste passa a exigir a
// mensagem e o assunto nos dois idiomas, em vez de o cliente descobrir que a
// cobrança saiu com o texto errado.

const IDIOMAS = ["pt", "en"] as const

function mensagens(idioma: (typeof IDIOMAS)[number]) {
  return JSON.parse(readFileSync(join(process.cwd(), `messages/${idioma}.json`), "utf8"))
}

/** Busca "a.b.c" dentro do objeto. `undefined` quando falta. */
function chave(obj: unknown, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, parte) => {
    if (atual && typeof atual === "object") return (atual as Record<string, unknown>)[parte]
    return undefined
  }, obj)
}

/** Exatamente as chaves que regua-cobranca-form.tsx pede. */
const DA_TELA = [
  "title",
  "subtitle",
  "master",
  "masterHint",
  "whenTitle",
  "when.lembrarAntes",
  "when.lembrarAntesHint",
  "when.cobrarDepois",
  "when.cobrarDepoisHint",
  "howTitle",
  "how.whatsapp",
  "how.whatsappHint",
  "how.whatsappMissing",
  "how.email",
  "how.emailHint",
  "minimoTitle",
  "minimoHint",
  "consent",
  "save",
  "saved",
  "errors.semPermissao",
]

/** Os tons que a escada REALMENTE produz — derivados, não escritos à mão. */
const TONS = [...new Set(DEGRAUS_DA_REGUA.map(tomDoDegrau))]

describe("a tela de configuração da régua", () => {
  it.each(IDIOMAS)("tem todas as chaves em %s", (idioma) => {
    const m = mensagens(idioma)
    const faltando = DA_TELA.filter((c) => typeof chave(m.reguaCobrancaConfig, c) !== "string")
    expect(faltando).toEqual([])
  })
})

describe("as mensagens da cobrança", () => {
  it.each(IDIOMAS)("todo tom da escada tem texto e assunto em %s", (idioma) => {
    const ns = mensagens(idioma).whatsapp?.reguaCobranca
    const faltando: string[] = []
    for (const tom of TONS) {
      if (typeof chave(ns, tom) !== "string") faltando.push(tom)
      if (typeof chave(ns, `assunto.${tom}`) !== "string") faltando.push(`assunto.${tom}`)
    }
    expect(faltando).toEqual([])
  })

  it.each(IDIOMAS)("o aviso de 'desconsidere se já pagou' existe em %s", (idioma) => {
    // Ele vai em TODAS as mensagens, inclusive nos lembretes. Baixa de
    // pagamento atrasa: o cliente paga na sexta, a empresa dá baixa na
    // segunda, e o cron rodou no sábado. Sem esta linha, a mensagem acusa de
    // caloteiro quem pagou em dia.
    const ns = mensagens(idioma).whatsapp?.reguaCobranca
    expect(typeof chave(ns, "desconsidere")).toBe("string")
    expect(typeof chave(ns, "detalhes")).toBe("string")
  })

  it.each(IDIOMAS)("toda mensagem usa as variáveis que o código passa em %s", (idioma) => {
    // `textoDaCobranca` passa empresa, descricao, valor e vencimento. Uma
    // mensagem que esqueça {valor} vira uma cobrança sem dizer quanto.
    const ns = mensagens(idioma).whatsapp?.reguaCobranca
    for (const tom of TONS) {
      const texto = chave(ns, tom) as string
      for (const v of ["{empresa}", "{descricao}", "{valor}", "{vencimento}"]) {
        expect(texto, `${idioma}/${tom} sem ${v}`).toContain(v)
      }
    }
  })

  it.each(IDIOMAS)("nenhuma mensagem usa variável que o código não passa em %s", (idioma) => {
    // O outro lado: `{dias}` numa mensagem faria o next-intl lançar por falta
    // do valor — e a cobrança simplesmente não sairia, em silêncio.
    const conhecidas = new Set(["empresa", "descricao", "valor", "vencimento"])
    const ns = mensagens(idioma).whatsapp?.reguaCobranca
    for (const tom of TONS) {
      const usadas = [...((chave(ns, tom) as string).matchAll(/\{(\w+)\}/g))].map((m) => m[1])
      const estranhas = usadas.filter((v) => !conhecidas.has(v))
      expect(estranhas, `${idioma}/${tom}`).toEqual([])
    }
    for (const tom of TONS) {
      const usadas = [
        ...((chave(ns, `assunto.${tom}`) as string).matchAll(/\{(\w+)\}/g)),
      ].map((m) => m[1])
      // O assunto recebe só {empresa}.
      expect(usadas.filter((v) => v !== "empresa"), `${idioma}/assunto.${tom}`).toEqual([])
    }
  })
})
