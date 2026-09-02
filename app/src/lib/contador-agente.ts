// O CONFERENTE DO BALANÇO — o "agente de contabilidade".
//
// ─── Por que ele é REGRA, e não modelo de linguagem ──────────────────────────
//
// O sistema já tem uma assistente de IA (lib/ia/). Este conferente NÃO usa ela,
// e a escolha é deliberada:
//
//   1. Ele fala sobre DINHEIRO. Um modelo que erra um número num balanço erra
//      com a mesma confiança com que acerta, e quem lê não tem como saber qual
//      foi. Regra escrita erra de um jeito que o teste pega.
//   2. Ele precisa funcionar para TODO MUNDO. A assistente é adicional pago e
//      depende de chave de API; o conferente roda no Starter, sem chave, de
//      graça — que é justamente onde está a empresa que não tem contador de
//      plantão para perguntar.
//   3. O que ele faz é CONFERÊNCIA, não conversa: uma lista fechada de coisas
//      que costumam estar erradas, cada uma com o número que a denuncia. Isso é
//      exatamente o que regra faz melhor que texto gerado.
//
// O que ele NÃO faz, e não vai fazer: assinar balanço, dizer qual regime
// tributário adotar, ou substituir o contador. Contabilidade é atividade
// regulamentada no Brasil, e o balanço legal é peça que um profissional
// habilitado assina. Este conferente prepara a conversa com esse profissional —
// ele é o colega que olha a planilha antes de você mandar, e aponta o que vai
// voltar com pergunta.
//
// Módulo puro.

import type { Balanco } from "@/lib/balanco"

export type Gravidade = "impede" | "atencao" | "informa"

export type Achado = {
  /** Chave de tradução da mensagem. */
  chave: string
  gravidade: Gravidade
  /** Números que a mensagem traduzida interpola. */
  dados?: Record<string, number>
  /** Para onde ir para resolver. */
  ir?: string
}

/** O que o conferente precisa saber além do balanço montado. */
export type FatosDaEmpresa = {
  /** Peças com saldo em estoque e SEM preço de custo cadastrado. */
  pecasSemCusto: number
  /** Contas a receber vencidas há mais de `DIAS_RECEBIVEL_VELHO`. */
  recebiveisVelhos: { quantidade: number; valor: number }
  /** Bens cadastrados (não baixados). */
  bens: number
  /** Bens sem nenhuma nota/anexo. */
  bensSemNota: number
  /** Bens ativos já totalmente depreciados. */
  bensZerados: number
  /** A empresa informou o caixa inicial? Zero informado É informar. */
  caixaInicialInformado: boolean
  /** Movimento financeiro já registrado — separa empresa nova de empresa vazia. */
  temMovimento: boolean
}

/**
 * 180 dias.
 *
 * Não é prazo legal — é o ponto a partir do qual um recebível deixa de ser
 * "atrasado" e passa a ser "provavelmente perdido", e continuar somando ele no
 * ativo pelo valor cheio infla o patrimônio. O contador chama isso de provisão
 * para devedores duvidosos; aqui o conferente só aponta o número para ele.
 */
export const DIAS_RECEBIVEL_VELHO = 180

/** Peso para ordenar: o que impede vem antes do que só informa. */
const PESO: Record<Gravidade, number> = { impede: 0, atencao: 1, informa: 2 }

export function conferirBalanco(b: Balanco, f: FatosDaEmpresa): Achado[] {
  const achados: Achado[] = []

  // ─── Trava de programação, e não conferência de contabilidade ──────────────
  // A identidade fecha por construção (o PL sai por diferença). Se ela quebrar,
  // o defeito é daqui — e é grave o bastante para aparecer antes de tudo.
  if (!b.fecha) {
    achados.push({ chave: "naoFecha", gravidade: "impede" })
  }

  // ─── Caixa negativo ────────────────────────────────────────────────────────
  // O caso mais comum de todos, e quase nunca é dinheiro: é uma empresa que já
  // existia antes do sistema e nunca informou quanto tinha no dia em que
  // começou. O sistema soma o movimento desde então, e o movimento sozinho fica
  // negativo no primeiro mês em que se paga mais do que se recebe.
  if (b.caixa < 0) {
    achados.push({
      chave: f.caixaInicialInformado ? "caixaNegativoComInicial" : "caixaNegativoSemInicial",
      gravidade: "impede",
      dados: { caixa: b.caixa },
      ir: "/balanco",
    })
  }

  // ─── Patrimônio líquido negativo ───────────────────────────────────────────
  // Só quando o caixa está de pé. Com caixa negativo o PL negativo é ECO do
  // mesmo defeito, e apontar os dois faria o dono perseguir duas causas quando
  // há uma — que é como uma lista de conferência perde a credibilidade.
  if (b.caixa >= 0 && b.patrimonioLiquido < 0) {
    achados.push({
      chave: "plNegativo",
      gravidade: "impede",
      dados: { pl: b.patrimonioLiquido, passivo: b.passivo, ativo: b.ativo },
    })
  }

  // ─── Capital social ────────────────────────────────────────────────────────
  // Sem ele, TODO o patrimônio aparece como resultado acumulado — como se a
  // empresa tivesse nascido do nada e lucrado tudo. É a primeira pergunta que o
  // contador faz.
  if (b.capitalSocial === 0 && b.patrimonioLiquido !== 0) {
    achados.push({ chave: "semCapitalSocial", gravidade: "atencao", ir: "/balanco" })
  }

  // ─── Estoque subavaliado ───────────────────────────────────────────────────
  // Peça com saldo e sem preço de custo entra no balanço valendo ZERO. O
  // estoque existe na prateleira e não existe no ativo.
  if (f.pecasSemCusto > 0) {
    achados.push({
      chave: "estoqueSemCusto",
      gravidade: "atencao",
      dados: { pecas: f.pecasSemCusto },
      ir: "/parts",
    })
  }

  // ─── Recebível velho ───────────────────────────────────────────────────────
  if (f.recebiveisVelhos.quantidade > 0) {
    achados.push({
      chave: "recebivelVelho",
      gravidade: "atencao",
      dados: {
        quantidade: f.recebiveisVelhos.quantidade,
        valor: f.recebiveisVelhos.valor,
        dias: DIAS_RECEBIVEL_VELHO,
      },
      ir: "/finance",
    })
  }

  // ─── Nenhum bem cadastrado ─────────────────────────────────────────────────
  // Só faz sentido perguntar a quem já usa o sistema: numa empresa recém-criada
  // não haver bem ainda é normal, e o aviso seria ruído no primeiro dia.
  if (f.bens === 0 && f.temMovimento) {
    achados.push({ chave: "semBens", gravidade: "informa", ir: "/bens" })
  }

  if (f.bensSemNota > 0) {
    achados.push({
      chave: "bemSemNota",
      gravidade: "informa",
      dados: { bens: f.bensSemNota },
      ir: "/bens",
    })
  }

  if (f.bensZerados > 0) {
    achados.push({
      chave: "bemZerado",
      gravidade: "informa",
      dados: { bens: f.bensZerados },
      ir: "/bens",
    })
  }

  // ─── A depreciação não está no Financeiro ──────────────────────────────────
  // Ela reduz o patrimônio AQUI e não aparece como despesa LÁ, porque não saiu
  // dinheiro nenhum. Quem compara as duas telas estranha — e estranhar sem
  // explicação vira desconfiança do sistema inteiro.
  const depreciacao = achaDepreciacao(b)
  if (depreciacao > 0) {
    achados.push({ chave: "depreciacaoForaDoCaixa", gravidade: "informa", dados: { depreciacao } })
  }

  return achados.sort((a, z) => PESO[a.gravidade] - PESO[z.gravidade])
}

/** A depreciação já montada no balanço, de volta ao positivo. */
function achaDepreciacao(b: Balanco): number {
  const grupo = b.grupos.find((g) => g.grupo === "ATIVO_NAO_CIRCULANTE")
  const linha = grupo?.linhas.find((l) => l.automatica && l.chave === "depreciacao")
  return linha ? Math.abs(linha.valor) : 0
}

/** Um resumo de uma linha, para o topo da conferência. */
export function veredito(achados: readonly Achado[]): "impede" | "atencao" | "ok" {
  if (achados.some((a) => a.gravidade === "impede")) return "impede"
  if (achados.some((a) => a.gravidade === "atencao")) return "atencao"
  return "ok"
}
