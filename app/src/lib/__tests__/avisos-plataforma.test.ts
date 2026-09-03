import { describe, expect, it } from "vitest"
import {
  AVISOS,
  chaveDoAviso,
  destinoDoAviso,
  INSISTENTE,
  montarAviso,
  PERMISSAO_DO_AVISO,
} from "@/lib/avisos-plataforma"

/** Tradutor de mentira: devolve a chave e os valores, para o teste ver o que foi pedido. */
const t = (chave: string, vals?: Record<string, string | number>) =>
  vals ? `${chave}(${Object.entries(vals).map(([k, v]) => `${k}=${v}`).join(",")})` : chave

describe("a chave do aviso", () => {
  it("atraso e cancelamento têm chaves DIFERENTES", () => {
    // O defeito que isto impede, e é o mais caro deste módulo: com uma chave
    // por empresa, o cancelamento — que chega DEPOIS do atraso — encontraria a
    // linha já gravada e seria engolido em silêncio. O dono saberia que o
    // cliente atrasou e nunca que ele foi embora.
    const dados = { tenantId: "t1", subscriptionId: "s1", fimDoPeriodo: new Date("2026-09-30") }
    expect(chaveDoAviso("assinaturaEmAtraso", dados)).not.toBe(
      chaveDoAviso("assinaturaCancelada", dados)
    )
  })

  it("o atraso carrega o período, porque se repete de mês em mês", () => {
    // A mesma assinatura pode atrasar em setembro e de novo em outubro: são
    // dois fatos novos, e o segundo não pode ser engolido pelo primeiro.
    const base = { subscriptionId: "s1" }
    const setembro = chaveDoAviso("assinaturaEmAtraso", { ...base, fimDoPeriodo: new Date("2026-09-30") })
    const outubro = chaveDoAviso("assinaturaEmAtraso", { ...base, fimDoPeriodo: new Date("2026-10-31") })
    expect(setembro).not.toBe(outubro)
  })

  it("o cancelamento NÃO leva data: acontece uma vez só", () => {
    const a = chaveDoAviso("assinaturaCancelada", { subscriptionId: "s1", fimDoPeriodo: new Date("2026-09-30") })
    const b = chaveDoAviso("assinaturaCancelada", { subscriptionId: "s1", fimDoPeriodo: new Date("2026-10-31") })
    expect(a).toBe(b)
  })

  it("empresa nova é uma por empresa, para sempre", () => {
    expect(chaveDoAviso("novaEmpresa", { tenantId: "t1" })).toBe("novaEmpresa:t1")
    expect(chaveDoAviso("novaEmpresa", { tenantId: "t1" })).toBe(
      chaveDoAviso("novaEmpresa", { tenantId: "t1" })
    )
  })

  it("o TESTE nunca repete a chave", () => {
    // Senão o botão funcionaria uma vez e nunca mais — e ele existe justamente
    // para o dono conferir amanhã se o cano continua de pé.
    expect(chaveDoAviso("testeDeAviso", {})).not.toBe(chaveDoAviso("testeDeAviso", {}))
  })
})

describe("quem recebe o quê", () => {
  it("todo aviso tem uma permissão declarada", () => {
    // Aviso sem permissão iria para qualquer papel — inclusive para quem não
    // pode ver financeiro, pela tela de bloqueio do celular.
    for (const a of AVISOS) expect(PERMISSAO_DO_AVISO[a], a).toBeTruthy()
  })

  it("dinheiro só para quem cuida de dinheiro", () => {
    expect(PERMISSAO_DO_AVISO.assinaturaEmAtraso).toBe("verFinanceiro")
    expect(PERMISSAO_DO_AVISO.assinaturaCancelada).toBe("verFinanceiro")
  })

  it("empresa nova é para todo o painel", () => {
    expect(PERMISSAO_DO_AVISO.novaEmpresa).toBe("verPainel")
  })
})

describe("o que acorda o aparelho", () => {
  it("só dinheiro insiste", () => {
    // Empresa nova é boa notícia e pode esperar. Dinheiro caindo tem janela: o
    // acesso é cortado depois da carência, e ligar no mesmo dia é o que
    // recupera. Marcar tudo como urgente é o mesmo que não marcar nada.
    expect(INSISTENTE.has("assinaturaEmAtraso")).toBe(true)
    expect(INSISTENTE.has("assinaturaCancelada")).toBe(true)
    expect(INSISTENTE.has("novaEmpresa")).toBe(false)
    expect(INSISTENTE.has("testeDeAviso")).toBe(false)
  })
})

describe("o texto que chega no celular", () => {
  it("nenhum texto é escrito no código — tudo pede tradução", () => {
    const a = montarAviso("novaEmpresa", { empresa: "Frio Total" }, t)
    expect(a.title).toBe("novaEmpresa.title")
    expect(a.body).toContain("novaEmpresa.body")
    expect(a.body).toContain("empresa=Frio Total")
  })

  it("empresa INDICADA usa outro texto", () => {
    const a = montarAviso("novaEmpresa", { empresa: "Frio", indicador: "Livela" }, t)
    expect(a.body).toContain("novaEmpresa.bodyIndicada")
    expect(a.body).toContain("indicador=Livela")
  })

  it("atraso COM valor conhecido diz o valor", () => {
    const a = montarAviso("assinaturaEmAtraso", { empresa: "Livela", plano: "Starter", valor: 97 }, t)
    expect(a.body).toContain("bodyComValor")
    expect(a.body).toContain("valor=97")
  })

  it("atraso SEM valor não inventa número", () => {
    const a = montarAviso("assinaturaEmAtraso", { empresa: "Livela" }, t)
    expect(a.body).toContain("assinaturaEmAtraso.body(")
    expect(a.body).not.toContain("bodyComValor")
  })

  it("empresa faltando não vira 'undefined' na tela de bloqueio", () => {
    const a = montarAviso("novaEmpresa", {}, t)
    expect(a.body).not.toContain("undefined")
  })

  it("a etiqueta agrupa por EVENTO e empresa, não só por evento", () => {
    // Três empresas atrasando na mesma semana devem virar três linhas na barra
    // de notificação, e não uma substituindo a outra.
    const a = montarAviso("assinaturaEmAtraso", { tenantId: "t1" }, t)
    const b = montarAviso("assinaturaEmAtraso", { tenantId: "t2" }, t)
    expect(a.tag).not.toBe(b.tag)
  })

  it("só o de dinheiro fica na tela até ser tocado", () => {
    expect(montarAviso("assinaturaEmAtraso", {}, t).requireInteraction).toBe(true)
    expect(montarAviso("novaEmpresa", {}, t).requireInteraction).toBe(false)
  })
})

describe("para onde o toque leva", () => {
  it("usa `q`, que é o parâmetro que a busca do painel realmente lê", () => {
    // Dois desenhos propuseram `?tenant=`. O painel busca por `q` — o nome
    // inventado seria ignorado em silêncio e o dono cairia na lista inteira,
    // tendo que procurar a empresa à mão. Que é o trabalho que o aviso existe
    // para poupar.
    expect(destinoDoAviso("novaEmpresa", { tenantId: "t1" })).toBe("/admin?q=t1")
  })

  it("sem empresa, leva ao painel mesmo", () => {
    expect(destinoDoAviso("novaEmpresa", {})).toBe("/admin")
  })

  it("escapa o id, para um valor estranho não quebrar a URL", () => {
    expect(destinoDoAviso("novaEmpresa", { tenantId: "a b&c" })).toBe("/admin?q=a%20b%26c")
  })

  it("a DÚVIDA abre a conversa, e não a linha da empresa", () => {
    // Quem toca num aviso de pergunta quer ler a pergunta, não gerenciar o
    // plano de quem perguntou.
    expect(destinoDoAviso("duvidaNova", { tenantId: "t1", duvidaId: "d9" })).toBe(
      "/admin/duvidas/d9"
    )
  })

  it("dúvida sem id cai na fila, e não numa página quebrada", () => {
    expect(destinoDoAviso("duvidaNova", { tenantId: "t1" })).toBe("/admin/duvidas")
  })
})

describe("o aviso de dúvida", () => {
  it("a chave é da MENSAGEM, não da conversa", () => {
    // A mesma conversa recebe pergunta de volta depois da resposta, e cada uma
    // é um fato novo. Chavear pela conversa avisaria só a primeira — e o dono
    // nunca saberia que o cliente voltou a perguntar.
    const a = chaveDoAviso("duvidaNova", { duvidaId: "d1", mensagemId: "m1" })
    const b = chaveDoAviso("duvidaNova", { duvidaId: "d1", mensagemId: "m2" })
    expect(a).not.toBe(b)
  })

  it("leva a PERGUNTA no corpo, e não só 'você tem uma dúvida'", () => {
    // Metade delas o dono responde de cabeça: ler a pergunta na tela de
    // bloqueio já diz se dá para esperar ou se é agora.
    const a = montarAviso(
      "duvidaNova",
      { empresa: "Livela", quem: "Priscila", pergunta: "Como emito nota?" },
      t
    )
    expect(a.body).toContain("pergunta=Como emito nota?")
    expect(a.body).toContain("quem=Priscila")
  })

  it("acorda o aparelho: o cliente está esperando", () => {
    expect(INSISTENTE.has("duvidaNova")).toBe(true)
  })

  it("vai para quem ATENDE dúvida, não para quem vê dinheiro", () => {
    expect(PERMISSAO_DO_AVISO.duvidaNova).toBe("atenderDuvida")
  })
})
