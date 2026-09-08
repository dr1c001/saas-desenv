// Permissão por AÇÃO, um degrau abaixo da permissão por aba.
//
// O que existia: acesso por aba. Quem enxerga "Ordens de Serviço" faz tudo
// dentro dela. Levantando o que o TÉCNICO consegue de fato hoje, quase tudo já
// era OWNER/ADMIN — excluir, financeiro, orçamento, estoque, equipe. Sobraram
// oito coisas sem barreira nenhuma, e uma delas pesa muito mais que as outras:
//
//   updateServiceOrder reescreve os ITENS e o VALOR TOTAL da OS.
//
// Ou seja: hoje qualquer técnico com a aba de OS muda o preço de um serviço
// já executado. Não é hipótese de segurança distante — é a discussão real que
// aparece quando o faturamento do mês não bate com o que foi combinado.
//
// Módulo PURO pelo mesmo motivo de lib/recursos.ts e lib/abas.ts: a tela de
// Permissões é componente de cliente e precisa da lista; importar de um módulo
// que fala com o Prisma arrastaria o driver do Postgres para o navegador e o
// build quebraria com "Can't resolve 'dns'".

/**
 * As ações configuráveis.
 *
 * Só entra aqui o que o técnico JÁ consegue fazer hoje. Ação que sempre foi
 * OWNER/ADMIN continua onde está: trazer para cá sugeriria que dá para liberar,
 * e a tela passaria a oferecer um botão que não deveria existir.
 */
export type Acao =
  | "os.criar"
  | "os.editar" // inclui os itens e o valor total — a de maior peso
  | "os.status"
  | "os.concluir"
  | "os.reagendar"
  | "os.checklist"
  | "cliente.criar"
  | "cliente.equipamento"

/** Fonte única. A tela de Permissões monta a lista a partir daqui. */
export const ACOES: readonly Acao[] = [
  "os.criar",
  "os.editar",
  "os.status",
  "os.concluir",
  "os.reagendar",
  "os.checklist",
  "cliente.criar",
  "cliente.equipamento",
]

/**
 * O que o técnico pode quando a empresa nunca mexeu nisso: **tudo**.
 *
 * É exatamente o comportamento de hoje. Um padrão mais fechado seria mais
 * seguro no papel e péssimo na prática: toda empresa que já usa o sistema
 * chegaria na segunda-feira com os técnicos sem conseguir trabalhar, sem ter
 * pedido mudança nenhuma. Fechar é decisão do dono, tomada por ele, na tela.
 */
export const ACOES_PADRAO_TECNICO: readonly Acao[] = ACOES

export function ehAcao(valor: string): valor is Acao {
  return (ACOES as readonly string[]).includes(valor)
}

/**
 * Pode fazer?
 *
 * OWNER e ADMIN passam sempre. A configuração existe para descrever o que o
 * técnico faz, e um dono que se trancasse para fora da própria empresa não
 * teria por onde voltar — a tela que conserta também é dele.
 */
export function podeFazer(
  role: string,
  permitidas: readonly Acao[],
  acao: Acao
): boolean {
  if (role === "OWNER" || role === "ADMIN") return true
  return permitidas.includes(acao)
}

/**
 * As ações valendo, dado o que está gravado.
 *
 * `configurado` é o que separa "nunca mexeram nisso" de "mexeram e não
 * liberaram nada". Sem esse sinal, a lista vazia teria dois significados
 * opostos e o sistema escolheria o errado: desmarcar tudo na tela devolveria
 * o padrão — que é TUDO liberado. É o defeito que a permissão por ABA tinha, e
 * que não valia a pena repetir aqui.
 */
export function acoesValendo(configurado: boolean, gravadas: readonly Acao[]): readonly Acao[] {
  return configurado ? gravadas : ACOES_PADRAO_TECNICO
}
