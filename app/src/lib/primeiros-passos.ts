// Primeiros passos guiados.
//
// O problema: a empresa assina, entra e encontra tela vazia. Pior que vazia —
// boa parte do que ela está pagando nasce DESLIGADA por decisão nossa: PIX,
// termos, garantia, aviso ao cliente, campos personalizados, vocabulário.
// Cada recurso que somamos aumentou a distância entre "assinei" e "está
// configurado", e não havia nada encurtando essa distância. Quem não abre
// Configurações usa um terço do que paga — e cancela achando que o sistema é
// menos do que é.
//
// Duas decisões que fazem este painel prestar:
//
// 1. Os passos são DETECTADOS do que existe no banco, nunca marcados à mão.
//    Lista com caixinha de marcar mente: some da tela sem o trabalho ter sido
//    feito. Aqui, se sumiu é porque está feito de verdade.
//
// 2. Por consequência, empresa que já roda há meses não vê nada — todos os
//    passos já estão satisfeitos. Não precisa de exceção pra "cliente antigo",
//    e ninguém veterano é convidado a "criar sua primeira OS".
//
// Módulo puro: o que decide se este painel aparece é a mesma coisa que decide
// se ele some, e isso precisa ser reproduzível num teste.

/** O que a empresa já tem. Colhido pela action numa consulta só. */
export type RetratoDaEmpresa = {
  temTelefone: boolean
  temDocumento: boolean
  temLogo: boolean
  clientes: number
  ordens: number
  temPix: boolean
  temTermos: boolean
  /** A empresa fechou o painel na mão. */
  dispensado: boolean
}

export type ChavePasso =
  | "dadosDaEmpresa"
  | "logo"
  | "clientes"
  | "primeiraOs"
  | "pix"
  | "termos"

export type Passo = {
  chave: ChavePasso
  href: string
  feito: boolean
}

/**
 * A ordem é a ordem de utilidade, não a de arrumação.
 *
 * Dados da empresa e logo vêm primeiro porque saem impressos em TODA OS e todo
 * orçamento — errar isso contamina cada documento entregue daqui pra frente, e
 * corrigir depois não conserta o que já foi enviado. Cliente e primeira OS são
 * o ciclo principal do produto. PIX e termos vêm por último porque só passam a
 * importar quando já existe serviço para cobrar e documento para imprimir.
 */
const ORDEM: { chave: ChavePasso; href: string; feito: (r: RetratoDaEmpresa) => boolean }[] = [
  { chave: "dadosDaEmpresa", href: "/settings", feito: (r) => r.temTelefone && r.temDocumento },
  { chave: "logo", href: "/settings", feito: (r) => r.temLogo },
  { chave: "clientes", href: "/clients", feito: (r) => r.clientes > 0 },
  { chave: "primeiraOs", href: "/service-orders/new", feito: (r) => r.ordens > 0 },
  { chave: "pix", href: "/settings", feito: (r) => r.temPix },
  { chave: "termos", href: "/settings", feito: (r) => r.temTermos },
]

export type PrimeirosPassos = {
  passos: Passo[]
  concluidos: number
  total: number
  /** O painel deve aparecer? */
  visivel: boolean
  /** O próximo passo a fazer, pra tela poder destacá-lo. */
  proximo: ChavePasso | null
}

export function primeirosPassos(retrato: RetratoDaEmpresa): PrimeirosPassos {
  const passos: Passo[] = ORDEM.map((p) => ({
    chave: p.chave,
    href: p.href,
    feito: p.feito(retrato),
  }))

  const concluidos = passos.filter((p) => p.feito).length
  const total = passos.length
  const proximo = passos.find((p) => !p.feito)?.chave ?? null

  return {
    passos,
    concluidos,
    total,
    // Some sozinho ao concluir tudo — sem "parabéns" permanente ocupando o
    // topo do dashboard de quem já terminou.
    visivel: !retrato.dispensado && concluidos < total,
    proximo,
  }
}
