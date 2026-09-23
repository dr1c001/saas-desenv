// Os cargos de uma empresa de servico.
//
// Ate aqui existiam tres: OWNER, ADMIN e TECHNICIAN. Isso descrevia NIVEL DE
// ACESSO, nao funcao — e uma empresa de verdade tem atendimento, financeiro,
// logistica, gerente. Todos eles caiam em "tecnico" e enxergavam a mesma coisa.
//
// ─── Por que isto funciona sem reescrever permissao ──────────────────────────
//
// As tabelas TabPermission e ActionPermission ja tinham chave
// (tenantId, role, ...). Ou seja: o sistema SEMPRE soube guardar permissao por
// papel — so nunca existiu mais de um papel configuravel. Acrescentar cargos ao
// enum da a cada um o proprio conjunto de abas e acoes de graca, pela mesma
// tela de Permissoes.
//
// E o codigo ja tratava papel desconhecido do jeito seguro: `podeFazer` libera
// OWNER/ADMIN e manda o resto para a checagem, e `getAllowedTabs` consulta a
// tabela. Um cargo novo comeca sem nada, e nao com tudo.
//
// ─── O que NAO da para fazer so com o enum ───────────────────────────────────
//
// O padrao de quem nunca foi configurado era DEFAULT_TECHNICIAN_TABS, fixo. Um
// financeiro recem-convidado cairia nas abas do tecnico — veria ordens de
// servico e nao veria o financeiro. Por isso o padrao passa a ser POR CARGO,
// logo abaixo.

import type { TabSlug } from "./abas"

export type Cargo =
  | "OWNER"
  | "ADMIN"
  | "GERENTE"
  | "ATENDIMENTO"
  | "COMERCIAL"
  | "FINANCEIRO"
  | "LOGISTICA"
  | "TECHNICIAN"

/** Todos, na ordem em que fazem sentido numa lista: do mais amplo ao mais restrito. */
export const CARGOS: readonly Cargo[] = [
  "OWNER",
  "ADMIN",
  "GERENTE",
  "ATENDIMENTO",
  "COMERCIAL",
  "FINANCEIRO",
  "LOGISTICA",
  "TECHNICIAN",
]

/**
 * Quem manda em tudo, sem passar pela tela de Permissoes.
 *
 * Deliberadamente CURTA. Cada cargo aqui e um cargo cujo acesso ninguem
 * consegue restringir depois — e "gerente" parece candidato ate a primeira
 * empresa que quer um gerente que nao mexe na cobranca.
 */
export const CARGOS_ADMINISTRATIVOS: readonly Cargo[] = ["OWNER", "ADMIN"]

/**
 * Os que se pode dar a alguem ao convidar.
 *
 * OWNER fica de fora: e quem criou a conta, e nao um cargo que se distribui.
 * Ter dois donos e um problema de cobranca e de responsabilidade, nao de menu.
 */
export const CARGOS_ATRIBUIVEIS: readonly Cargo[] = CARGOS.filter((c) => c !== "OWNER")

/** Os que a tela de Permissoes configura. Os administrativos nao entram: nao ha
 *  o que configurar em quem ja pode tudo. */
export const CARGOS_CONFIGURAVEIS: readonly Cargo[] = CARGOS.filter(
  (c) => !CARGOS_ADMINISTRATIVOS.includes(c)
)

export function ehCargo(valor: string): valor is Cargo {
  return (CARGOS as readonly string[]).includes(valor)
}

export function ehAdministrativo(cargo: string): boolean {
  return (CARGOS_ADMINISTRATIVOS as readonly string[]).includes(cargo)
}

/**
 * As abas que cada cargo enxerga quando a empresa ainda nao configurou nada.
 *
 * Um padrao POR CARGO, e nao um padrao unico. Convidar um financeiro e ele
 * abrir o sistema em ordens de servico, sem ver o financeiro, faria a empresa
 * concluir que o cargo nao funciona — quando o que faltava era so a
 * configuracao que ela nem sabia existir.
 *
 * Sao sugestoes, nao regras: a tela de Permissoes muda qualquer uma. O criterio
 * foi o trabalho de cada cargo, e nao "quanto mais melhor" — menu curto e o que
 * faz a pessoa achar as coisas.
 */
export const ABAS_PADRAO: Record<Cargo, TabSlug[]> = {
  // Os administrativos nao usam esta tabela (veem tudo), mas estao aqui para o
  // tipo obrigar a lista a ficar completa quando um cargo novo entrar.
  OWNER: [],
  ADMIN: [],

  // Toca a operacao inteira. Fica de fora so a cobranca da assinatura, que e
  // a conta do dono com o ServicoOS, e nao trabalho da empresa.
  GERENTE: [
    "dashboard",
    "clients",
    "service-orders",
    "quotes",
    "contracts",
    "schedule",
    "history",
    "maintenance",
    "map",
    "finance",
    "receipts",
    "parts",
    "purchases",
    "providers",
    "team",
    "reports",
  ],

  // Atende o cliente: abre chamado, agenda, consulta o que ja foi feito.
  ATENDIMENTO: ["dashboard", "clients", "service-orders", "schedule", "history", "quotes"],

  // Vende: orcamento, cliente, contrato recorrente.
  COMERCIAL: ["dashboard", "clients", "quotes", "contracts", "history"],

  // Dinheiro entrando e saindo, mais a nota fiscal.
  FINANCEIRO: ["dashboard", "finance", "receipts", "fiscal", "clients", "reports", "history"],

  // Peca, compra e fornecedor. Ve ordens de servico porque e delas que sai o
  // consumo de peca.
  LOGISTICA: ["dashboard", "parts", "purchases", "providers", "service-orders"],

  // O que ja era o padrao antes de existirem cargos. Nao mexer nisto: toda
  // empresa que ja usa o sistema tem tecnicos configurados por este valor.
  TECHNICIAN: ["dashboard", "service-orders", "schedule"],
}

/** As abas sugeridas para um cargo. Papel desconhecido nao vira "tudo": vira o
 *  padrao do tecnico, que e o mais restrito dos operacionais. */
export function abasPadraoDe(cargo: string): TabSlug[] {
  return ABAS_PADRAO[cargo as Cargo] ?? ABAS_PADRAO.TECHNICIAN
}
