import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { MANUAL } from "@/lib/manual"
import { ADICIONAIS, RECURSOS, type Recurso } from "@/lib/recursos"
import { recursosDoPlano } from "@/lib/plan"

// O manual vende o que o código não entrega.
//
// Dois casos da auditoria de 13/09/2026, e o mesmo formato nos dois: um texto
// escrito quando a regra era outra, que ninguém tinha como saber que ficou
// velho — porque nada ligava o texto à regra.
//
//   • 5.4.4 "Filiais" trazia o selo "Enterprise". Filiais virou ADICIONAL em
//     25/08/2026 (lib/recursos.ts) e saiu de TODOS: nenhum plano inclui. Quem
//     assinava o Enterprise por causa dessa linha não recebia o recurso.
//   • A tabela de cargos dizia que só o Proprietário "mexe na assinatura do
//     plano". O Administrador contrata E cancela (actions/billing.ts).
//
// ─── Por que ESTRUTURAL, e amarrado à FONTE DA VERDADE ───────────────────────
//
// Corrigir o texto sem amarrá-lo à regra é adiar o próximo desencontro para o
// mês que vem. Estes testes leem plan.ts, recursos.ts e as Actions: mudou a
// regra e o manual não acompanhou, a suíte fica vermelha apontando o verbete.

const RAIZ = process.cwd()
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8")

/** O verbete, pelo código ("5.4.4") ou pela âncora ("papeis"). */
function verbete(chave: string) {
  for (const secao of MANUAL) {
    const achado = secao.verbetes.find((v) => v.codigo === chave || v.id === chave)
    if (achado) return achado
  }
  throw new Error(`verbete ${chave} não existe no manual`)
}

/** Todo verbete do manual, de todas as seções. */
const TODOS_OS_VERBETES = MANUAL.flatMap((s) => s.verbetes)

/** Os planos vendidos, como a tela de planos os mostra. */
const PLANOS = ["starter", "pro", "enterprise"] as const

describe("o selo de plano do verbete diz a verdade", () => {
  it("nenhum verbete vende um recurso que é ADICIONAL como se fosse de plano", () => {
    // Um adicional não vem em plano nenhum — dizer "Enterprise" faz alguém
    // pagar mais caro por algo que não vai receber.
    const adicionais = new Set<string>(ADICIONAIS)
    expect(adicionais.has("filiais"), "o teste pressupõe filiais como adicional").toBe(true)

    const filiais = verbete("5.4.4")
    expect(filiais.etiqueta).toBe("Adicional")
    expect(filiais.resumo.toLowerCase()).toContain("adicional")
  })

  it("o selo 'Enterprise' só aparece onde o Enterprise REALMENTE tem e os outros não", () => {
    // O caso legítimo: a API. Se ela deixar de ser exclusiva, este teste cai.
    const api = verbete("5.4.5")
    expect(api.etiqueta).toBe("Enterprise")

    const soDoEnterprise = (r: Recurso) =>
      recursosDoPlano("enterprise").includes(r) && !recursosDoPlano("pro").includes(r)
    expect(soDoEnterprise("api")).toBe(true)
  })

  it("o selo 'Pro' só aparece onde o Pro tem e o Starter não", () => {
    for (const v of TODOS_OS_VERBETES) {
      if (v.etiqueta !== "Pro") continue
      // Existe ao menos um recurso que o Pro tem e o Starter não — senão o
      // selo estaria vendendo o que o Starter já inclui.
      const proExclusivo = RECURSOS.some(
        (r) => recursosDoPlano("pro").includes(r) && !recursosDoPlano("starter").includes(r)
      )
      expect(proExclusivo, `${v.codigo ?? v.id} traz selo Pro`).toBe(true)
    }
  })

  it("nenhum verbete traz o selo de um plano que não existe", () => {
    // `etiqueta` serve a DOIS fins: selo de plano ("Pro") e rótulo curto de
    // tipo ("OM", de Ordem de Manutenção). Só os que PARECEM plano são
    // cobrados aqui — um rótulo de tipo não promete nada sobre preço.
    const planosComMaiuscula = PLANOS.map((p) => p[0].toUpperCase() + p.slice(1))
    const pareceNomeDePlano = (e: string) =>
      planosComMaiuscula.some((p) => e.toLowerCase() === p.toLowerCase())

    for (const v of TODOS_OS_VERBETES) {
      if (!v.etiqueta || !pareceNomeDePlano(v.etiqueta)) continue
      const slug = v.etiqueta.toLowerCase()
      expect(
        recursosDoPlano(slug).length,
        `${v.codigo ?? v.id} traz o selo "${v.etiqueta}", e esse plano não libera recurso nenhum`
      ).toBeGreaterThan(0)
    }
  })
})

/**
 * Os papéis que UMA função aceita, lidos do corpo DELA.
 *
 * Ler o arquivo inteiro não serve: `billing.ts` tem quatro guardas, e uma
 * asserção de `toContain` sobre o arquivo passa mesmo que a função em questão
 * tenha sido restringida — basta qualquer outra ainda casar. Foi esse o buraco
 * da primeira versão deste teste, apontado na revisão adversarial de
 * 22/09/2026: a mutação que trancava `cancelSubscription` em OWNER passava
 * verde, porque `subscribeToPlan` continuava dizendo OWNER e ADMIN.
 */
function papeisQuePodem(arquivo: string, fn: string): string[] {
  const i = arquivo.indexOf(`export async function ${fn}(`)
  expect(i, `função ${fn} não existe`).toBeGreaterThan(-1)
  const fim = arquivo.indexOf("\n}", i)
  const corpo = arquivo.slice(i, fim === -1 ? undefined : fim)

  const guarda = corpo.match(/if \(role !== "(\w+)"(?: && role !== "(\w+)")?\)/)
  if (!guarda) return [] // sem guarda de papel: qualquer um passa
  // A guarda é por NEGAÇÃO: quem não está na lista é barrado.
  return [guarda[1], guarda[2]].filter(Boolean).sort() as string[]
}

describe("a tabela de cargos diz a verdade", () => {
  const CERTIFICADO = ler("src/actions/certificado.ts")
  const BILLING = ler("src/actions/billing.ts")
  const EXPORT = ler("src/actions/data-export.ts")
  const papeis = verbete("papeis")
  const tabela = papeis.blocos.find((b) => b.tipo === "tabela") as { linhas: string[][] }
  const linha = (cargo: string) => tabela.linhas.find((l) => l[0] === cargo)![1]

  it("o certificado digital é mesmo SÓ do Proprietário", () => {
    // Três guardas em certificado.ts, todas OWNER puro.
    expect(CERTIFICADO).toContain('role !== "OWNER"')
    expect(CERTIFICADO).not.toContain('role !== "OWNER" && role !== "ADMIN"')
    expect(linha("Proprietário")).toContain("certificado digital")
    expect(linha("Administrador")).toContain("Não envia certificado digital")
  })

  it("a assinatura NÃO é só do Proprietário — o Administrador contrata e cancela", () => {
    // Decisão deliberada: Assinatura fica com dono E administrador (a conta da
    // empresa com o ServiçoOS). Ver o Grupo 3 da auditoria.
    //
    // Por FUNÇÃO, e não pelo arquivo: contratar e cancelar têm de andar juntos,
    // e uma asserção sobre o arquivo inteiro não enxergaria uma delas mudando.
    expect(papeisQuePodem(BILLING, "cancelSubscription")).toEqual(["ADMIN", "OWNER"])
    expect(papeisQuePodem(BILLING, "subscribeToPlan")).toEqual(["ADMIN", "OWNER"])
    expect(papeisQuePodem(BILLING, "trocarDePlano")).toEqual(["ADMIN", "OWNER"])

    expect(linha("Proprietário")).not.toContain("assinatura do plano")
    expect(linha("Administrador")).toMatch(/plano/)
  })

  it("a exportação de dados É só do Proprietário, e a célula dele diz isso", () => {
    // Reúne PII de toda a equipe e de todos os clientes. A frase na célula
    // ficou sem teste na primeira passada, e a revisão adversarial mostrou que
    // ela seria apagada sem nada quebrar.
    expect(papeisQuePodem(EXPORT, "exportTenantData")).toEqual(["OWNER"])
    expect(linha("Proprietário")).toMatch(/export/i)
  })

  it("e a caixa de atenção avisa quem convida um Administrador", () => {
    // A tabela diz o que cada cargo alcança; esta caixa diz a CONSEQUÊNCIA de
    // escolher Administrador — que é onde a pessoa erra.
    const caixas = papeis.blocos.filter((b) => b.tipo === "atencao") as {
      titulo: string
      texto: string
    }[]
    // Pelo TÍTULO: a caixa do Gerente também fala em cobrança, e procurar pelo
    // texto acha a errada.
    const sobreOAdmin = caixas.find((c) => /Administrador/i.test(c.titulo))
    expect(sobreOAdmin, "falta a caixa sobre o Administrador e a cobrança").toBeTruthy()
    expect(sobreOAdmin!.texto).toMatch(/cancelar/i)
    // E aponta a saída para quem NÃO quer isso.
    expect(sobreOAdmin!.texto).toMatch(/Gerente/)
  })
})
