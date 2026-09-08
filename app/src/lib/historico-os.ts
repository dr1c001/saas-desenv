// Histórico de alteração da ordem de serviço.
//
// O problema que isto resolve: até aqui existia log de auditoria do painel da
// plataforma, mas NENHUM dos dados do cliente. Quando aparecesse discussão —
// "esse valor não era esse", "quem cancelou?", "o técnico era outro" — não
// havia como saber quem mudou o quê nem quando. Numa empresa de serviço isso
// não é curiosidade: é a diferença entre resolver a discussão em um minuto e
// perder o cliente.
//
// Duas decisões que definem o que este módulo é:
//
// 1. **Nem toda mudança vira evento.** Registrar cada campo enterraria os que
//    importam no meio de ruído — e histórico que ninguém lê é o mesmo que não
//    ter histórico. Entram só os que geram disputa: status, responsável,
//    agendamento, valor, conclusão e garantia.
//
// 2. **O valor é guardado como texto.** Para os campos que têm código próprio
//    (status), o texto É o código, e a tela traduz. Para os demais, o texto já
//    vem legível — nome do técnico, valor formatado. Assim a linha do tempo
//    continua fazendo sentido mesmo depois de o técnico sair da empresa ou o
//    cliente ser renomeado.
//
// Módulo puro: o que decide se um evento é gravado precisa ser reproduzível
// num teste, porque um registro que não acontece não deixa rastro nenhum de
// que faltou.

export type TipoEvento =
  | "CRIADA"
  | "STATUS"
  | "RESPONSAVEL"
  | "AGENDAMENTO"
  | "VALOR"
  | "CONCLUSAO"
  | "GARANTIA"

export type Evento = {
  tipo: TipoEvento
  antes: string | null
  depois: string | null
}

/** O retrato da OS nos campos que interessam ao histórico. */
export type RetratoDaOs = {
  status: string
  /** Nome do responsável, não o id: o histórico tem que sobreviver ao desligamento. */
  responsavel: string | null
  /** ISO ou null. */
  agendadoEm: string | null
  valor: number
  conclusao: string | null
  garantiaDias: number | null
}

/**
 * Os eventos que a diferença entre dois retratos gera.
 *
 * Devolve lista vazia quando nada relevante mudou — salvar a OS sem tocar em
 * nada não polui a linha do tempo. É o que mantém o histórico legível: quem
 * abre quer ver as três coisas que aconteceram, não trinta linhas iguais.
 */
export function eventosDaMudanca(antes: RetratoDaOs, depois: RetratoDaOs): Evento[] {
  const eventos: Evento[] = []

  const comparar = (tipo: TipoEvento, a: string | null, b: string | null) => {
    // Trata "" e null como a mesma coisa: um campo limpo na tela chega como
    // string vazia, e registrar 'de "" para null' seria ruído puro.
    const na = a?.trim() || null
    const nb = b?.trim() || null
    if (na !== nb) eventos.push({ tipo, antes: na, depois: nb })
  }

  comparar("STATUS", antes.status, depois.status)
  comparar("RESPONSAVEL", antes.responsavel, depois.responsavel)
  comparar("AGENDAMENTO", antes.agendadoEm, depois.agendadoEm)

  // Valor comparado como NÚMERO, não como texto: "100" e "100.00" são o mesmo
  // dinheiro, e compará-los como string geraria um evento a cada gravação.
  if (arredondar(antes.valor) !== arredondar(depois.valor)) {
    eventos.push({
      tipo: "VALOR",
      antes: String(arredondar(antes.valor)),
      depois: String(arredondar(depois.valor)),
    })
  }

  // Do texto de conclusão o histórico guarda apenas QUE mudou, não o conteúdo:
  // são parágrafos inteiros, e duplicá-los aqui incharia a tabela sem ajudar
  // ninguém — o texto atual está na própria OS.
  const cA = antes.conclusao?.trim() || null
  const cB = depois.conclusao?.trim() || null
  if (cA !== cB) eventos.push({ tipo: "CONCLUSAO", antes: null, depois: null })

  const gA = antes.garantiaDias
  const gB = depois.garantiaDias
  if (gA !== gB) {
    eventos.push({
      tipo: "GARANTIA",
      antes: gA === null || gA === undefined ? null : String(gA),
      depois: gB === null || gB === undefined ? null : String(gB),
    })
  }

  return eventos
}

/** Os tipos em que `antes`/`depois` carregam um código a ser traduzido na tela. */
export const TIPOS_COM_CODIGO: readonly TipoEvento[] = ["STATUS"]

function arredondar(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}
