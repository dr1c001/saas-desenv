// A comissão do funcionário por ordem de serviço.
//
// ─── O que o dono pediu ──────────────────────────────────────────────────────
//
// "quando o funcionário é comissionado e ganha uma porcentagem por ordem de
//  serviço concluída e ou faturada. assim que a ordem de serviço for concluída,
//  já adicionar no contas a pagar a porcentagem do funcionário. se for faturada
//  também, porém, descontar a taxa da nota fiscal. o técnico ou o dono ou
//  administrador adiciona a porcentagem variada de cada OS."
//
// ─── "Faturada" não é a mesma coisa que "tem nota" ───────────────────────────
//
// Esta é a distinção que decide o número na tela, e ela não é óbvia.
//
// No sistema, uma OS chega ao status FATURADA por dois caminhos diferentes:
// pelo botão de emitir NFS-e (actions/nfse.ts) e pela simples troca de status
// (actions/service-orders.ts), que qualquer dono usa quando cobra sem emitir
// nota — o caso mais comum na base de hoje.
//
// Descontar ISS de uma OS faturada SEM nota tiraria dinheiro do funcionário
// para pagar um imposto que ninguém recolheu. Por isso a regra aqui não olha o
// status: olha se existe NOTA. `descontarIss` é um booleano que quem chama
// preenche a partir da nota, e não do status — e o teste guarda isso.
//
// ─── Por que a conta inteira acontece em centavos inteiros ───────────────────
//
// O jeito da casa em outros módulos é `centavos(valor * (taxa / 100))`, e para
// depreciação de bens isso está certo: é um número interno, e um centavo não
// muda decisão nenhuma.
//
// Aqui muda. Este número vai para o contas a pagar de uma pessoa, e ela vai
// conferir. Varrendo de R$ 0,01 a R$ 2.000,00 contra oito porcentagens usuais
// (5, 7,5, 10, 12, 15, 20, 25 e 30%), as duas fórmulas divergem em 12.020
// casos — e em TODOS os 12.020 a versão em reais paga um centavo A MENOS.
// Nenhuma vez a favor. Não é ruído aleatório: é o float sempre caindo para
// baixo no meio exato (15% de R$ 100,10 dá 15,014999… e vira R$ 15,01, quando
// a conta certa é 15,015 → R$ 15,02).
//
// Um centavo por OS, sempre contra a mesma pessoa, é o tipo de erro que ela
// acaba encontrando — e que custa a confiança no sistema inteiro.
//
// Módulo puro: cada centavo aqui vira conversa com gente de verdade, então
// precisa ser reproduzível num teste.

/** Porcentagem de comissão aceita: de 0 a 100. */
export const MAX_PERCENTUAL = 100

/**
 * Sobre o que a porcentagem incide.
 *
 * `TOTAL` — o valor cheio da OS. É o padrão, e é o que já existia.
 * `MAO_DE_OBRA` — só os itens que NÃO vieram do estoque.
 *
 * A escolha existe porque as duas estão certas, para empresas diferentes. Numa
 * OS de R$ 1.200 com R$ 1.000 de compressor, comissionar o total paga R$ 100
 * sobre uma peça que o técnico só carregou até o cliente — o que é justo para
 * quem vende serviço com pouca peça, e é o lucro inteiro para quem revende.
 *
 * A separação sai de graça: `ServiceItem.partId` já diz se o item veio do
 * catálogo, e ler isso não expõe custo nenhum ao técnico.
 */
export type BaseDaComissao = "TOTAL" | "MAO_DE_OBRA"

export const BASES_DA_COMISSAO: readonly BaseDaComissao[] = ["TOTAL", "MAO_DE_OBRA"]

export function baseDaComissaoValida(v: string): v is BaseDaComissao {
  return (BASES_DA_COMISSAO as readonly string[]).includes(v)
}

/**
 * Quanto desta OS entra na base, em centavos.
 *
 * Um valor desconhecido cai em TOTAL, e não em zero: a coluna tem CHECK no
 * banco, mas se um dia um valor novo chegar antes de o código conhecê-lo, o
 * pior desfecho é a comissão da empresa inteira zerar em silêncio. Cair no
 * comportamento antigo é o erro que alguém percebe.
 */
export function baseParaComissao(
  itens: readonly { total: number; partId: string | null }[],
  totalDaOs: number,
  base: string
): number {
  if (base !== "MAO_DE_OBRA") return emCentavos(totalDaOs)
  // Arredonda CADA LINHA antes de somar, e não a soma no fim: é a convenção
  // já escrita em lib/cotacao.ts, e ter duas convenções faria a base da
  // comissão divergir do total da OS por um centavo.
  return itens
    .filter((i) => i.partId === null)
    .reduce((soma, i) => soma + emCentavos(i.total), 0)
}

/**
 * A porcentagem digitada serve?
 *
 * `null` é resposta legítima e quer dizer "esta OS não comissiona" — diferente
 * de zero, que é uma decisão consciente de comissionar nada. Manter os dois
 * separados é o que permite ligar o recurso sem mexer em nenhuma OS existente.
 */
export function percentualValido(p: number | null): boolean {
  if (p === null) return true
  return Number.isFinite(p) && p >= 0 && p <= MAX_PERCENTUAL
}

/** Reais (ou Decimal do Prisma já convertido) para centavos inteiros. */
export function emCentavos(valor: number): number {
  return Math.round(valor * 100)
}

export type EntradaDaComissao = {
  /** O total da OS em centavos. Vem do `totalAmount` GRAVADO, nunca da soma em memória. */
  totalCentavos: number
  /** A porcentagem daquela OS. `null` = a OS não comissiona. */
  percentual: number | null
  /**
   * A alíquota da nota, em porcentagem. Só é usada quando `descontarIss` é
   * verdadeiro; `null` cai no padrão do emissor (5%), o mesmo que actions/nfse.ts usa.
   */
  issRate: number | null
  /**
   * Existe NOTA emitida para esta OS?
   *
   * Repare: nota, e não status "faturada". Ver o cabeçalho — descontar imposto
   * de uma OS faturada sem nota tira dinheiro do funcionário para pagar tributo
   * que ninguém recolheu.
   */
  descontarIss: boolean
}

export type Comissao = {
  /** O valor cheio da OS, em centavos. */
  totalCentavos: number
  /** Quanto de imposto saiu da base. Zero quando não há nota. */
  issCentavos: number
  /** Sobre o que a porcentagem incidiu. */
  baseCentavos: number
  /** O que a pessoa tem a receber, em centavos. */
  valorCentavos: number
}

/** O padrão do emissor quando a empresa não configurou alíquota (igual a actions/nfse.ts). */
export const ISS_PADRAO = 5

/**
 * Quanto esta OS gera de comissão.
 *
 * `null` quando não gera — e quem chama precisa tratar isso apagando a conta a
 * pagar que porventura exista, em vez de gravar zero: uma linha de R$ 0,00 no
 * contas a pagar é ruído que o dono confere todo mês para nada.
 *
 * A ordem da conta é DESCONTAR O IMPOSTO PRIMEIRO, e depois aplicar a
 * porcentagem — é o que o pedido diz ("se for faturada também, porém,
 * descontar a taxa da nota fiscal") e é o que faz sentido: a empresa nunca
 * teve o dinheiro do ISS, então ele não pode entrar na base de nada.
 */
export function calcularComissao(entrada: EntradaDaComissao): Comissao | null {
  const { totalCentavos, percentual, issRate, descontarIss } = entrada

  if (percentual === null || !percentualValido(percentual) || percentual === 0) return null
  if (!Number.isFinite(totalCentavos)) return null

  // Total negativo ou zero não gera comissão. Negativo não deveria existir num
  // total de OS, mas se existir, o certo é não pagar — e não devolver um valor
  // negativo, que viraria uma conta a pagar cobrando do funcionário.
  if (totalCentavos <= 0) return null

  const aliquota = descontarIss ? (issRate ?? ISS_PADRAO) : 0
  const issCentavos =
    aliquota > 0 ? Math.round((totalCentavos * aliquota) / 100) : 0
  const baseCentavos = totalCentavos - issCentavos

  if (baseCentavos <= 0) return null

  const valorCentavos = Math.round((baseCentavos * percentual) / 100)
  if (valorCentavos <= 0) return null

  return { totalCentavos, issCentavos, baseCentavos, valorCentavos }
}

export type LinhaDeComissao = {
  payeeId: string
  nome: string
  valor: number
  base: number
  iss: number
}

export type ComissaoPorPessoa = {
  payeeId: string
  nome: string
  /** Quantas OS entraram nesta soma. */
  quantidade: number
  total: number
  base: number
  iss: number
}

/**
 * As comissões a pagar, somadas por pessoa.
 *
 * Agrupar não é enfeite: quatro técnicos com vinte OS no mês são oitenta linhas
 * novas numa tabela sem paginação, e o dono deixaria de achar o aluguel no meio
 * delas. Agrupado, o fechamento vira uma linha por pessoa — que é como ele já
 * faz no papel.
 *
 * A BASE vem junto do valor de propósito. Quem digita a base é o próprio
 * beneficiário (o técnico lança quantidade e preço item a item ao concluir), e
 * ver "R$ 12.000,00 → R$ 1.200,00" lado a lado é o que faz um zero a mais
 * saltar aos olhos antes de o dinheiro sair.
 *
 * Ordenado do maior para o menor: é onde o dono olha primeiro.
 */
export function agruparComissoes(linhas: readonly LinhaDeComissao[]): ComissaoPorPessoa[] {
  const porPessoa = new Map<string, ComissaoPorPessoa>()

  for (const l of linhas) {
    const atual = porPessoa.get(l.payeeId) ?? {
      payeeId: l.payeeId,
      nome: l.nome,
      quantidade: 0,
      total: 0,
      base: 0,
      iss: 0,
    }
    atual.quantidade += 1
    // Soma em centavos e volta: somar reais acumula resto binário, e o total da
    // pessoa passaria a diferir da soma das linhas que ela vê na tabela.
    atual.total = Math.round((atual.total + l.valor) * 100) / 100
    atual.base = Math.round((atual.base + l.base) * 100) / 100
    atual.iss = Math.round((atual.iss + l.iss) * 100) / 100
    porPessoa.set(l.payeeId, atual)
  }

  return [...porPessoa.values()].sort((a, b) => b.total - a.total)
}

/**
 * A explicação da conta, em uma linha, para a descrição da despesa.
 *
 * Existe porque o contas a pagar mostra descrição e valor, e "Comissão —
 * R$ 114,00" não deixa ninguém conferir nada. Com a base e a porcentagem
 * escritas junto, a pessoa refaz a conta de cabeça na hora da conversa — que é
 * exatamente quando ela é questionada.
 */
export function explicarComissao(
  c: Comissao,
  percentual: number,
  base: string = "TOTAL"
): string {
  const reais = (centavos: number) =>
    (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const pct = percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
  // Quando a base é só a mão de obra, dizer isso é obrigatório: sem o rótulo, a
  // pessoa lê "10% de R$ 200,00" numa OS de R$ 1.200 e conclui que o sistema
  // errou — quando ele fez exatamente o que a empresa configurou.
  const rotulo = base === "MAO_DE_OBRA" ? " de mão de obra" : ""
  if (c.issCentavos > 0) {
    return `${pct}% de R$ ${reais(c.baseCentavos)}${rotulo} (R$ ${reais(c.totalCentavos)} − R$ ${reais(c.issCentavos)} de imposto)`
  }
  return `${pct}% de R$ ${reais(c.baseCentavos)}${rotulo}`
}
