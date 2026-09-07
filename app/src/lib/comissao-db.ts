import type { Prisma } from "@/generated/prisma/client"
import { baseParaComissao, calcularComissao, explicarComissao } from "@/lib/comissao"
import { estadoDaNota } from "@/lib/nfse-status"
import { formatOsNumber } from "@/lib/utils"

// A comissão da OS, do lado do banco.
//
// ─── Por que isto NÃO é um arquivo "use server" ──────────────────────────────
//
// Toda export de um arquivo "use server" vira um endereço HTTP despachável.
// `sincronizarComissaoDaOs` recebe um orderId e recalcula dinheiro a pagar —
// exposta como Action, seria um endpoint que qualquer pessoa autenticada
// poderia chamar em OS alheia. Ela vive aqui, em lib/, e quem a chama já se
// defendeu.
//
// ─── Por que um RECONCILIADOR, e não um gancho por evento ───────────────────
//
// Uma OS chega ao estado "concluída" ou "faturada" por MAIS caminhos do que
// parece: `completeServiceOrder`, `updateOrderStatus`, `emitNfse` (que grava
// `status: "INVOICED"` direto, sem passar pelas outras duas), `createServiceOrder`
// (uma OS pode NASCER concluída), a fila offline e a assistente de IA.
//
// Um gancho "ao concluir" pendurado nos dois lugares óbvios nunca dispararia
// pelo botão de nota fiscal — que é justamente o único fluxo onde existe
// imposto para descontar.
//
// Então esta função não pergunta "o que acabou de acontecer?". Ela pergunta
// "como a comissão desta OS deveria estar AGORA?" e converge para lá: cria,
// recalcula, ou apaga. Chamá-la duas vezes seguidas dá o mesmo resultado que
// chamá-la uma. É o que torna seguro chamá-la de todo lugar que mexe em status,
// total ou responsável.
//
// ─── O que garante que não duplica ──────────────────────────────────────────
//
// Um índice ÚNICO em `Expense.orderId`, no Postgres. Não uma consulta antes do
// insert: reconcluir uma OS é o fluxo NORMAL de correção na tela (o botão vira
// "editar" e chama a mesma ação), e duas abas abertas fazem o `findFirst`
// falhar exatamente quando importa.
//
// ─── O que congela ──────────────────────────────────────────────────────────
//
// Enquanto a despesa está PENDENTE ela é mantida viva: se o total da OS mudar,
// a comissão acompanha. No instante em que alguém marca como PAGA, ela congela
// para sempre — o sistema não reescreve, nem apaga, um valor que já saiu do
// caixa. Corrigir comissão já paga é conversa entre pessoas, não escrita
// silenciosa em banco.

export type Tx = Prisma.TransactionClient

/** O que o reconciliador fez — devolvido para quem chama poder registrar. */
export type ResultadoDaComissao =
  | { acao: "criada"; valorCentavos: number }
  | { acao: "atualizada"; valorCentavos: number }
  | { acao: "apagada" }
  | { acao: "congelada"; motivo: "jaPaga" }
  | { acao: "nada" }

/** Os status em que a OS gera comissão. */
const GERAM_COMISSAO = ["DONE", "INVOICED"]

/**
 * Quando a comissão vence.
 *
 * NÃO é "hoje". Uma despesa que nasce vencendo hoje aparece como atrasada no
 * dia seguinte, dispara o alerta de vencidos no topo de todas as telas e
 * empurra para fora dele o aluguel e o fornecedor — que é justamente o que
 * aquele aviso existe para mostrar.
 *
 * Dia 5 do mês seguinte à conclusão é o fechamento usual de comissão em
 * empresa pequena, e é o que dá a JANELA em que corrigir a OS ainda conserta a
 * comissão sozinho, sem ninguém precisar estornar nada.
 */
export function vencimentoDaComissao(concluidaEm: Date): Date {
  const d = new Date(concluidaEm)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 5))
}

type OsParaComissao = {
  id: string
  number: number
  createdAt: Date
  status: string
  totalAmount: Prisma.Decimal | number
  commissionPct: Prisma.Decimal | number | null
  technicianId: string | null
  concludedAt: Date | null
  nfseStatus: string | null
  branchId: string | null
  /** Os itens, para poder separar mão de obra de peça revendida. */
  items: readonly { total: Prisma.Decimal | number; partId: string | null }[]
}

/**
 * Quanto esta OS DEVERIA gerar de comissão, agora.
 *
 * Extraída de dentro do reconciliador para o CONFERENTE poder fazer a mesma
 * pergunta sem escrever nada. As duas chamando a mesma função é o que impede o
 * conferente de discordar da regra que ele confere — um conferente com regra
 * própria acusaria divergência onde não há, todo dia, até alguém desligá-lo.
 *
 * `null` quando não deve haver comissão nenhuma.
 */
export function decidirComissao(
  os: OsParaComissao,
  issRate: number | null,
  baseConfigurada: string
) {
  const deveTer = GERAM_COMISSAO.includes(os.status) && os.technicianId !== null
  if (!deveTer) return null

  // O imposto sai da base apenas quando existe NOTA EMITIDA — não quando o
  // status é "faturada".
  //
  // A distinção decide o valor: o status FATURADA é alcançável sem emitir nota
  // nenhuma, e é assim que trabalha quem cobra sem nota. Descontar ISS ali
  // tiraria dinheiro do funcionário para pagar um tributo que ninguém
  // recolheu. E usar `nfseIssuedAt` no lugar do estado seria pior ainda: ele é
  // carimbado no envio, antes de a prefeitura aceitar — uma nota REJEITADA
  // deixaria a comissão descontada para sempre.
  const temNota = estadoDaNota(os.nfseStatus) === "emitida"
  const pct = os.commissionPct === null ? null : Number(os.commissionPct)

  return calcularComissao({
    // A base depende da configuração da empresa: o total cheio da OS, ou só os
    // itens que não vieram do estoque. O total vem do campo GRAVADO (nunca da
    // soma em memória, que não fecha centavo por linha); a mão de obra é somada
    // linha a linha, na mesma convenção de lib/cotacao.ts.
    totalCentavos: baseParaComissao(
      os.items.map((i) => ({ total: Number(i.total), partId: i.partId })),
      Number(os.totalAmount),
      baseConfigurada
    ),
    percentual: pct,
    issRate,
    descontarIss: temNota,
  })
}

/**
 * Faz a comissão desta OS bater com o estado atual dela.
 *
 * Devolve o que fez, para quem chama poder decidir se avisa alguém.
 */
export async function sincronizarComissaoDaOs(
  tx: Tx,
  entrada: {
    tenantId: string
    os: OsParaComissao
    issRate: number | null
    /** "TOTAL" ou "MAO_DE_OBRA" — configuração da empresa. */
    baseConfigurada: string
  }
): Promise<ResultadoDaComissao> {
  const { tenantId, os, issRate, baseConfigurada } = entrada

  const existente = await tx.expense.findUnique({
    where: { orderId: os.id },
    select: {
      id: true,
      status: true,
      amount: true,
      payeeId: true,
      description: true,
      dueDate: true,
      commissionBase: true,
      commissionPct: true,
      commissionIss: true,
    },
  })

  // Já paga: congela. O dinheiro saiu do caixa — reescrever a linha faria o
  // sistema discordar do extrato, e apagá-la faria a despesa sumir do
  // resultado do mês em que foi paga.
  if (existente && existente.status === "PAID") {
    return { acao: "congelada", motivo: "jaPaga" }
  }

  const conta = decidirComissao(os, issRate, baseConfigurada)
  // A porcentagem para a descrição e para a coluna congelada. Vem do mesmo
  // lugar que a decisão leu — se `conta` existe, ela é um número válido.
  const pct = Number(os.commissionPct)

  if (!conta) {
    // Não deve ter comissão. Se existe uma pendente, ela some — é o caso da OS
    // reaberta, do responsável removido e da porcentagem apagada.
    if (existente) {
      await tx.expense.delete({ where: { id: existente.id } })
      return { acao: "apagada" }
    }
    return { acao: "nada" }
  }

  const dados = {
    description: `Comissão ${formatOsNumber(os.number, os.createdAt)} — ${explicarComissao(conta, pct, baseConfigurada)}`,
    amount: conta.valorCentavos / 100,
    // Comissão varia com o volume de serviço; não é aluguel.
    category: "VARIABLE" as const,
    dueDate: vencimentoDaComissao(os.concludedAt ?? os.createdAt),
    payeeId: os.technicianId,
    branchId: os.branchId,
    // Congelados na linha, e não só no texto da descrição: no primeiro
    // fechamento o dono pergunta "quanto de ISS saiu das comissões deste mês",
    // e isso é uma consulta — não um LIKE em descrição.
    commissionBase: conta.baseCentavos / 100,
    commissionPct: pct,
    commissionIss: conta.issCentavos / 100,
  }

  if (existente) {
    // Nada mudou: não escreve. Evita `updatedAt` novo e revalidação à toa a
    // cada vez que alguém salva a OS sem mexer em nada relevante.
    //
    // A comparação olha TODOS os campos, e não só o valor. Comparar só o
    // `amount` deixava passar a troca de responsável quando o valor era o
    // mesmo — a dívida continuava no nome de quem saiu da empresa, calada.
    // (Achado por teste ao escrever este recurso, 04/09/2026.)
    const igual =
      Number(existente.amount) === dados.amount &&
      existente.payeeId === dados.payeeId &&
      existente.description === dados.description &&
      Number(existente.commissionBase ?? -1) === dados.commissionBase &&
      Number(existente.commissionPct ?? -1) === dados.commissionPct &&
      Number(existente.commissionIss ?? -1) === dados.commissionIss &&
      existente.dueDate.getTime() === dados.dueDate.getTime()

    if (igual) return { acao: "nada" }

    await tx.expense.update({ where: { id: existente.id }, data: dados })
    return { acao: "atualizada", valorCentavos: conta.valorCentavos }
  }

  await tx.expense.create({ data: { ...dados, tenantId, orderId: os.id } })
  return { acao: "criada", valorCentavos: conta.valorCentavos }
}

/**
 * O reconciliador, pronto para ser chamado de qualquer ponto que mexa na OS.
 *
 * Aceita tanto o cliente normal quanto uma transação: dentro de `$transaction`
 * a comissão nasce junto com a conclusão (ou nenhuma das duas nasce); fora
 * dela, é uma escrita a mais logo depois.
 *
 * NÃO lança. Uma comissão que falhou não pode impedir o técnico de fechar a OS
 * no meio da rua — é o mesmo critério da baixa de estoque, e pelo mesmo motivo.
 * O preço disso é que a falha fica só no log; a rede de segurança para isso é
 * um conferente diário, que ainda não existe (ver PLANO_DE_ENGENHARIA).
 */
export async function reconciliarComissao(
  db: Tx,
  tenantId: string,
  orderId: string
): Promise<ResultadoDaComissao> {
  try {
    const [os, empresa] = await Promise.all([
      // findFirst com tenantId, e não findUnique por id: um orderId de outra
      // empresa não pode virar comissão nesta.
      db.serviceOrder.findFirst({
        where: { id: orderId, tenantId },
        select: CAMPOS_DA_COMISSAO,
      }),
      db.tenant.findUnique({
        where: { id: tenantId },
        select: { fiscalIssRate: true, commissionBase: true },
      }),
    ])
    if (!os) return { acao: "nada" }

    return await sincronizarComissaoDaOs(db, {
      tenantId,
      os,
      issRate: empresa?.fiscalIssRate ?? null,
      baseConfigurada: empresa?.commissionBase ?? "TOTAL",
    })
  } catch (e) {
    console.error("Falha ao sincronizar a comissão da OS:", orderId, e)
    return { acao: "nada" }
  }
}

/** Os campos que o reconciliador precisa ler da OS. Um só lugar, para os cinco
 *  pontos de chamada não divergirem no `select`. */
export const CAMPOS_DA_COMISSAO = {
  id: true,
  number: true,
  createdAt: true,
  status: true,
  totalAmount: true,
  commissionPct: true,
  technicianId: true,
  concludedAt: true,
  nfseStatus: true,
  branchId: true,
  // Para separar mão de obra de peça revendida quando a empresa comissiona só
  // o serviço. `partId` já diz de onde o item veio, e lê-lo não expõe custo.
  items: { select: { total: true, partId: true } },
} as const
