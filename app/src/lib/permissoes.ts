// A MATRIZ DE PERMISSOES do painel da plataforma.
//
// Mora separado de lib/admin.ts porque aquele importa o Prisma e o Supabase:
// qualquer modulo PURO que precise saber "este papel pode ver financeiro?"
// arrastaria o driver do Postgres junto. Foi o mesmo motivo que separou
// lib/recursos.ts de lib/plan.ts.
//
// Aqui so entram o tipo, a matriz e as duas perguntas que se faz a ela. Quem
// descobre QUEM esta logado continua em lib/admin.ts, que fala com o banco.

import type { PlatformRole } from "@/generated/prisma/client"
// ─── Permissões ──────────────────────────────────────────────────────────────
//
// A matriz inteira num lugar só, legível de cima a baixo. Mudar quem pode o
// quê é mudar uma linha aqui — não caçar checagem espalhada por dez arquivos.
//
// O raciocínio de cada área:
//   FINANCEIRO cuida de cobrança: libera quem pagou, corta quem não pagou, vê
//     MRR e relatório. NÃO entra na conta de cliente — não precisa dos dados
//     dele pra fazer o trabalho, e todo acesso a mais é exposição a mais.
//   COMERCIAL vende: vê crescimento e conversão, negocia e troca plano. Não
//     mexe em acesso nem entra em conta.
//   LOGISTICO dá suporte de uso: entra na conta pra ajudar o cliente. Não vê
//     financeiro nem mexe em cobrança.
//   TI investiga problema técnico: entra na conta e destrava cliente preso por
//     falha do sistema (foi o caso do webhook em 07/08). Não vê financeiro.
//   DONO faz tudo, e é o único que administra a própria equipe.

export type Permissao =
  | "verPainel"
  | "verFinanceiro"
  | "gerarRelatorio"
  | "liberarAcesso"
  | "cancelarAcesso"
  | "trocarPlano"
  // Conceder recurso avulso (Mapa GPS, NFS-e...) por cima do plano. Vai junto
  // de trocarPlano porque é estritamente MENOS poderoso: trocar pro Pro libera
  // tudo de uma vez; isto libera um item só.
  | "concederRecurso"
  // Ajustar os TETOS e o preço de uma empresa por cima do plano. Fica junto de
  // trocarPlano pelo mesmo motivo do concederRecurso — é menos poderoso que
  // mudar o plano inteiro. O preço é o que amarra: quem pode mexer no valor
  // cobrado é quem já podia trocar o plano e mudar o valor por essa via.
  | "alterarLimites"
  | "entrarNaConta"
  | "gerenciarEquipe"
  // Apagar um cadastro abandonado. SO DO DONO, e de proposito: e a unica acao
  // do painel que destroi dado em vez de mexer em acesso, nao tem desfazer, e
  // nao ha motivo operacional para financeiro ou comercial precisarem dela.
  | "apagarEmpresa"
  // Ler e responder duvida de cliente. Vai para LOGISTICO e TI, que sao os
  // papeis de suporte, e nao para FINANCEIRO nem COMERCIAL — a duvida carrega
  // o que a empresa esta tentando fazer no sistema, e isso nao e assunto de
  // quem cuida de cobranca ou de venda.
  | "atenderDuvida"

const PERMISSOES: Record<PlatformRole, Permissao[]> = {
  DONO: [
    "verPainel", "verFinanceiro", "gerarRelatorio", "liberarAcesso",
    "cancelarAcesso", "trocarPlano", "concederRecurso", "alterarLimites",
    "entrarNaConta", "gerenciarEquipe", "apagarEmpresa", "atenderDuvida",
  ],
  FINANCEIRO: ["verPainel", "verFinanceiro", "gerarRelatorio", "liberarAcesso", "cancelarAcesso", "trocarPlano", "concederRecurso", "alterarLimites"],
  COMERCIAL: ["verPainel", "verFinanceiro", "gerarRelatorio", "trocarPlano", "concederRecurso", "alterarLimites"],
  LOGISTICO: ["verPainel", "entrarNaConta", "atenderDuvida"],
  TI: ["verPainel", "liberarAcesso", "entrarNaConta", "atenderDuvida"],
}

export function papelPode(role: PlatformRole, permissao: Permissao): boolean {
  return PERMISSOES[role]?.includes(permissao) ?? false
}

export function permissoesDe(role: PlatformRole): Permissao[] {
  return PERMISSOES[role] ?? []
}
