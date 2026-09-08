// Página de status pública: a parte que decide o que mostrar.
//
// O limite que define este módulo: **uma página de status hospedada na própria
// infraestrutura não consegue reportar a própria queda.** Se a Vercel cair,
// esta página cai junto e ninguém vê nada. Ela não substitui o monitor
// externo — cobre o caso mais comum, que é o sistema estar NO AR com alguma
// coisa quebrada por dentro.
//
// Por isso aqui só entra o que de fato se mede. Nada de "99,98% de
// disponibilidade": ninguém mede disponibilidade HTTP daqui de dentro, e
// número inventado numa página de status é pior que página nenhuma — é uma
// promessa que o cliente vai cobrar.
//
// O que se mede de verdade: se as tarefas automáticas rodaram, dia a dia.
// Isso é registro próprio, verificável, e é justamente o que o cliente não
// consegue enxergar sozinho.

export type EstadoDoDia = "ok" | "falhou" | "sem-registro"

export type Dia = {
  /** AAAA-MM-DD, em UTC — a mesma base do agendamento do cron. */
  data: string
  estado: EstadoDoDia
}

export type ExecucaoCrua = {
  startedAt: Date
  ok: boolean
}

/**
 * Os últimos N dias, do mais antigo para o mais novo.
 *
 * Um dia com pelo menos uma execução bem-sucedida conta como "ok", mesmo que
 * outra tenha falhado antes: o cron pode ser reexecutado, e o que importa pro
 * cliente é se o trabalho daquele dia aconteceu.
 *
 * Dia sem registro nenhum NÃO é falha — é ausência de informação, e as duas
 * coisas precisam ser distinguíveis na tela. Antes de o registro existir
 * (19/08/2026) o histórico inteiro é cinza, e afirmar "falhou" ali seria
 * inventar um passado ruim que ninguém observou.
 */
export function ultimosDias(
  execucoes: ExecucaoCrua[],
  hoje: Date,
  quantos = 30
): Dia[] {
  const porDia = new Map<string, boolean>()
  for (const e of execucoes) {
    const chave = diaUtc(e.startedAt)
    // Uma execução boa "salva" o dia.
    porDia.set(chave, (porDia.get(chave) ?? false) || e.ok)
  }

  const dias: Dia[] = []
  for (let i = quantos - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - i))
    const chave = diaUtc(d)
    const registro = porDia.get(chave)
    dias.push({
      data: chave,
      estado: registro === undefined ? "sem-registro" : registro ? "ok" : "falhou",
    })
  }
  return dias
}

/**
 * Quantos dias COM REGISTRO terminaram bem, e de quantos.
 *
 * A fração é sobre os dias observados, nunca sobre a janela inteira — senão
 * um sistema que passou a registrar ontem apareceria com "1 de 30", que leria
 * como catástrofe.
 */
export function resumo(dias: Dia[]): { bons: number; observados: number } {
  const observados = dias.filter((d) => d.estado !== "sem-registro")
  return { bons: observados.filter((d) => d.estado === "ok").length, observados: observados.length }
}

function diaUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}
