// Aviso automático ao cliente final: quando manda, por onde, e o que diz.
//
// É o recurso que o cliente final mais comenta — saber que o técnico está a
// caminho evita a ligação "vocês vêm hoje?" e o cliente esperando em casa sem
// saber. Mas é também o mais fácil de errar feio: mandar mensagem no celular
// de gente que não pediu, em nome de uma empresa que não escolheu isso.
//
// Por isso NASCE DESLIGADO. A empresa liga se quiser, e escolhe em quais
// momentos. Não é uma decisão que o sistema toma por ela — quem responde por
// mensagem indesejada ao cliente final é ela, não nós.
//
// Módulo puro: a decisão de mandar ou não precisa ser testável sem rede.

export type MomentoAviso = "aCaminho" | "concluido"

export type ConfigAviso = {
  /** Chave-mestra. Desligada, nada sai, mesmo com os momentos marcados. */
  ativo: boolean
  /** Quando o serviço começa — o "estamos a caminho". */
  aCaminho: boolean
  /** Quando o serviço termina. */
  concluido: boolean
  porWhatsapp: boolean
  porEmail: boolean
}

/**
 * Padrão de quem nunca configurou: DESLIGADO, mas com os momentos e canais já
 * marcados. Assim, ligar a chave-mestra é um clique só e o comportamento é o
 * esperado — em vez de ligar e não acontecer nada, que parece defeito.
 */
export const CONFIG_PADRAO: ConfigAviso = {
  ativo: false,
  aCaminho: true,
  concluido: true,
  porWhatsapp: true,
  porEmail: false,
}

/**
 * Lê o Json gravado no Tenant.
 *
 * Roda no caminho de toda mudança de status: Json malformado não pode
 * derrubar a conclusão de uma OS. No pior caso, cai no padrão — que é não
 * mandar nada, o lado seguro do erro.
 */
export function lerConfig(gravado: unknown): ConfigAviso {
  if (!gravado || typeof gravado !== "object" || Array.isArray(gravado)) return CONFIG_PADRAO
  const b = gravado as Record<string, unknown>
  const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao)
  return {
    ativo: bool(b.ativo, CONFIG_PADRAO.ativo),
    aCaminho: bool(b.aCaminho, CONFIG_PADRAO.aCaminho),
    concluido: bool(b.concluido, CONFIG_PADRAO.concluido),
    porWhatsapp: bool(b.porWhatsapp, CONFIG_PADRAO.porWhatsapp),
    porEmail: bool(b.porEmail, CONFIG_PADRAO.porEmail),
  }
}

/** Qual momento corresponde a uma mudança de status — null se nenhum. */
export function momentoDoStatus(anterior: string, novo: string): MomentoAviso | null {
  // Só na TRANSIÇÃO: reabrir e fechar de novo uma OS não deve disparar uma
  // segunda mensagem "concluído" pro mesmo cliente.
  if (anterior === novo) return null
  if (novo === "IN_PROGRESS") return "aCaminho"
  if (novo === "DONE") return "concluido"

  // INVOICED conta como conclusão quando a OS NÃO passou por DONE antes.
  //
  // completeServiceOrder com "faturar agora" vai direto de OPEN/IN_PROGRESS
  // para INVOICED e nunca encosta em DONE — e o comentário do cron de NPS já
  // registrava que "na prática, a maioria das OS concluídas em produção está
  // em INVOICED". Sem esta linha, justamente o caminho mais usado não avisa
  // ninguém.
  //
  // A condição `anterior !== "DONE"` é o que impede o aviso duplicado: quem
  // concluiu e faturou depois já foi avisado na conclusão.
  if (novo === "INVOICED" && anterior !== "DONE") return "concluido"

  return null
}

export type Canais = { whatsapp: boolean; email: boolean }

/**
 * Decide por onde avisar. Devolve os dois falsos quando não é pra avisar.
 *
 * `temWhatsapp`/`temEmail` são a realidade do cadastro: o canal pode estar
 * ligado na configuração e o cliente simplesmente não ter aquele contato.
 */
export function canaisDoAviso(
  config: ConfigAviso,
  momento: MomentoAviso | null,
  disponivel: { whatsappConfigurado: boolean; temWhatsapp: boolean; temEmail: boolean }
): Canais {
  const nada = { whatsapp: false, email: false }
  if (!config.ativo || !momento) return nada
  if (momento === "aCaminho" && !config.aCaminho) return nada
  if (momento === "concluido" && !config.concluido) return nada

  return {
    // Precisa dos três: a empresa ligou o canal, ela configurou a integração,
    // e o cliente tem o número.
    whatsapp: config.porWhatsapp && disponivel.whatsappConfigurado && disponivel.temWhatsapp,
    email: config.porEmail && disponivel.temEmail,
  }
}

/** Monta o texto da mensagem. Sem link quando não há portal. */
export function textoDoAviso(
  momento: MomentoAviso,
  dados: { empresa: string; osNumero: string; titulo: string; portalUrl?: string | null },
  t: (chave: string, vals?: Record<string, string>) => string
): string {
  const corpo = t(`avisoCliente.${momento}`, {
    empresa: dados.empresa,
    os: dados.osNumero,
    titulo: dados.titulo,
  })
  return dados.portalUrl ? `${corpo}\n\n${t("avisoCliente.acompanhe")}: ${dados.portalUrl}` : corpo
}
