// Quantos comandos a empresa ainda tem no mês.
//
// A assistente é o primeiro recurso do sistema com CUSTO POR USO: cada comando
// consome API paga. Todo o resto — OS, cliente, orçamento — custa o mesmo
// tenha a empresa 10 ou 10 mil. Aqui não: sem teto, o cliente que mais usa é o
// que menos dá lucro, e não há como saber qual vai ser antes da fatura chegar.
//
// Por isso a cota não é "boa prática", é a condição para vender isto.
//
// Módulo puro, e a contagem vive numa coluna do Tenant (`iaComandosNoMes`).
// Guardar uma linha por comando para responder "quantos neste mês" cresceria
// sem limite por um número que cabe numa coluna.

import { limiteEfetivo, type Ajuste } from "@/lib/limite"
import { IA_COMANDOS_PADRAO } from "@/lib/recursos"
import { chaveMesBRT } from "@/lib/snapshot"

export type EstadoDaCota = {
  /** O mês a que a contagem se refere, AAAA-MM em Brasília. */
  mes: string
  /** Quantos comandos já foram gastos NESTE mês. */
  usado: number
  /** O teto. `null` = sem limite. */
  limite: number | null
  /** Ainda dá para dar mais um comando? */
  podeUsar: boolean
  /** Quantos sobram. `null` quando não há teto. */
  restam: number | null
  /** A contagem gravada era de outro mês e foi zerada nesta leitura. */
  virouOMes: boolean
}

/**
 * O teto de comandos desta empresa.
 *
 * Reusa a mesma gramática dos outros ajustes — `null` herda, `0` é sem limite —
 * mas o que se herda aqui NÃO vem do plano: nenhum plano inclui a assistente.
 * Herda a franquia padrão do adicional. Sem isso, conceder o adicional deixaria
 * a empresa com teto zero, o que parece defeito e não decisão.
 */
export function limiteDeComandos(override: Ajuste): number | null {
  return limiteEfetivo(IA_COMANDOS_PADRAO, override)
}

/**
 * Onde a empresa está na cota deste mês.
 *
 * A virada de mês acontece na LEITURA, e não num cron: um cron que falha numa
 * madrugada deixaria a empresa barrada no dia 1 sem nenhum motivo visível.
 * Comparando o mês gravado com o de hoje, a virada é consequência do
 * calendário e não de um processo ter rodado.
 */
export function estadoDaCota(args: {
  usado: number
  /** O mês da contagem gravada. `null` numa empresa que nunca usou. */
  mesGravado: string | null
  override: Ajuste
  agora: Date
}): EstadoDaCota {
  const mes = chaveMesBRT(args.agora)
  const virouOMes = args.mesGravado !== null && args.mesGravado !== mes

  // Contagem de outro mês não vale para este. Empresa que nunca usou também
  // começa em zero.
  const usado = args.mesGravado === mes ? Math.max(0, args.usado) : 0
  const limite = limiteDeComandos(args.override)

  return {
    mes,
    usado,
    limite,
    podeUsar: limite === null || usado < limite,
    restam: limite === null ? null : Math.max(0, limite - usado),
    virouOMes,
  }
}

/** O que gravar depois de um comando gastar cota. */
export function aposConsumir(estado: EstadoDaCota): {
  iaComandosNoMes: number
  iaMesDoContador: string
} {
  return { iaComandosNoMes: estado.usado + 1, iaMesDoContador: estado.mes }
}

/**
 * O motivo, quando a assistente não pode responder.
 *
 * `null` significa que pode. Devolve o MOTIVO em vez de um booleano porque a
 * tela precisa dizer coisas diferentes: "seu plano não inclui" leva a uma
 * conversa comercial, "acabou a franquia do mês" leva a outra, e "o sistema
 * não está configurado" não é problema do cliente — é nosso.
 */
export type Impedimento = "semRecurso" | "semChave" | "cotaEsgotada"

export function porQueNaoPode(args: {
  temRecurso: boolean
  temChave: boolean
  cota: EstadoDaCota
}): Impedimento | null {
  // Ordem importa: uma empresa que não contratou o adicional não deve ler que
  // "a franquia acabou", porque ela nunca teve franquia nenhuma.
  if (!args.temRecurso) return "semRecurso"
  // Falta de chave é falha NOSSA, e vem antes da cota: seria péssimo consumir
  // a franquia de alguém num comando que nem chegou a sair.
  if (!args.temChave) return "semChave"
  if (!args.cota.podeUsar) return "cotaEsgotada"
  return null
}
