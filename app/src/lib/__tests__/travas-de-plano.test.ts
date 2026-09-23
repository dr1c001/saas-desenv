import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ADICIONAIS, RECURSOS, type Recurso } from "@/lib/recursos"
import { limitesDoPlano, recursosDoPlano } from "@/lib/plan"

// A trava de plano só serve se ela TRAVAR e se ela SOUBER EXPLICAR.
//
// Escrito depois de encontrar quatro recursos sem mensagem de bloqueio:
// `requireRecurso` monta a chave como `planFeature.${recurso}`, e
// actions/estoque.ts chama `requireRecurso(tenantId, "stock")` em seis lugares
// — mas `errors.planFeature.stock` não existia. O cliente do Starter que
// tentasse abrir estoque não recebia "faz parte do Pro": recebia um erro de
// tradução, que não explica nada e parece defeito do sistema.
//
// Nada obrigava as duas listas a concordar. Este teste obriga.

const IDIOMAS = ["pt", "en"] as const
const PLANOS = ["starter", "pro", "enterprise"] as const

function mensagens(idioma: (typeof IDIOMAS)[number]) {
  return JSON.parse(readFileSync(join(process.cwd(), `messages/${idioma}.json`), "utf8")) as {
    errors: { planFeature: Record<string, string> }
    mapAdmin: { admin: { actions: { featureNames: Record<string, string> } } }
    planFeatures: Record<string, string[]>
  }
}

describe("todo recurso sabe se explicar", () => {
  it.each(IDIOMAS)("tem mensagem de bloqueio em %s", (idioma) => {
    // A mensagem que `requireRecurso` mostra quando barra alguém. Sem ela, a
    // trava funciona mas o cliente não entende por quê — e liga no suporte.
    const m = mensagens(idioma)
    const semMensagem = RECURSOS.filter((r) => typeof m.errors.planFeature[r] !== "string")
    expect(semMensagem).toEqual([])
  })

  it.each(IDIOMAS)("tem nome legível no painel do admin em %s", (idioma) => {
    // O painel monta as caixas com `RECURSOS.map(...)`, então um recurso novo
    // aparece lá sozinho — mas sem nome vira uma caixa com a chave crua.
    const nomes = mensagens(idioma).mapAdmin.admin.actions.featureNames
    const semNome = RECURSOS.filter((r) => typeof nomes[r] !== "string")
    expect(semNome).toEqual([])
  })

  it.each(IDIOMAS)("não sobra mensagem de recurso que não existe mais em %s", (idioma) => {
    // O outro lado: apagar um recurso e deixar a mensagem órfã. Não quebra
    // nada, mas é o rastro que faz alguém achar que o recurso ainda existe.
    const m = mensagens(idioma)
    const conhecidos = new Set<string>(RECURSOS)
    expect(Object.keys(m.errors.planFeature).filter((k) => !conhecidos.has(k))).toEqual([])
    expect(
      Object.keys(m.mapAdmin.admin.actions.featureNames).filter((k) => !conhecidos.has(k))
    ).toEqual([])
  })
})

describe("cada plano entrega exatamente a sua faixa", () => {
  it("o Starter inclui NFS-e, e só isso", () => {
    // A regra que o dono pediu com todas as letras: "o Starter o cliente vai
    // usar somente o que está no Starter". A lista é exata de propósito — um
    // recurso novo não pode escorregar para dentro do plano mais barato sem
    // alguém decidir isso.
    //
    // `nfse` está aqui desde 30/08/2026: o plano já era VENDIDO com "8 notas
    // fiscais por mês" e já tinha a cota, mas a trava impedia a emissão. Ver o
    // comentário em POR_PLANO.
    expect(recursosDoPlano("starter")).toEqual(["nfse"])
  })

  it("emitir nota é de TODOS os planos; o que muda é a cota", () => {
    // A trava certa aqui é a de QUANTIDADE, não a de recurso. Se `nfse` sair
    // de algum plano, o texto de venda daquele plano passa a mentir de novo —
    // foi exatamente esse o defeito.
    for (const plano of PLANOS) {
      expect(recursosDoPlano(plano), plano).toContain("nfse")
    }
    expect(limitesDoPlano("starter").nfseMes).toBe(8)
    expect(limitesDoPlano("pro").nfseMes).toBe(70)
    // Deixou de ser ilimitado: nota tem custo por unidade, e cota infinita
    // por preço fixo faz o maior cliente ser o menos lucrativo.
    expect(limitesDoPlano("enterprise").nfseMes).toBe(200)
  })

  it("o Pro inclui tudo, menos o que é só do Enterprise e os adicionais", () => {
    const pro = new Set(recursosDoPlano("pro"))
    expect(pro.has("api")).toBe(false)
    for (const a of ADICIONAIS) expect(pro.has(a), a).toBe(false)
    // E inclui os que são a razão de existir do plano.
    for (const r of ["gpsMap", "nfse", "advancedReports", "stock"] as Recurso[]) {
      expect(pro.has(r), r).toBe(true)
    }
  })

  it("o Enterprise inclui tudo do Pro, e mais a API", () => {
    const pro = recursosDoPlano("pro")
    const ent = new Set(recursosDoPlano("enterprise"))
    for (const r of pro) expect(ent.has(r), r).toBe(true)
    expect(ent.has("api")).toBe(true)
  })

  it("nenhum plano inclui um ADICIONAL", () => {
    // Adicional é vendido à parte. Um plano que passasse a incluí-lo estaria
    // dando de graça o que tem custo por uso (a assistente) ou o que é vendido
    // por R$ 49 (filiais).
    for (const plano of PLANOS) {
      const r = new Set(recursosDoPlano(plano))
      for (const a of ADICIONAIS) expect(r.has(a), `${plano} inclui ${a}`).toBe(false)
    }
  })

  it("todo recurso é alcançável por algum caminho", () => {
    // Um recurso que nenhum plano inclui e que não é adicional seria código
    // morto vendável por ninguém: existe no catálogo, aparece no painel, e não
    // há como um cliente obtê-lo a não ser por concessão manual.
    const emAlgumPlano = new Set(PLANOS.flatMap((p) => recursosDoPlano(p)))
    const orfaos = RECURSOS.filter(
      (r) => !emAlgumPlano.has(r) && !(ADICIONAIS as readonly string[]).includes(r)
    )
    expect(orfaos).toEqual([])
  })
})

describe("a régua de cobrança", () => {
  it("é do Pro para cima, e não do Starter", () => {
    expect(recursosDoPlano("starter")).not.toContain("reguaCobranca")
    expect(recursosDoPlano("pro")).toContain("reguaCobranca")
    expect(recursosDoPlano("enterprise")).toContain("reguaCobranca")
  })

  it.each(IDIOMAS)("o Pro ANUNCIA que a entrega, em %s", (idioma) => {
    // Travar sem anunciar é o pior dos dois mundos: o Starter não tem, e o Pro
    // não sabe que ganhou. O recurso só vira motivo de upgrade quando está
    // escrito no card do plano.
    const pro = mensagens(idioma).planFeatures.pro.join(" ").toLowerCase()
    expect(pro).toMatch(idioma === "pt" ? /cobran[çc]a/ : /reminder/)
  })
})
