import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { VERSAO_PRIVACIDADE, VERSAO_TERMOS, dataPublicada } from "@/lib/versao-legal"

// O aceite dos Termos existia SÓ NO NAVEGADOR.
//
// O checkbox e a validação do zod eram 100% do cliente, e o valor era
// descartado no submit: `signUpUser` nunca recebeu o campo. Como Server Action
// é endereço HTTP próprio, um POST direto criava conta sem aceite nenhum — e
// nem havia onde mentir, porque não existia coluna em lugar nenhum do schema.
//
// Enquanto isso os próprios Termos afirmam, na seção 1, que "ao criar uma conta
// ou usar o sistema de qualquer forma, você concorda com estes Termos", e na
// seção 14 que "o uso continuado após a alteração implica concordância com os
// novos termos". A seção 14 não exige re-aceite: exige saber QUAL VERSÃO cada
// conta aceitou, para conseguir dizer "isto mudou em relação ao que você
// aceitou". Era inrespondível.
//
// (Achado na auditoria de 13/09/2026, grupo 9.)
//
// ─── Por que ESTRUTURAL ──────────────────────────────────────────────────────
//
// `signUpUser` fala com o Supabase Auth, que não está mockado no harness, e a
// tela é client component com react-hook-form. O que se trava aqui é o
// CONTRATO: o campo atravessa a rede, a Action recusa sem ele, a coluna existe,
// e a versão gravada é a versão publicada. Mesma convenção de
// manual-diz-a-verdade.test.ts, que também amarra texto a código.

const RAIZ = process.cwd()
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8")

const ACTION = ler("src/actions/auth.ts")
const TELA = ler("src/app/(auth)/register/page.tsx")
const SCHEMA = ler("prisma/schema.prisma")
const EXPORT = ler("src/actions/data-export.ts")

const mensagens = (idioma: "pt" | "en") =>
  JSON.parse(ler(`messages/${idioma}.json`)) as {
    legal: { terms: { lastUpdated: string }; privacy: { lastUpdated: string } }
    auth: { register: { errors: Record<string, string> } }
  }

describe("o aceite atravessa a rede", () => {
  it("a tela MANDA o campo, em vez de descartá-lo", () => {
    expect(TELA).toContain("termsAccepted: data.termsAccepted")
  })

  it("e a Action RECUSA quem não aceitou", () => {
    // O zod da tela é UX. Quem se defende é a Action, que é endereço HTTP
    // próprio: sem esta guarda, um POST direto cria conta sem aceite.
    expect(ACTION).toMatch(/if \(input\.termsAccepted !== true\)/)
    expect(ACTION).toContain('return { errorCode: "TERMS_REQUIRED" }')
  })

  it("a recusa acontece ANTES de qualquer efeito", () => {
    // Recusar depois de criar a conta no Supabase seria pior que não recusar.
    const i = ACTION.indexOf("input.termsAccepted !== true")
    const j = ACTION.indexOf("supabase.auth.signUp")
    expect(i).toBeGreaterThan(-1)
    expect(j).toBeGreaterThan(-1)
    expect(i).toBeLessThan(j)
  })

  it("e a tela sabe dizer isso à pessoa", () => {
    expect(TELA).toContain('errorCode === "TERMS_REQUIRED"')
    expect(TELA).toContain("auth.register.errors.termsRequired")
  })

  it.each(["pt", "en"] as const)("com texto nos dois idiomas — %s", (idioma) => {
    // Chave usada no código e ausente do JSON quebra a página em produção, e
    // não há teste de paridade global entre pt e en para pegar isso.
    expect(typeof mensagens(idioma).auth.register.errors.termsRequired).toBe("string")
  })
})

describe("o aceite fica GRAVADO", () => {
  it("existe tabela para ele", () => {
    expect(SCHEMA).toMatch(/model TermsAcceptance \{/)
  })

  it("sem chave estrangeira para User — e isso é deliberado", () => {
    // A linha de User não existe no momento do cadastro: ela nasce
    // preguiçosamente no primeiro getTenant(). Uma FK impediria gravar o aceite
    // no instante do ato de vontade, que é o que se quer provar.
    const model = SCHEMA.slice(
      SCHEMA.indexOf("model TermsAcceptance {"),
      SCHEMA.indexOf("}", SCHEMA.indexOf("model TermsAcceptance {"))
    )
    expect(model).not.toMatch(/@relation/)
    expect(model).toMatch(/userId\s+String\?/)
  })

  it("e é gravado ANTES do cadastro no Supabase", () => {
    // O ato de vontade aconteceu quando a pessoa enviou. Gravar depois deixaria
    // uma janela em que a conta existe e o aceite não — o defeito de volta.
    const i = ACTION.indexOf("prisma.termsAcceptance.create")
    const j = ACTION.indexOf("supabase.auth.signUp")
    expect(i).toBeGreaterThan(-1)
    expect(i).toBeLessThan(j)
  })

  it("com a VERSÃO dos dois documentos", () => {
    expect(ACTION).toContain("termsVersion: VERSAO_TERMOS")
    expect(ACTION).toContain("privacyVersion: VERSAO_PRIVACIDADE")
  })

  it("e sai na exportação LGPD, procurado pelos dois caminhos", () => {
    // Não tem tenantId: nenhuma varredura por empresa encontraria estas linhas.
    expect(EXPORT).toContain("prisma.termsAcceptance.findMany")
    // No objeto de RETORNO: procurar o nome solto passa verde com a variável
    // criada e nunca devolvida.
    expect(EXPORT).toMatch(/assinaturas: subscriptions,[\s\S]{0,40}aceiteDosTermos,/)
    expect(EXPORT).toMatch(/userId: \{ in:[\s\S]{0,120}email: \{ in:/)
  })
})

describe("a versão gravada é a versão PUBLICADA", () => {
  // A regra de ouro. A constante e o texto são duas fontes: quem editar os
  // Termos edita o JSON, e este teste quebra até a constante subir junto. Sem
  // ele, o aceite registraria para sempre uma versão que já não é a que está
  // no ar — que é a mesma família do contrato rotulado v1.2 prometendo o que
  // a v1.1 não prometia.
  it.each(["pt", "en"] as const)("os Termos — %s", (idioma) => {
    expect(dataPublicada(mensagens(idioma).legal.terms.lastUpdated)).toBe(VERSAO_TERMOS)
  })

  it.each(["pt", "en"] as const)("a Política de Privacidade — %s", (idioma) => {
    expect(dataPublicada(mensagens(idioma).legal.privacy.lastUpdated)).toBe(VERSAO_PRIVACIDADE)
  })

  it("e os dois idiomas publicam a MESMA data", () => {
    // Um idioma atualizado e o outro não já seria duas promessas diferentes.
    const pt = mensagens("pt").legal
    const en = mensagens("en").legal
    expect(dataPublicada(en.terms.lastUpdated)).toBe(dataPublicada(pt.terms.lastUpdated))
    expect(dataPublicada(en.privacy.lastUpdated)).toBe(dataPublicada(pt.privacy.lastUpdated))
  })

  it("o leitor de data entende os três formatos que os textos usam", () => {
    // Âncora: se `dataPublicada` devolvesse null para tudo, os testes acima
    // passariam comparando null com null. Os formatos diferem entre idiomas —
    // e a privacidade em inglês usa mês-dia-ano onde os Termos usam dia-mês-ano.
    expect(dataPublicada("Última atualização: 8 de setembro de 2026")).toBe("2026-09-08")
    expect(dataPublicada("Last updated: 8 September 2026")).toBe("2026-09-08")
    expect(dataPublicada("Last updated: July 20, 2026")).toBe("2026-07-20")
    expect(dataPublicada("sem data nenhuma")).toBeNull()
  })
})
