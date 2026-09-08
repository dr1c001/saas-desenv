"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { aplicarMovimento } from "@/lib/estoque-db"
import {
  motivoDaTransferencia,
  ordemDoTipo,
  podeDesativarLocal,
  problemaNaTransferencia,
  saldosParaTransferir,
  tipoDeLocalValido,
  type Local,
} from "@/lib/estoque-local"

// Os LOCAIS de estoque, e a transferência entre eles.
//
// Vive separado de actions/estoque.ts porque aquele arquivo já cuida da peça e
// do movimento, e local é outro assunto — com outra regra de permissão e outra
// tela.
//
// Todas as exports aqui são endereços HTTP despacháveis. Cada uma refaz as três
// checagens (assinatura, recurso, papel) por conta própria: esconder o botão na
// tela não protege nada.

export type EstadoLocal = { erro?: string; ok?: boolean }

async function contexto() {
  const { tenantId, userId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // O estoque é do plano Pro para cima — e os locais vivem dentro dele, então
  // herdam a mesma trava. Não existe recurso separado de propósito: o Pro ter
  // estoque mas não ter onde guardá-lo não seria um plano, seria um defeito.
  await requireRecurso(tenantId, "stock")
  return { tenantId, userId, role }
}

export async function getLocais() {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  const locais = await prisma.stockLocation.findMany({
    where: { tenantId },
    include: {
      user: { select: { name: true } },
      _count: { select: { balances: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  })
  // A ordem do TIPO é decidida fora do banco — ver ordemDoTipo. `sort` é
  // estável, então a ordem por nome que veio do banco sobrevive dentro de cada
  // grupo.
  return locais.sort(
    (a, b) => Number(b.active) - Number(a.active) || ordemDoTipo(a.type) - ordemDoTipo(b.type)
  )
}

/**
 * Onde está esta peça — e para onde ela PODE ir.
 *
 * Devolve todo local ativo da empresa, com zero onde não há saldo, mais os
 * inativos que ainda têm peça dentro. As duas coisas na mesma resposta porque
 * a tela faz as duas perguntas de uma vez: a lista mostra quem tem saldo, e o
 * formulário de transferência precisa dos vazios como destino.
 *
 * Foi assim que o setor novo deixou de nascer inútil: enquanto isto devolvia
 * só as linhas de StockBalance, "Expedição" recém-criada não aparecia como
 * destino, e não havia como pôr a primeira peça lá dentro.
 */
export async function getSaldosDaPeca(partId: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")

  const [locais, saldos] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { tenantId },
      select: { id: true, name: true, type: true, userId: true, active: true },
      orderBy: { name: "asc" },
    }),
    // Filtra pelo tenant do LOCAL: sem isso, um partId de outra empresa
    // devolveria a distribuição do estoque alheio.
    prisma.stockBalance.findMany({
      where: { partId, location: { tenantId } },
      select: { locationId: true, quantity: true },
    }),
  ])

  const linhas = saldosParaTransferir(
    // Mesma ordem do cartão de locais e do <select> — a tela não pode listar
    // os setores numa ordem aqui e noutra ali.
    locais
      .map((l) => ({ id: l.id, nome: l.name, tipo: l.type, userId: l.userId, ativo: l.active }))
      .sort((a, b) => ordemDoTipo(a.tipo) - ordemDoTipo(b.tipo)),
    saldos.map((s) => ({ locationId: s.locationId, quantidade: Number(s.quantity) }))
  )

  return linhas.map(({ local, quantidade }) => ({
    locationId: local.id,
    quantity: quantidade,
    location: { name: local.nome, type: local.tipo, active: local.ativo },
  }))
}

export async function salvarLocal(
  id: string | null,
  _prev: EstadoLocal,
  formData: FormData
): Promise<EstadoLocal> {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const nome = String(formData.get("name") ?? "").trim().slice(0, 80)
  if (nome.length < 2) return { erro: "nomeObrigatorio" }

  const tipo = String(formData.get("type") ?? "ALMOXARIFADO")
  if (!tipoDeLocalValido(tipo)) return { erro: "tipoInvalido" }

  // O técnico da van precisa ser DESTA empresa: um userId de fora criaria uma
  // van cujo dono não aparece em lugar nenhum da tela.
  const userIdCru = String(formData.get("userId") ?? "") || null
  let userId: string | null = null
  if (tipo === "VEICULO" && userIdCru) {
    const pessoa = await prisma.user.findFirst({
      where: { id: userIdCru, tenantId },
      select: { id: true },
    })
    if (!pessoa) return { erro: "pessoaInvalida" }
    userId = pessoa.id
  }

  try {
    if (id) {
      const existe = await prisma.stockLocation.findFirst({
        where: { id, tenantId },
        select: { id: true },
      })
      if (!existe) return { erro: "semPermissao" }
      await prisma.stockLocation.update({ where: { id }, data: { name: nome, type: tipo, userId } })
    } else {
      await prisma.stockLocation.create({ data: { tenantId, name: nome, type: tipo, userId } })
    }
  } catch {
    // A única restrição que o usuário consegue violar é o nome repetido.
    return { erro: "nomeRepetido" }
  }

  revalidatePath("/parts")
  return { ok: true }
}

/**
 * Liga e desliga um local.
 *
 * Desativar exige o local VAZIO. Com peça dentro, o saldo sumiria das escolhas
 * sem ter saído de lugar nenhum — e o total da empresa passaria a contar algo
 * que ninguém mais acha na tela. Esvaziar antes (transferindo) é o gesto certo,
 * e é o que a mensagem manda fazer.
 */
export async function alternarLocal(id: string): Promise<EstadoLocal> {
  const { tenantId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const local = await prisma.stockLocation.findFirst({
    where: { id, tenantId },
    include: { balances: { select: { quantity: true } } },
  })
  if (!local) return { erro: "naoEncontrado" }

  if (local.active) {
    const saldos = local.balances.map((b) => ({ quantidade: Number(b.quantity) }))
    if (!podeDesativarLocal(saldos)) return { erro: "localComPeca" }
  }

  await prisma.stockLocation.update({ where: { id }, data: { active: !local.active } })
  revalidatePath("/parts")
  return { ok: true }
}

/**
 * Move peça de um local para outro.
 *
 * ─── Por que DUAS pernas, e não um movimento com dois lados ────────────────
 *
 * `balanceAfter` passou a ser o saldo DAQUELE local, e uma linha só não guarda
 * dois saldos. Com duas — saída na origem, entrada no destino — o histórico de
 * cada local conta a própria história de cima para baixo, e `transferId` liga
 * as duas para a tela poder dizer "veio da Van do Carlos".
 *
 * O total da empresa NÃO muda: sai de um lado e entra do outro, na mesma
 * transação. Se só uma perna gravasse, o estoque passaria a mentir.
 */
export async function transferir(_prev: EstadoLocal, formData: FormData): Promise<EstadoLocal> {
  const { tenantId, userId, role } = await contexto()
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const partId = String(formData.get("partId") ?? "")
  const origemId = String(formData.get("origemId") ?? "")
  const destinoId = String(formData.get("destinoId") ?? "")
  const quantidade = Number(String(formData.get("quantidade") ?? "").replace(",", "."))
  const motivo = String(formData.get("motivo") ?? "")

  const locais = await prisma.stockLocation.findMany({
    where: { tenantId, id: { in: [origemId, destinoId] } },
    select: { id: true, name: true, type: true, userId: true, active: true },
  })
  const comoRegra = (id: string): Local | null => {
    const l = locais.find((x) => x.id === id)
    return l ? { id: l.id, nome: l.name, tipo: l.type, userId: l.userId, ativo: l.active } : null
  }

  const saldo = await prisma.stockBalance.findUnique({
    where: { partId_locationId: { partId, locationId: origemId } },
    select: { quantity: true },
  })

  const problema = problemaNaTransferencia({
    origem: comoRegra(origemId),
    destino: comoRegra(destinoId),
    quantidade,
    saldoNaOrigem: Number(saldo?.quantity ?? 0),
  })
  if (problema) return { erro: problema }

  // Um id por transferência, gerado aqui: as duas pernas precisam do MESMO
  // valor, e cada uma é uma linha diferente.
  const transferId = crypto.randomUUID()
  const destino = comoRegra(destinoId)!
  const origem = comoRegra(origemId)!

  try {
    await prisma.$transaction(async (tx) => {
      await aplicarMovimento(tx, {
        tenantId,
        partId,
        locationId: origemId,
        tipo: "SAIDA",
        quantidade,
        motivo: motivoDaTransferencia(motivo, destino.nome, "saida"),
        toLocationId: destinoId,
        transferId,
        userId,
      })
      await aplicarMovimento(tx, {
        tenantId,
        partId,
        locationId: destinoId,
        tipo: "ENTRADA",
        quantidade,
        motivo: motivoDaTransferencia(motivo, origem.nome, "entrada"),
        transferId,
        userId,
      })
    })
  } catch {
    return { erro: "pecaNaoEncontrada" }
  }

  revalidatePath("/parts")
  return { ok: true }
}
