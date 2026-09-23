// Cotação entre fornecedores: a comparação.
//
// ─── A pergunta que isto responde ────────────────────────────────────────────
//
// A ordem de compra responde "o que eu compro". A cotação responde "DE QUEM eu
// compro" — que hoje se resolve ligando para três fornecedores e anotando num
// papel que some. Na compra seguinte a comparação é refeita do zero, muitas
// vezes com o mesmo resultado.
//
// ─── As DUAS formas de ganhar, e por que mostrar as duas ─────────────────────
//
// Existe mais de uma resposta certa, e elas divergem:
//
//   FORNECEDOR ÚNICO — o menor total entre quem cotou tudo. Uma nota, um
//   frete, um contato para cobrar quando atrasa.
//
//   DIVIDINDO — cada item com quem está mais barato nele. Sempre custa igual
//   ou menos, e às vezes bem menos. O preço é operacional: três entregas, três
//   notas, três telefonemas.
//
// Mostrar só o total esconde uma economia real; mostrar só o item a item
// esconde o trabalho que ela custa. Quem decide é o dono, com os dois números
// na frente — e a diferença entre eles é justamente o que ele está comprando
// ao aceitar dividir.
//
// Módulo puro: comparação de dinheiro precisa ser testável sem banco.

export type ItemCotado = { id: string; partId: string; nome: string; quantidade: number }
export type Participante = { id: string; supplierId: string; nome: string }
/** O preço de UM fornecedor para UM item. Ausente = não cotou aquele item. */
export type PrecoCotado = { participantId: string; itemId: string; unitPrice: number }

const centavos = (n: number) => Math.round(n * 100) / 100

/** Índice rápido: preço de (participante, item). */
function indexar(precos: readonly PrecoCotado[]) {
  const mapa = new Map<string, number>()
  for (const p of precos) mapa.set(`${p.participantId}::${p.itemId}`, p.unitPrice)
  return mapa
}

export type MelhorDoItem = {
  item: ItemCotado
  /** Quem está mais barato. `null` quando ninguém cotou este item. */
  participantId: string | null
  nomeDoFornecedor: string | null
  unitPrice: number | null
  /** Quantidade × preço. */
  total: number | null
  /** Quantos fornecedores deram preço para este item. */
  quantosCotaram: number
}

/**
 * O melhor preço de cada item, olhando todos os fornecedores.
 *
 * Empate resolve pelo PRIMEIRO participante da lista — determinístico de
 * propósito: uma comparação que muda de vencedor a cada recarregamento faz
 * quem está decidindo desconfiar da tela inteira.
 *
 * Item que ninguém cotou volta com `null` em vez de sumir da lista. Sumir
 * esconderia justamente o que precisa de outra ligação.
 */
export function melhorPorItem(
  itens: readonly ItemCotado[],
  participantes: readonly Participante[],
  precos: readonly PrecoCotado[]
): MelhorDoItem[] {
  const mapa = indexar(precos)

  return itens.map((item) => {
    let melhor: Participante | null = null
    let menor = Infinity
    let quantosCotaram = 0

    for (const p of participantes) {
      const preco = mapa.get(`${p.id}::${item.id}`)
      if (preco === undefined) continue
      quantosCotaram++
      // `<` e não `<=`: mantém o PRIMEIRO em caso de empate.
      if (preco < menor) {
        menor = preco
        melhor = p
      }
    }

    return {
      item,
      participantId: melhor?.id ?? null,
      nomeDoFornecedor: melhor?.nome ?? null,
      unitPrice: melhor ? centavos(menor) : null,
      total: melhor ? centavos(menor * item.quantidade) : null,
      quantosCotaram,
    }
  })
}

export type TotalDoFornecedor = {
  participante: Participante
  /** A soma do que ele cotou. */
  total: number
  /** Quantos itens ele cotou, de quantos existem. */
  cotados: number
  faltando: number
  /**
   * Cotou TUDO?
   *
   * Só quem cotou tudo entra na disputa por fornecedor único: comparar o total
   * de quem cotou 3 de 5 itens contra quem cotou os 5 daria a vitória a quem
   * respondeu menos, que é o oposto do que se quer.
   */
  completo: boolean
}

/** O total de cada fornecedor, e se ele cotou tudo. */
export function totaisPorFornecedor(
  itens: readonly ItemCotado[],
  participantes: readonly Participante[],
  precos: readonly PrecoCotado[]
): TotalDoFornecedor[] {
  const mapa = indexar(precos)

  return participantes.map((p) => {
    let total = 0
    let cotados = 0
    for (const item of itens) {
      const preco = mapa.get(`${p.id}::${item.id}`)
      if (preco === undefined) continue
      cotados++
      // Arredonda CADA LINHA antes de somar, e não a soma no fim.
      //
      // É a mesma convenção de `melhorPorItem` e da ordem de compra gerada no
      // fechamento — e ter duas convenções fazia os três números divergirem.
      // Com quantidade fracionária (a coluna é Decimal(12,3)), 2,5 × R$3,45 +
      // 1,5 × R$7,15 + 0,5 × R$9,99 dava R$ 24,35 somando cru e R$ 24,36
      // somando por linha: a tela mostrava um total, a ordem gravava outro, e
      // "dividindo" aparecia mais caro que o "melhor único" — que é impossível
      // por definição.
      //
      // Por linha é também o que a nota fiscal faz: cada item é um valor
      // fechado em centavos, e o total é a soma deles.
      total += centavos(preco * item.quantidade)
    }
    return {
      participante: p,
      // Já vem fechado das linhas; o arredondamento aqui só absorve resto
      // binário da soma de valores que já são centavos exatos.
      total: centavos(total),
      cotados,
      faltando: itens.length - cotados,
      completo: cotados === itens.length && itens.length > 0,
    }
  })
}

export type Comparacao = {
  porItem: MelhorDoItem[]
  totais: TotalDoFornecedor[]
  /** O melhor fornecedor ÚNICO, entre os que cotaram tudo. `null` se ninguém. */
  melhorUnico: TotalDoFornecedor | null
  /** O total comprando cada item de quem está mais barato. */
  totalDividindo: number
  /**
   * Quanto se economiza dividindo, em vez de comprar tudo do melhor único.
   *
   * `null` quando não há fornecedor único para comparar — sem base, qualquer
   * número aqui seria inventado.
   */
  economiaAoDividir: number | null
  /** Itens que ninguém cotou. São os que precisam de outra ligação. */
  semCotacao: ItemCotado[]
}

/**
 * A comparação completa.
 *
 * Uma função só porque as partes se explicam juntas: o total dividindo não
 * significa nada sem o melhor único ao lado, e a economia é a diferença entre
 * os dois.
 */
export function compararCotacao(
  itens: readonly ItemCotado[],
  participantes: readonly Participante[],
  precos: readonly PrecoCotado[]
): Comparacao {
  const porItem = melhorPorItem(itens, participantes, precos)
  const totais = totaisPorFornecedor(itens, participantes, precos)

  const completos = totais.filter((t) => t.completo)
  const melhorUnico =
    completos.length > 0
      ? completos.reduce((a, b) => (b.total < a.total ? b : a))
      : null

  const totalDividindo = centavos(
    porItem.reduce((soma, i) => soma + (i.total ?? 0), 0)
  )

  return {
    porItem,
    totais,
    melhorUnico,
    totalDividindo,
    economiaAoDividir: melhorUnico ? centavos(melhorUnico.total - totalDividindo) : null,
    semCotacao: porItem.filter((i) => i.participantId === null).map((i) => i.item),
  }
}

/** Uma cotação pode receber preço? Fechada e cancelada não. */
export function aceitaPreco(status: string): boolean {
  return status === "ABERTA"
}

/**
 * Dá para fechar a cotação escolhendo este fornecedor?
 *
 * Exige que ele tenha cotado ALGUMA coisa. Fechar com quem não respondeu
 * geraria uma ordem de compra vazia — e o dono descobriria isso só na tela
 * seguinte.
 */
export function podeFecharCom(
  totais: readonly TotalDoFornecedor[],
  participantId: string
): boolean {
  const t = totais.find((x) => x.participante.id === participantId)
  return Boolean(t && t.cotados > 0)
}
