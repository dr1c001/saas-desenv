// Os avisos que o DONO DA PLATAFORMA recebe no celular.
//
// Não confundir com lib/notificacoes.ts, que é o catálogo de avisos que a
// EMPRESA CLIENTE recebe sobre o trabalho dela (OS atribuída, orçamento
// aprovado). Aqui é o contrário: são fatos sobre o negócio de quem vende o
// sistema — empresa nova entrou, assinatura caiu.
//
// Módulo PURO: sem prisma, sem rede. O lado sujo mora em avisar-plataforma.ts.
//
// ─── Por que cada aviso carrega uma PERMISSÃO ────────────────────────────────
//
// A equipe da plataforma tem papéis (lib/permissoes.ts): FINANCEIRO cuida de
// cobrança, LOGISTICO dá suporte, COMERCIAL vende. Mandar "a assinatura da
// Livela venceu" para quem não pode ver financeiro é vazar dado de cobrança
// pelo caminho mais silencioso que existe — a tela de bloqueio do celular.
//
// Hoje a equipe é uma pessoa só (o fundador, que pode tudo), então nada disso
// muda comportamento agora. Existe para o dia em que ele contratar alguém, que
// é justamente o dia em que ninguém vai lembrar de revisar isto.

import type { Permissao } from "@/lib/permissoes"

export type AvisoDaPlataforma =
  | "novaEmpresa"
  | "assinaturaEmAtraso"
  | "assinaturaCancelada"
  | "duvidaNova"
  /** Só o botão de teste do painel. Não tem gatilho automático. */
  | "testeDeAviso"

export const AVISOS: readonly AvisoDaPlataforma[] = [
  "novaEmpresa",
  "assinaturaEmAtraso",
  "assinaturaCancelada",
  "duvidaNova",
  "testeDeAviso",
]

/** Quem pode receber cada aviso. */
export const PERMISSAO_DO_AVISO: Record<AvisoDaPlataforma, Permissao> = {
  novaEmpresa: "verPainel",
  // Dinheiro só para quem cuida de dinheiro.
  assinaturaEmAtraso: "verFinanceiro",
  assinaturaCancelada: "verFinanceiro",
  // Quem atende duvida, e nao quem ve dinheiro.
  duvidaNova: "atenderDuvida",
  testeDeAviso: "verPainel",
}

/**
 * Avisos que ACORDAM o aparelho.
 *
 * Empresa nova é boa notícia e pode esperar a pessoa olhar o celular. Dinheiro
 * caindo tem janela: o acesso do cliente é cortado depois da carência, e ligar
 * no mesmo dia é o que recupera a assinatura. Marcar tudo como urgente é o
 * mesmo que não marcar nada.
 */
export const INSISTENTE: ReadonlySet<AvisoDaPlataforma> = new Set([
  "assinaturaEmAtraso",
  "assinaturaCancelada",
  // O cliente perguntou e parou de trabalhar por causa disso.
  "duvidaNova",
])

/**
 * A CHAVE do aviso — a reivindicação de "este fato já foi avisado".
 *
 * ─── Por que ela não é a mesma coisa que a etiqueta ──────────────────────────
 *
 * A etiqueta (`tag`) é do aparelho: duas notificações com a mesma etiqueta se
 * substituem na barra. A CHAVE é do banco, e é gravada antes do envio: gravar
 * a mesma duas vezes é impossível, e é isso que impede o aviso repetido.
 *
 * Elas precisam ser DIFERENTES entre atraso e cancelamento, e isso não é
 * detalhe. Com uma chave compartilhada por empresa, o cancelamento — que chega
 * depois do atraso — encontraria a linha já gravada e seria engolido em
 * silêncio. O dono saberia que o cliente atrasou e nunca que ele foi embora,
 * que é exatamente a metade que importa.
 *
 * O atraso carrega o FIM DO PERÍODO porque ele se repete de mês em mês: a
 * mesma assinatura pode atrasar em março e de novo em abril, e os dois são
 * fatos novos. O cancelamento não leva data porque acontece uma vez só.
 */
export function chaveDoAviso(
  evento: AvisoDaPlataforma,
  dados: {
    tenantId?: string | null
    subscriptionId?: string | null
    fimDoPeriodo?: Date | null
    duvidaId?: string | null
    mensagemId?: string | null
  }
): string {
  const periodo = dados.fimDoPeriodo ? dados.fimDoPeriodo.toISOString().slice(0, 10) : "sem-data"
  switch (evento) {
    case "novaEmpresa":
      return `novaEmpresa:${dados.tenantId ?? "?"}`
    case "assinaturaEmAtraso":
      return `atraso:${dados.subscriptionId ?? "?"}:${periodo}`
    case "assinaturaCancelada":
      return `cancelamento:${dados.subscriptionId ?? "?"}`
    case "duvidaNova":
      // Pela MENSAGEM, e não pela conversa: a mesma conversa recebe pergunta de
      // volta depois da resposta, e cada uma delas é um fato novo que o dono
      // precisa saber. Chavear pela conversa avisaria só a primeira.
      return `duvida:${dados.mensagemId ?? dados.duvidaId ?? "?"}`
    case "testeDeAviso":
      // O teste NUNCA é único: o dono precisa poder apertar o botão de novo
      // amanhã para conferir se o cano continua de pé.
      return `teste:${dados.tenantId ?? Math.random().toString(36).slice(2)}`
  }
}

/** O aviso pronto para o aparelho. */
export type AvisoMontado = {
  title: string
  body: string
  tag: string
  url: string
  requireInteraction: boolean
}

export type DadosDoAviso = {
  tenantId?: string | null
  empresa?: string | null
  plano?: string | null
  valor?: number | null
  indicador?: string | null
  /** Só na dúvida: para onde o toque leva, e o que a linha diz. */
  duvidaId?: string | null
  /** O resumo da pergunta, já cortado (ver lib/duvida.ts). */
  pergunta?: string | null
  /** Quem perguntou — a PESSOA, dentro da empresa. */
  quem?: string | null
}

/**
 * Monta o texto que chega no celular.
 *
 * `traduzir` recebe a chave e os valores — quem chama passa o `t` do next-intl.
 * Nenhum texto é escrito aqui: o aviso é a única coisa que o dono lê do
 * sistema quando está longe dele, e texto solto em código não passa por
 * revisão de idioma nenhuma.
 *
 * ─── O que NÃO vai no corpo ──────────────────────────────────────────────────
 *
 * Nada de cliente final das empresas: nome, telefone, endereço. O aviso aparece
 * na tela de bloqueio, que qualquer um por perto lê, e dado pessoal de terceiro
 * ali é vazamento sem nenhum ganho — o dono não decide nada com esse dado.
 * O que vai é o nome da EMPRESA cliente, o plano e o valor da assinatura.
 */
export function montarAviso(
  evento: AvisoDaPlataforma,
  dados: DadosDoAviso,
  traduzir: (chave: string, valores?: Record<string, string | number>) => string
): AvisoMontado {
  const empresa = dados.empresa ?? "—"

  const corpo = () => {
    switch (evento) {
      case "novaEmpresa":
        return dados.indicador
          ? traduzir("novaEmpresa.bodyIndicada", { empresa, indicador: dados.indicador })
          : traduzir("novaEmpresa.body", { empresa })
      case "assinaturaEmAtraso":
        return dados.valor != null
          ? traduzir("assinaturaEmAtraso.bodyComValor", {
              empresa,
              plano: dados.plano ?? "—",
              valor: dados.valor,
            })
          : traduzir("assinaturaEmAtraso.body", { empresa })
      case "assinaturaCancelada":
        return traduzir("assinaturaCancelada.body", { empresa, plano: dados.plano ?? "—" })
      case "duvidaNova":
        // A PERGUNTA no corpo, e não "você tem uma dúvida nova": metade delas o
        // dono responde de cabeça, e ler a pergunta na tela de bloqueio já diz
        // se dá para esperar ou se é agora.
        return traduzir("duvidaNova.body", {
          empresa,
          quem: dados.quem ?? "—",
          pergunta: dados.pergunta ?? "",
        })
      case "testeDeAviso":
        return traduzir("testeDeAviso.body")
    }
  }

  return {
    title: traduzir(`${evento}.title`),
    body: corpo(),
    // A etiqueta agrupa por EVENTO, e não por empresa: três empresas atrasando
    // na mesma semana devem virar três linhas, não uma substituindo a outra.
    tag: `plataforma:${evento}:${dados.tenantId ?? "geral"}`,
    url: destinoDoAviso(evento, dados),
    requireInteraction: INSISTENTE.has(evento),
  }
}

/**
 * Para onde o toque na notificação leva.
 *
 * A dúvida abre a CONVERSA, e não a linha da empresa: quem toca num aviso de
 * pergunta quer ler a pergunta, não gerenciar o plano de quem perguntou.
 *
 * Os demais usam `?q=`, que é o parâmetro que a busca do painel realmente lê
 * (src/app/admin/page.tsx). Um nome inventado seria ignorado em silêncio e o
 * dono cairia na lista inteira, tendo que procurar a empresa à mão — que é o
 * trabalho que o aviso existe para poupar.
 */
export function destinoDoAviso(
  evento: AvisoDaPlataforma,
  dados: { tenantId?: string | null; duvidaId?: string | null }
): string {
  if (evento === "duvidaNova") {
    return dados.duvidaId ? `/admin/duvidas/${dados.duvidaId}` : "/admin/duvidas"
  }
  return dados.tenantId ? `/admin?q=${encodeURIComponent(dados.tenantId)}` : "/admin"
}
