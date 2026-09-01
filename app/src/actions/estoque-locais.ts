"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { aplicarMovimento } from "@/lib/estoque-db"
import {
  podeDesativarLocal,
  problemaNaTransferencia,
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
  return prisma.stockLocation.findMany({
    where: { tenantId },
    include: {
      user: { select: { name: true } },
      _count: { select: { balances: true } },
    },
    orderBy: [{ active: "desc" }, { type: "asc" }, { name: "asc" }],
  })
}

/** Os saldos de uma peça, local a local. É a resposta para "onde está?". */
export async function getSaldosDaPeca(partId: string) {
  const { tenantId } = await getTenant()
  await requireRecurso(tenantId, "stock")
  // Filtra pelo tenant do LOCAL: sem isso, um partId de outra empresa
  // devolveria a distribuição do estoque alheio.
  return prisma.stockBalance.findMany({
    where: { partId, location: { tenantId } },
    include: { location: { select: { name: true, type: true, active: true } } },
    orderBy: { location: { name: "asc" } },
  })
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
        motivo: `Transferência para ${destino.nome}`,
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
        motivo: `Transferência de ${origem.nome}`,
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
