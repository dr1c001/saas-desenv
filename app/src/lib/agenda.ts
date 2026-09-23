// Reagendar arrastando na agenda.
//
// O que existia até aqui: a agenda era uma grade de LEITURA. Para mudar uma OS
// de dia, o usuário abria a OS, entrava em editar, mexia no campo de data e
// salvava — três telas para mover um card um dia adiante. Quem monta a agenda
// da semana faz isso dezenas de vezes, e o custo não está em nenhuma das telas
// isoladamente: está em ter que sair da visão que mostra o problema (a semana
// cheia) para resolver o problema.
//
// Módulo puro porque arrastar tem regras que precisam valer igual no navegador
// e no servidor. O navegador usa para decidir o que pode ser arrastado e o que
// fica preso; o servidor usa para decidir o que aceita. Se as duas cópias
// divergirem, a tela promete um movimento que o servidor recusa — ou pior,
// aceita um que a tela achava impossível.

/** Status que NÃO podem ser reagendados, e por quê. */
const TRAVADOS: Record<string, string> = {
  // Já aconteceu. Mudar a data de um serviço concluído não reagenda nada:
  // reescreve o passado, e o histórico da OS passa a mentir.
  DONE: "concluida",
  // Além do passado, tem NFS-e emitida com data vinculada.
  INVOICED: "faturada",
  // Não vai acontecer. Arrastar daria a impressão de que voltou à agenda.
  CANCELLED: "cancelada",
}

/** Pode arrastar? Devolve o motivo quando não. */
export function motivoParaNaoReagendar(status: string): string | null {
  return TRAVADOS[status] ?? null
}

export function podeReagendar(status: string): boolean {
  return motivoParaNaoReagendar(status) === null
}

/**
 * A data nova, preservando a HORA do agendamento original.
 *
 * Arrastar um card de dia responde "quando", não "que horas". O serviço das 14h
 * de quinta que vai para sexta continua sendo às 14h — zerar a hora
 * transformaria toda a agenda do dia em meia-noite, que é pior do que não ter
 * agendado.
 *
 * Construído com componentes locais de propósito: o usuário está pensando no
 * fuso dele, e "dia 12 às 14h" precisa ser 14h no relógio da empresa.
 */
export function comDiaTrocado(original: Date, ano: number, mes: number, dia: number): Date {
  return new Date(
    ano,
    mes - 1,
    dia,
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds()
  )
}

export type Agendado = {
  id: string
  /** Nome do responsável, ou null. Nome e não id: é o que a tela vai mostrar. */
  responsavel: string | null
  quando: Date
}

/** Duas OS do mesmo responsável a menos disto uma da outra são um conflito. */
export const MINUTOS_DE_CONFLITO = 60

/**
 * As OS que conflitam com o destino do arrasto.
 *
 * A OS não tem duração no modelo — só o instante do agendamento. Então isto
 * NÃO é uma checagem de sobreposição de fato; é o aviso honesto que os dados
 * permitem: "esta pessoa já tem outro serviço nesse horário". Inventar uma
 * duração padrão de uma hora para simular sobreposição daria falso alarme em
 * quem faz visitas de quinze minutos e silêncio em quem faz reforma de um dia.
 *
 * **Avisa, não impede.** Quem monta a agenda às vezes marca dois de propósito —
 * dois técnicos no mesmo endereço, ou um encaixe que ele sabe que cabe.
 * Bloquear seria o sistema achando que sabe mais que a pessoa que está olhando
 * para a rua.
 *
 * Sem responsável não há conflito possível: a OS ainda não é de ninguém.
 */
export function conflitos(agenda: Agendado[], movida: Agendado): Agendado[] {
  if (!movida.responsavel) return []

  const limite = MINUTOS_DE_CONFLITO * 60 * 1000
  return agenda.filter(
    (a) =>
      a.id !== movida.id &&
      a.responsavel === movida.responsavel &&
      Math.abs(a.quando.getTime() - movida.quando.getTime()) < limite
  )
}
