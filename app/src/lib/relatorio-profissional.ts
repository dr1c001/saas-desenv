// Desempenho por profissional no período.
//
// Responde "quem entregou o quê" — a pergunta que o dono faz na hora de
// distribuir serviço, discutir comissão e entender por que um mês rendeu menos
// que o outro.
//
// Duas decisões que mudam o número na tela:
//
// 1. O período conta por CONCLUSÃO, não por abertura. Serviço aberto em julho
//    e terminado em agosto é produção de agosto — é quando o trabalho foi
//    feito e quando o dinheiro entra na conversa.
//
// 2. Serviço sem responsável aparece como uma linha própria, não some. Se
//    sumisse, a soma da tela não bateria com o financeiro e o dono passaria a
//    desconfiar do relatório inteiro — com razão.
//
// Módulo puro: este relatório vira base de conversa sobre o trabalho de
// pessoas reais, então cada número precisa ser reproduzível num teste.

export type OsDoPeriodo = {
  technicianId: string | null
  totalAmount: number
  createdAt: Date
  concludedAt: Date
  npsScore: number | null
}

export type Profissional = {
  id: string
  name: string
  /**
   * Aparece na tabela mesmo sem ter concluído nada no período.
   *
   * Verdadeiro para quem atende em campo: "o Bruno não fechou nenhum serviço
   * em agosto" é exatamente o que o dono quer enxergar. Falso para o pessoal
   * administrativo, que viraria uma linha zerada permanente — e para o dono
   * que só às vezes pega um serviço, e nem por isso deve figurar como
   * improdutivo todo mês.
   */
  emCampo: boolean
}

export type LinhaProfissional = {
  /** null = serviço sem responsável atribuído. */
  id: string | null
  nome: string
  concluidas: number
  total: number
  ticketMedio: number
  /** Dias entre abertura e conclusão. null quando não concluiu nada. */
  diasMedios: number | null
  /** Média das notas do cliente. null quando ninguém avaliou. */
  nota: number | null
  /** Quantas avaliações entraram na média — "5,0" de uma resposta só não é 5,0. */
  respostas: number
}

const DIA = 86_400_000

/**
 * Monta as linhas do relatório.
 *
 * `pessoas` é a equipe inteira — serve de fonte dos nomes. Quem entra na
 * tabela com zero é só quem tem `emCampo`.
 */
export function agruparPorProfissional(
  ordens: OsDoPeriodo[],
  pessoas: Profissional[],
  rotuloSemResponsavel: string
): LinhaProfissional[] {
  type Acc = { total: number; concluidas: number; dias: number; somaNotas: number; respostas: number }
  const novo = (): Acc => ({ total: 0, concluidas: 0, dias: 0, somaNotas: 0, respostas: 0 })

  const porId = new Map<string | null, Acc>()
  for (const p of pessoas) if (p.emCampo) porId.set(p.id, novo())

  for (const os of ordens) {
    // Quem não está na lista de campo entra aqui: o dono que pegou um serviço,
    // e o técnico que já saiu da equipe. Nos dois casos o trabalho foi feito e
    // o dinheiro entrou — sumir com isso faria o total do período mudar
    // sozinho depois do fato.
    const acc = porId.get(os.technicianId) ?? novo()
    porId.set(os.technicianId, acc)

    acc.concluidas += 1
    acc.total += os.totalAmount
    // Data invertida existe em banco de verdade (importação, ajuste manual).
    // Contar negativo puxaria a média pra baixo e faria o profissional
    // parecer mais rápido do que foi.
    acc.dias += Math.max(0, os.concludedAt.getTime() - os.createdAt.getTime()) / DIA
    if (os.npsScore !== null) {
      acc.somaNotas += os.npsScore
      acc.respostas += 1
    }
  }

  const nomes = new Map(pessoas.map((p) => [p.id, p.name]))

  return Array.from(porId.entries())
    .map(([id, a]) => ({
      id,
      nome: id === null ? rotuloSemResponsavel : nomes.get(id) ?? rotuloSemResponsavel,
      concluidas: a.concluidas,
      total: arredondar(a.total, 2),
      ticketMedio: a.concluidas > 0 ? arredondar(a.total / a.concluidas, 2) : 0,
      diasMedios: a.concluidas > 0 ? arredondar(a.dias / a.concluidas, 1) : null,
      nota: a.respostas > 0 ? arredondar(a.somaNotas / a.respostas, 1) : null,
      respostas: a.respostas,
    }))
    // Quem produziu mais primeiro; entre iguais, ordem alfabética pra a tabela
    // não dançar de um carregamento pro outro.
    .sort((x, y) => y.total - x.total || y.concluidas - x.concluidas || x.nome.localeCompare(y.nome))
    // Linha sem responsável com zero serviço é ruído: só aparece se existir.
    .filter((l) => l.id !== null || l.concluidas > 0)
}

function arredondar(n: number, casas: number): number {
  const f = 10 ** casas
  return Math.round(n * f) / f
}
