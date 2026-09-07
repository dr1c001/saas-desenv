// Enviar um documento ao cliente por e-mail: orçamento e OS assinada.
//
// ─── O que o dono pediu ──────────────────────────────────────────────────────
//
// "poder enviar direto para o email do cliente cadastrado" (orçamento) e
// "na ordem de serviço, quando estiver completa e assinada, me dar a opção de
//  enviar direto por email do cliente, email que já está cadastrado".
//
// ─── Por que vai o LINK, e não o PDF anexo ───────────────────────────────────
//
// O PDF é renderizado dentro das rotas HTTP (`/api/pdf/quote/[id]`), que
// autenticam por cookie de sessão do navegador — não há função reutilizável
// para chamar do servidor. Extrair isso é refatoração grande, e o anexo teria
// custo próprio: o documento embute até seis fotos como base64, então um
// orçamento com fotos de celular vira um anexo de dezenas de megabytes.
//
// E o link é melhor para o que o e-mail existe: a página pública mostra o
// orçamento inteiro E tem os botões de aprovar e recusar. O PDF é papel; o
// link é a decisão.
//
// Módulo puro: quem recebe o e-mail é um terceiro, em nome da empresa. Cada
// regra aqui evita um e-mail que não dá para trazer de volta.

/**
 * Uma segunda tentativa dentro desta janela é clique duplo, não reenvio.
 *
 * Não há tabela de log de e-mail no sistema, e o SDK do Resend não devolve
 * nada que sirva de chave. A defesa possível é o próprio `sentAt`: quem clica
 * de novo em dez segundos não quis mandar dois e-mails.
 *
 * Reenvio DELIBERADO continua permitido — é pedido comum ("não chegou, manda
 * de novo") e travar isso seria inventar uma recusa que ninguém pediu.
 */
export const JANELA_DE_CLIQUE_DUPLO_MS = 30_000

export type ProblemaDeEnvio =
  /** O cliente cadastrado não tem e-mail. */
  | "semEmail"
  /** O endereço cadastrado não parece um e-mail. */
  | "emailInvalido"
  /** Sem token não há página pública para linkar. */
  | "semLink"
  /** Clicou duas vezes. */
  | "enviadoAgoraMesmo"
  /** OS que ainda não está pronta para ir ao cliente. */
  | "naoAssinada"

/**
 * Vale a pena mandar? `null` quando sim.
 *
 * A ordem das checagens é a ordem em que elas ajudam quem está na tela: o que
 * a pessoa consegue consertar primeiro (cadastrar o e-mail) vem antes do que
 * ela não controla.
 */
export function problemaNoEnvio(entrada: {
  email: string | null | undefined
  token: string | null | undefined
  enviadoEm: Date | null | undefined
  agora: Date
}): ProblemaDeEnvio | null {
  const { email, token, enviadoEm, agora } = entrada

  const limpo = (email ?? "").trim()
  if (!limpo) return "semEmail"
  if (!pareceEmail(limpo)) return "emailInvalido"
  // Sem token a página pública não existe, e o e-mail sairia com um link para
  // "/q/undefined" — que é o que acontece hoje no envio por WhatsApp.
  if (!token) return "semLink"

  if (enviadoEm && agora.getTime() - enviadoEm.getTime() < JANELA_DE_CLIQUE_DUPLO_MS) {
    return "enviadoAgoraMesmo"
  }
  return null
}

/**
 * A OS já pode ir para o cliente?
 *
 * "quando estiver completa E ASSINADA" é condição, não enfeite: a OS assinada é
 * o comprovante do serviço aceito, e mandar antes disso entrega ao cliente um
 * documento que ainda vai mudar.
 */
export function osPodeSerEnviada(entrada: {
  status: string
  assinaturaUrl: string | null | undefined
}): boolean {
  const concluida = entrada.status === "DONE" || entrada.status === "INVOICED"
  return concluida && !!entrada.assinaturaUrl
}

/**
 * Validação de e-mail deliberadamente frouxa.
 *
 * O objetivo é pegar o engano de digitação óbvio — o campo vazio, o telefone
 * colado no lugar do e-mail, o endereço sem arroba. Regra apertada demais
 * recusa endereço válido e esquisito, e aí a pessoa não consegue mandar para um
 * cliente que existe. Quem decide de verdade é o servidor de e-mail.
 */
export function pareceEmail(valor: string): boolean {
  const v = valor.trim()
  if (v.length < 5 || v.length > 254) return false
  if (/\s/.test(v)) return false
  const partes = v.split("@")
  if (partes.length !== 2) return false
  const [antes, depois] = partes
  if (!antes || !depois) return false
  // O domínio precisa de um ponto com algo dos dois lados.
  return /^[^.].*\.[^.]{2,}$/.test(depois)
}

/**
 * O texto do e-mail do orçamento.
 *
 * Vai em texto simples, na voz da empresa, porque é um documento comercial que
 * sai com o nome dela. Sem promessa que o sistema não cumpre ("responda este
 * e-mail") e sem jargão.
 *
 * O link vem por último e sozinho na linha: é a única coisa que a pessoa
 * precisa clicar, e enterrá-lo no meio de um parágrafo é a forma mais rápida de
 * ele não ser visto no celular.
 */
export function textoDoOrcamento(dados: {
  empresa: string
  numero: string
  cliente: string
  validade: Date | null
  link: string
}): string {
  const linhas = [
    `Olá, ${dados.cliente}.`,
    "",
    `Segue o orçamento ${dados.numero} da ${dados.empresa}.`,
  ]
  if (dados.validade) {
    linhas.push(`Válido até ${formatarData(dados.validade)}.`)
  }
  linhas.push(
    "",
    "Você pode ver o orçamento completo e responder pelo link abaixo:",
    dados.link,
    "",
    dados.empresa
  )
  return linhas.join("\n")
}

/** O texto do e-mail da OS concluída e assinada. */
export function textoDaOs(dados: {
  empresa: string
  numero: string
  cliente: string
  link: string
}): string {
  return [
    `Olá, ${dados.cliente}.`,
    "",
    `O serviço ${dados.numero} foi concluído e o comprovante já está assinado.`,
    "",
    "Você pode ver os detalhes pelo link abaixo:",
    dados.link,
    "",
    dados.empresa,
  ].join("\n")
}

/** Data no formato que o cliente final lê, no fuso do negócio. */
function formatarData(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}
