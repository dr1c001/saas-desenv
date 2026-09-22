import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Quem recebe dados TEM de estar na lista de operadores.
//
// A tabela da Política de Privacidade listava seis serviços. Faltavam dois que
// estão ligados no código desde sempre: o Sentry, que captura payload de erro
// dos dois lados, e a API da Anthropic, que recebe a conversa e o resultado
// das ferramentas — nome de cliente, OS, valores — a cada comando da
// assistente de voz. Um titular exercendo o art. 18, VII da LGPD
// ("informação sobre entidades com as quais os dados foram compartilhados")
// recebia uma lista incompleta. (Achado na auditoria de 13/09/2026.)
//
// ─── Por que ESTRUTURAL ──────────────────────────────────────────────────────
//
// O defeito é um nome ESQUECIDO num documento, e a fonte da verdade é o
// package.json: um SDK de terceiro instalado e usado é um terceiro que recebe
// dados. Nenhum teste de comportamento pegaria isso.

const RAIZ = process.cwd()
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8")

const PACOTES = JSON.parse(ler("package.json")).dependencies as Record<string, string>
const PRIVACIDADE = ler("src/app/privacy/page.tsx")
const MENSAGENS = JSON.parse(ler("messages/pt.json"))
const MENSAGENS_EN = JSON.parse(ler("messages/en.json"))

/**
 * O SDK de cada terceiro que recebe dado, e o nome com que ele aparece na
 * tabela. Acrescentar um SDK destes sem pôr o nome na tabela é o defeito.
 */
const QUEM_RECEBE: { pacote: string; nome: string; chave: string }[] = [
  { pacote: "@supabase/ssr", nome: "Supabase", chave: "supabase" },
  { pacote: "@sentry/nextjs", nome: "Sentry", chave: "sentry" },
  { pacote: "@anthropic-ai/sdk", nome: "Anthropic", chave: "anthropic" },
  { pacote: "resend", nome: "Resend", chave: "resend" },
]

describe("a tabela de operadores", () => {
  it.each(QUEM_RECEBE)("$nome está instalado E declarado", ({ pacote, nome, chave }) => {
    // Se o pacote não estiver mais instalado, o teste deixa de exigir o nome —
    // mas aí alguém removeu a integração de propósito.
    if (!(pacote in PACOTES)) return

    expect(PRIVACIDADE, `${nome} recebe dados e não está na tabela da Política`).toContain(
      `<td>${nome}</td>`
    )
    expect(MENSAGENS.legal.privacy.section4.table[chave]).toBeTruthy()
    expect(MENSAGENS_EN.legal.privacy.section4.table[chave]).toBeTruthy()
  })

  it("toda linha da tabela tem finalidade escrita nos DOIS idiomas", () => {
    const pt = MENSAGENS.legal.privacy.section4.table
    const en = MENSAGENS_EN.legal.privacy.section4.table
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    for (const [k, v] of Object.entries(pt)) {
      expect(String(v).length, `pt: ${k} vazio`).toBeGreaterThan(3)
    }
  })
})

describe("o contrato lista os suboperadores por função", () => {
  // A cláusula 5.7 é transcrição do parecer e lista por FUNÇÃO, não por nome —
  // não se reescreve o texto do advogado. Mas a LISTA precisa estar completa:
  // a assistente de voz manda dado da empresa para um terceiro e não aparecia.
  const CONTRATO = ler("src/components/pdf/contrato-pdf.tsx")

  it("o monitoramento de erros está lá", () => {
    expect(CONTRATO).toContain("Monitoramento de erros da aplicação")
  })

  it("e o processamento de linguagem natural da assistente também", () => {
    if (!("@anthropic-ai/sdk" in PACOTES)) return
    expect(CONTRATO).toContain("Processamento de linguagem natural")
  })
})
