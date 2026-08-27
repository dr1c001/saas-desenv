// Régua de cobrança: lembrar antes de vencer, cobrar depois de vencido.
//
// A empresa emite a receita com um vencimento e, hoje, alguém precisa lembrar
// de olhar a lista de vencidas e mandar mensagem uma por uma. Quase ninguém
// faz — e a conta que ninguém cobra é a conta que ninguém paga.
//
// ─── Por que uma escada só, com degraus negativos ────────────────────────────
//
// São dois comportamentos diferentes ("vence em 3 dias" e "venceu há 15") e a
// tentação é modelar dois: um lembrete e uma cobrança, cada um com o seu
// contador. Isso dá dois estados para manter em sincronia e a pergunta chata
// de "o lembrete que não saiu ainda deve sair depois do vencimento?".
//
// Um degrau é um NÚMERO DE DIAS EM RELAÇÃO AO VENCIMENTO. Antes é negativo,
// depois é positivo, e a régua inteira é uma lista ordenada. Um contador só,
// uma regra só, e a ordem sai de graça.
//
// ─── Por que CONTAR degraus em vez de comparar datas ─────────────────────────
//
// Mesma razão de lib/past-due.ts, e a razão de ele existir: o cron roda uma
// vez por dia e pode falhar num dia. Se a regra fosse "hoje é exatamente o
// 7º dia?", o degrau perdido nunca mais volta — a conta pula do 1º para o 15º
// e ninguém percebe, porque a falha é silenciosa.
//
// Contando quantos degraus já foram VENCIDOS e comparando com quantos já
// saíram, um dia perdido se recupera sozinho no dia seguinte.
//
// ─── Por que nasce DESLIGADA ─────────────────────────────────────────────────
//
// Esta é a única automação do sistema que manda mensagem de COBRANÇA, em nome
// da empresa, para o celular de terceiros. Errar aqui não é um e-mail a mais:
// é constranger um cliente que já pagou, ou cobrar quem nunca autorizou
// receber mensagem. Quem responde por isso é a empresa, não nós — então é ela
// que liga, sabendo o que está ligando.
//
// Módulo puro: a decisão de cobrar ou não precisa ser testável sem rede e sem
// banco. O efeito colateral fica no cron.

/**
 * A escada, em dias relativos ao vencimento. Negativo = antes de vencer.
 *
 * ORDEM CRESCENTE é obrigatória — a contagem de degraus vencidos depende
 * disso, e há um teste que trava a ordem.
 *
 * A escolha dos números: um lembrete três dias antes (dá tempo de pagar sem
 * atraso, que é o objetivo — cobrança que não precisa acontecer é a melhor
 * cobrança), o primeiro toque no dia seguinte ao vencimento (quando ainda é
 * "esqueci" e não "não vou pagar"), e depois espaçando. Cinco mensagens no
 * total, e nunca mais: passar de 30 dias vira perseguição, e a conta que
 * chegou lá precisa de uma pessoa, não de um cron.
 */
export const DEGRAUS_DA_REGUA = [-3, 1, 7, 15, 30] as const

/** O tom da mensagem. O texto muda, e a régua decide qual. */
export type TomDaCobranca = "lembrete" | "venceu" | "insistente" | "final"

export type ConfigRegua = {
  /** Chave-mestra. Desligada, nada sai, mesmo com o resto marcado. */
  ativo: boolean
  /** Os degraus negativos: "sua conta vence em 3 dias". */
  lembrarAntes: boolean
  /** Os degraus positivos: a cobrança propriamente dita. */
  cobrarDepois: boolean
  porWhatsapp: boolean
  porEmail: boolean
  /**
   * Abaixo deste valor, não cobra. `0` = cobra qualquer valor.
   *
   * Existe porque mandar mensagem de cobrança por R$ 8,00 custa mais em
   * relação com o cliente do que os R$ 8,00 valem. É a empresa que sabe onde
   * fica essa linha no ramo dela.
   */
  valorMinimo: number
}

/**
 * Padrão de quem nunca configurou: DESLIGADO, mas com tudo por dentro já
 * marcado. Assim ligar a chave-mestra é um clique só e o comportamento é o
 * esperado — em vez de ligar e não acontecer nada, que parece defeito.
 */
export const REGUA_PADRAO: ConfigRegua = {
  ativo: false,
  lembrarAntes: true,
  cobrarDepois: true,
  porWhatsapp: true,
  porEmail: true,
  valorMinimo: 0,
}

/** Lê o JSON gravado com tolerância: campo faltando cai no padrão. */
export function lerRegua(gravado: unknown): ConfigRegua {
  if (!gravado || typeof gravado !== "object") return REGUA_PADRAO
  const g = gravado as Record<string, unknown>
  const bool = (chave: keyof ConfigRegua) =>
    typeof g[chave] === "boolean" ? (g[chave] as boolean) : (REGUA_PADRAO[chave] as boolean)

  // Valor mínimo negativo é o mesmo que não ter mínimo, e um NaN vindo de um
  // campo de texto mal preenchido não pode desligar a régua por acidente.
  const minimo = Number(g.valorMinimo)
  return {
    ativo: bool("ativo"),
    lembrarAntes: bool("lembrarAntes"),
    cobrarDepois: bool("cobrarDepois"),
    porWhatsapp: bool("porWhatsapp"),
    porEmail: bool("porEmail"),
    valorMinimo: Number.isFinite(minimo) && minimo > 0 ? minimo : 0,
  }
}

/**
 * Dias entre o vencimento e hoje. Negativo antes de vencer.
 *
 * Compara DIAS DE CALENDÁRIO, e não milissegundos: uma conta que vence hoje
 * às 23h está vencendo hoje, e não "daqui a 0,96 dia". Sem isso, o degrau -3
 * dispararia ou não dependendo da hora em que o cron rodasse.
 */
export function diasDesdeVencimento(vencimento: Date, agora: Date): number {
  const soODia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((soODia(agora) - soODia(vencimento)) / 86_400_000)
}

export function tomDoDegrau(degrau: number): TomDaCobranca {
  if (degrau < 0) return "lembrete"
  if (degrau <= 1) return "venceu"
  return degrau >= DEGRAUS_DA_REGUA[DEGRAUS_DA_REGUA.length - 1] ? "final" : "insistente"
}

export type DecisaoCobranca = {
  enviar: boolean
  /** Quantos degraus já deviam ter saído. Vira o novo contador ao gravar. */
  total: number
  /** O degrau alcançado, quando há o que enviar. */
  degrau: number | null
  tom: TomDaCobranca | null
}

/**
 * "Não é pra enviar" preservando o contador.
 *
 * `total` é SEMPRE o valor certo pra gravar, em todos os caminhos — inclusive
 * nos que não enviam nada. A primeira versão devolvia `total: 0` aqui, e o
 * teste dia-a-dia pegou o estrago: quem gravasse o contador a cada passagem o
 * ZERAVA, e a régua recomeçava do primeiro degrau todo santo dia depois de ter
 * terminado. O cliente que não pagou receberia a cobrança final para sempre.
 *
 * Com o contador preservado aqui, o cron pode gravar sempre, sem condição — o
 * que é uma regra bem mais difícil de errar do que "grave só quando enviar".
 */
const naoEnviar = (total: number): DecisaoCobranca => ({
  enviar: false,
  total,
  degrau: null,
  tom: null,
})

/**
 * A regra inteira, num lugar só.
 *
 * `jaEnviadas` é o contador gravado na receita. `total` volta como o novo
 * valor — quem chama grava, e por isso a decisão é idempotente: rodar duas
 * vezes no mesmo dia não manda duas mensagens.
 */
export function decidirCobranca(entrada: {
  /** De diasDesdeVencimento(). Negativo antes de vencer. */
  dias: number
  jaEnviadas: number
  /** Receita já quitada não se cobra, e este é o guarda que garante isso. */
  paga: boolean
  valor: number
  config: ConfigRegua
}): DecisaoCobranca {
  const { dias, jaEnviadas, paga, valor, config } = entrada

  if (!config.ativo || paga) return naoEnviar(jaEnviadas)
  if (config.valorMinimo > 0 && valor < config.valorMinimo) return naoEnviar(jaEnviadas)
  if (!config.lembrarAntes && !config.cobrarDepois) return naoEnviar(jaEnviadas)
  if (!config.porWhatsapp && !config.porEmail) return naoEnviar(jaEnviadas)

  // Os degraus que o calendário já passou — independente do que a empresa
  // ligou. O contador conta POSIÇÃO na régua, e não mensagens enviadas: se
  // contasse mensagens, desligar "lembrarAntes" no meio do caminho faria a
  // conta pular um degrau para sempre.
  const total = DEGRAUS_DA_REGUA.filter((d) => dias >= d).length

  // `total < jaEnviadas` significa que o VENCIMENTO ANDOU PRA FRENTE: a
  // empresa renegociou e deu um prazo novo. O contador segue o calendário pra
  // trás e a régua recomeça — sem isso, uma conta renegociada ficaria com o
  // contador no fim da escada e nunca mais receberia lembrete nenhum, que é o
  // pior momento possível pra régua ficar muda.
  //
  // Sai daqui de graça, sem ninguém precisar lembrar de zerar o contador na
  // hora de editar a data.
  if (total <= jaEnviadas) return naoEnviar(total)

  // O degrau que estamos alcançando agora. Quando o cron falhou por dias e
  // vários degraus venceram de uma vez, manda UM — o mais recente — e não a
  // pilha inteira. Receber quatro cobranças no mesmo minuto é pior que ter
  // recebido três a menos.
  const degrau = DEGRAUS_DA_REGUA[total - 1]
  const tom = tomDoDegrau(degrau)

  // Aqui sim o que a empresa ligou decide o ENVIO. O contador já avançou
  // acima; este degrau simplesmente passa em silêncio.
  const ligado = degrau < 0 ? config.lembrarAntes : config.cobrarDepois
  if (!ligado) return { enviar: false, total, degrau, tom }

  return { enviar: true, total, degrau, tom }
}

/**
 * Monta o texto da mensagem.
 *
 * O aviso de "desconsidere se já pagou" vai em TODAS elas, e não só nas de
 * cobrança. Baixa de pagamento atrasa: o cliente paga na sexta, a empresa dá
 * baixa na segunda, e o cron rodou no sábado. Sem essa linha, a mensagem
 * acusa de caloteiro quem pagou em dia — e é o tipo de erro que o cliente não
 * esquece.
 */
export function textoDaCobranca(
  tom: TomDaCobranca,
  dados: { empresa: string; descricao: string; valor: string; vencimento: string; portalUrl?: string | null },
  t: (chave: string, vals?: Record<string, string>) => string
): string {
  const corpo = t(`reguaCobranca.${tom}`, {
    empresa: dados.empresa,
    descricao: dados.descricao,
    valor: dados.valor,
    vencimento: dados.vencimento,
  })
  const partes = [corpo, t("reguaCobranca.desconsidere")]
  if (dados.portalUrl) partes.push(`${t("reguaCobranca.detalhes")}: ${dados.portalUrl}`)
  return partes.join("\n\n")
}

export type CanaisDaCobranca = { whatsapp: boolean; email: boolean }

/** Por onde cobrar. Os dois falsos quando não é pra cobrar. */
export function canaisDaCobranca(
  config: ConfigRegua,
  disponivel: { whatsappConfigurado: boolean; temWhatsapp: boolean; temEmail: boolean }
): CanaisDaCobranca {
  if (!config.ativo) return { whatsapp: false, email: false }
  return {
    // Os três: a empresa ligou o canal, configurou a integração, e o cliente
    // tem o contato.
    whatsapp: config.porWhatsapp && disponivel.whatsappConfigurado && disponivel.temWhatsapp,
    email: config.porEmail && disponivel.temEmail,
  }
}
