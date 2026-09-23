import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { EMAIL_DE_SUPORTE, linkDeContatoSuporte } from "@/lib/utils"

// Quatro arestas das páginas públicas, todas pequenas e todas na hora errada.
//
//   1. o bloco de Adicionais dizia "a contratação é feita com a nossa equipe" e
//      não dava UM link para falar com essa equipe quando SUPPORT_WHATSAPP não
//      estava configurada — nem botão, nem e-mail;
//   2. só dois erros do Supabase eram traduzidos no cadastro; todo o resto caía
//      na tela em inglês, no momento exato da conversão — e o login tinha o
//      mesmo defeito, duas portas ao lado;
//   3. um comentário no arquivo mais visível do produto afirmava que o sistema
//      não tem teste grátis, com o botão que vende 15 dias logo acima;
//   4. código e chaves mortas: `precoDoAdicional`, `landing.pricing.plans` e
//      `auth.register.subtitle`.
//
// (Achado na auditoria de 13/09/2026, grupo 9.)

const RAIZ = process.cwd()
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8")

/** A fonte SEM comentário — a explicação de cada defeito cita o defeito. */
const codigoDe = (p: string) =>
  ler(p)
    .split("\n")
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
    })
    .join("\n")

const mensagens = (idioma: "pt" | "en") =>
  JSON.parse(ler(`messages/${idioma}.json`)) as Record<string, never>

describe("quem quer contratar sempre tem por onde falar", () => {
  it("sem WhatsApp configurado, cai no e-mail", () => {
    expect(linkDeContatoSuporte(undefined, "oi")).toBe(`mailto:${EMAIL_DE_SUPORTE}`)
    expect(linkDeContatoSuporte("", "oi")).toBe(`mailto:${EMAIL_DE_SUPORTE}`)
    // Valor inválido também: um número que não vira link é o mesmo que nada.
    expect(linkDeContatoSuporte("não é telefone", "oi")).toBe(`mailto:${EMAIL_DE_SUPORTE}`)
  })

  it("com WhatsApp configurado, usa o WhatsApp", () => {
    // Âncora: se a função devolvesse sempre o e-mail, os testes acima passariam
    // sem cobrir nada.
    expect(linkDeContatoSuporte("(19) 99280-2772", "oi")).toContain("wa.me/")
  })

  it("e o botão do bloco de Adicionais não fica mais atrás de um `&&`", () => {
    const fonte = codigoDe("src/components/shared/adicionais.tsx")
    expect(fonte).not.toContain("{linkContato && (")
    expect(fonte).toContain("linkContato: string")
    expect(fonte).not.toContain("linkContato: string | null")
  })

  it("as duas telas que anunciam adicionais passam o contato que sempre existe", () => {
    for (const p of ["src/app/page.tsx", "src/app/(dashboard)/billing/page.tsx"]) {
      expect(codigoDe(p), p).toContain("linkDeContatoSuporte(")
    }
  })

  it("e o endereço de e-mail tem UM dono", () => {
    // Estava escrito à mão na landing e em outros seis lugares do app.
    expect(codigoDe("src/app/page.tsx")).not.toContain(`mailto:${EMAIL_DE_SUPORTE}`)
  })
})

describe("erro do Supabase não chega cru na tela", () => {
  it.each(["register", "login"] as const)("em /%s", (tela) => {
    const fonte = codigoDe(`src/app/(auth)/${tela}/page.tsx`)
    // O ramo final jogava `error` — a frase do Supabase, em inglês — no DOM.
    expect(fonte).not.toContain("setServerError(error)")
    expect(fonte).toContain(`auth.${tela}.errors.desconhecido`)
    // E o texto cru continua existindo para diagnóstico: perder isso seria
    // trocar um defeito por outro.
    expect(fonte).toContain("console.error")
  })

  it.each(["pt", "en"] as const)("com texto nos dois idiomas — %s", (idioma) => {
    const m = mensagens(idioma) as unknown as {
      auth: { register: { errors: Record<string, string> }; login: { errors: Record<string, string> } }
    }
    expect(typeof m.auth.register.errors.desconhecido).toBe("string")
    expect(typeof m.auth.login.errors.desconhecido).toBe("string")
  })
})

describe("o que o código afirma sobre o produto é verdade", () => {
  it("nenhum comentário da landing diz que não há teste grátis", () => {
    // Não quebrava a tela: quebrava a próxima pessoa a mexer ali, que leria no
    // arquivo mais visível do produto um fato falso e decidiria em cima dele.
    const fonte = ler("src/app/page.tsx")
    expect(fonte).not.toMatch(/sistema n[ãa]o tem teste gr[áa]tis/i)
  })

  it("e o teste grátis existe mesmo — é o que o botão primário vende", () => {
    // Âncora do teste acima, e pelo código que decide, não pelo texto.
    const teste = ler("src/lib/teste-gratis.ts")
    expect(teste).toMatch(/export function fimDoTeste/)
  })
})

describe("código e chave mortos", () => {
  it("precoDoAdicional não existe mais", () => {
    // Exportada, testada e sem nenhum chamador em produção — e uma armadilha:
    // devolvia `null` tanto para "sob consulta" quanto para "não existe".
    expect(codigoDe("src/lib/adicionais.ts")).not.toContain("export function precoDoAdicional")
  })

  it.each(["pt", "en"] as const)("as chaves mortas saíram — %s", (idioma) => {
    const m = mensagens(idioma) as unknown as {
      landing: { pricing: Record<string, unknown> }
      auth: { register: Record<string, unknown> }
    }
    // Três objetos VAZIOS que nenhuma tela lia: quem fosse traduzir os planos
    // os encontraria e ou perderia tempo, ou preencheria texto que nunca sai.
    expect(m.landing.pricing.plans).toBeUndefined()
    // Repetia palavra por palavra o `subtitleDefault`, que é o que a página usa.
    expect(m.auth.register.subtitle).toBeUndefined()
  })

  it("e o subtítulo que a página USA continua lá", () => {
    // Âncora: apagar os dois seria tão errado quanto manter os dois.
    for (const idioma of ["pt", "en"] as const) {
      const m = mensagens(idioma) as unknown as {
        auth: { register: { subtitleDefault: string } }
      }
      expect(typeof m.auth.register.subtitleDefault, idioma).toBe("string")
    }
    expect(ler("src/app/(auth)/register/page.tsx")).toContain("subtitleDefault")
  })
})
