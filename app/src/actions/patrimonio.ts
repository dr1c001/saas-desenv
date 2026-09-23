"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { lerDinheiro } from "@/lib/dinheiro"
import {
  CATEGORIAS,
  depreciacaoAcumulada,
  lerTaxa,
  resumirPatrimonio,
  taxaDoBem,
  valorContabil,
  type Bem,
  type CategoriaBem,
  type SituacaoBem,
} from "@/lib/patrimonio"

// Os BENS da empresa.
//
// Toda export aqui é endereço HTTP despachável, e cada uma refaz as checagens
// por conta própria — esconder o botão na tela não protege nada.
//
// ─── Por que NÃO tem trava de plano ──────────────────────────────────────────
//
// Saber o que a empresa tem não é recurso avançado: é o mínimo para ela existir
// direito. Prender isso atrás do Pro obrigaria quem tem uma van e três
// ferramentas a pagar mais para anotá-las — e essa empresa é justamente a que
// mais precisa de organização e menos pode pagar por ela.

export type EstadoBem = { erro?: string; ok?: boolean; id?: string }

const ehAdmin = (role: string) => role === "OWNER" || role === "ADMIN"

async function contexto() {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  return { tenantId, role }
}

// Valor de bem não é negativo; zero existe (bem doado). A LEITURA mora em
// lib/dinheiro.ts — a cópia que existia aqui lia "12.5" como 125.
const dinheiro = (v: FormDataEntryValue | null) => {
  const n = lerDinheiro(v)
  return n !== null && n >= 0 ? n : 0
}

/** Converte a linha do banco no formato que lib/patrimonio.ts entende. */
function paraRegra(a: {
  category: CategoriaBem
  purchaseValue: unknown
  purchasedAt: Date
  status: SituacaoBem
  disposedAt: Date | null
  annualRate: unknown
  residualValue: unknown
}): Bem {
  return {
    categoria: a.category,
    valorAquisicao: Number(a.purchaseValue),
    aquisicaoEm: a.purchasedAt,
    situacao: a.status,
    baixaEm: a.disposedAt,
    taxaAnual: a.annualRate === null ? null : Number(a.annualRate),
    valorResidual: a.residualValue === null ? null : Number(a.residualValue),
  }
}

export async function getBens(filtros?: { q?: string; situacao?: string }) {
  const { tenantId } = await getTenant()
  const q = filtros?.q?.trim()

  const bens = await prisma.asset.findMany({
    where: {
      tenantId,
      ...(filtros?.situacao && filtros.situacao !== "todas"
        ? { status: filtros.situacao as never }
        : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { brand: { contains: q, mode: "insensitive" as const } },
              { model: { contains: q, mode: "insensitive" as const } },
              { serialNumber: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      location: { select: { name: true } },
      responsible: { select: { name: true } },
      _count: { select: { attachments: true, maintenance: true } },
    },
    // Ativos primeiro; dentro deles, o mais recente em cima.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  })

  const hoje = new Date()
  return bens.map((a) => {
    const regra = paraRegra(a)
    return {
      ...a,
      purchaseValue: Number(a.purchaseValue),
      depreciado: depreciacaoAcumulada(regra, hoje),
      contabil: valorContabil(regra, hoje),
      taxa: taxaDoBem(regra),
    }
  })
}

/** O resumo para o topo da tela — e a base do balanço. */
export async function getResumoDoPatrimonio() {
  const { tenantId } = await getTenant()
  const bens = await prisma.asset.findMany({
    where: { tenantId },
    select: {
      category: true,
      purchaseValue: true,
      purchasedAt: true,
      status: true,
      disposedAt: true,
      annualRate: true,
      residualValue: true,
    },
  })
  return resumirPatrimonio(bens.map(paraRegra), new Date())
}

export async function getBem(id: string) {
  const { tenantId } = await getTenant()
  return prisma.asset.findFirst({
    where: { id, tenantId },
    include: {
      location: { select: { id: true, name: true } },
      responsible: { select: { id: true, name: true } },
      maintenance: {
        select: { id: true, number: true, title: true, status: true, totalAmount: true, concludedAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })
}

function lerCategoria(v: string): CategoriaBem {
  return (CATEGORIAS as readonly string[]).includes(v) ? (v as CategoriaBem) : "OUTRO"
}

export async function salvarBem(
  id: string | null,
  _prev: EstadoBem,
  formData: FormData
): Promise<EstadoBem> {
  const { tenantId, role } = await contexto()
  // Bem é patrimônio: quem cadastra e avalia é dono ou administrador.
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const name = String(formData.get("name") ?? "").trim().slice(0, 160)
  if (name.length < 2) return { erro: "nomeObrigatorio" }

  const purchasedAtCru = String(formData.get("purchasedAt") ?? "").trim()
  if (!purchasedAtCru) return { erro: "dataObrigatoria" }
  // Meio-dia evita a data escorregar um dia para trás no fuso — e um dia a
  // menos aqui muda um mês inteiro de depreciação.
  const purchasedAt = new Date(`${purchasedAtCru}T12:00:00`)
  if (Number.isNaN(purchasedAt.getTime())) return { erro: "dataInvalida" }

  const purchaseValue = dinheiro(formData.get("purchaseValue"))

  // Local e responsável TÊM de ser desta empresa: ids de fora ligariam o bem a
  // uma van ou a uma pessoa que ele nunca vai encontrar na tela.
  const locationIdCru = String(formData.get("locationId") ?? "") || null
  const responsibleIdCru = String(formData.get("responsibleId") ?? "") || null

  let locationId: string | null = null
  if (locationIdCru) {
    const l = await prisma.stockLocation.findFirst({
      where: { id: locationIdCru, tenantId },
      select: { id: true },
    })
    if (!l) return { erro: "localInvalido" }
    locationId = l.id
  }

  let responsibleId: string | null = null
  if (responsibleIdCru) {
    const u = await prisma.user.findFirst({
      where: { id: responsibleIdCru, tenantId },
      select: { id: true },
    })
    if (!u) return { erro: "pessoaInvalida" }
    responsibleId = u.id
  }

  const residualCru = String(formData.get("residualValue") ?? "").trim()
  const dados = {
    name,
    category: lerCategoria(String(formData.get("category") ?? "OUTRO")),
    brand: String(formData.get("brand") ?? "").trim().slice(0, 80) || null,
    model: String(formData.get("model") ?? "").trim().slice(0, 80) || null,
    serialNumber: String(formData.get("serialNumber") ?? "").trim().slice(0, 80) || null,
    purchaseValue,
    purchasedAt,
    // `lerTaxa` devolve null para vazio/inválido, e null usa a taxa da
    // categoria. A higiene mora em lib/patrimonio.ts, num lugar só.
    annualRate: lerTaxa(String(formData.get("annualRate") ?? "").replace(",", ".")),
    residualValue: residualCru ? dinheiro(residualCru) : null,
    locationId,
    responsibleId,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
  }

  if (id) {
    const existe = await prisma.asset.findFirst({ where: { id, tenantId }, select: { id: true } })
    if (!existe) return { erro: "naoEncontrado" }
    await prisma.asset.update({ where: { id }, data: dados })
  } else {
    const criado = await prisma.asset.create({
      data: { ...dados, tenantId },
      select: { id: true },
    })
    revalidatePath("/bens")
    return { ok: true, id: criado.id }
  }

  revalidatePath("/bens")
  revalidatePath(`/bens/${id}`)
  return { ok: true, id }
}

/**
 * Dá baixa: o bem saiu do patrimônio (vendido, perdido, descartado).
 *
 * NÃO apaga. O bem existiu, custou dinheiro, depreciou — e o contador precisa
 * dessa história para fechar o exercício. Apagar reescreveria o passado.
 *
 * A data da baixa é onde a depreciação PARA (ver lib/patrimonio.ts): depois
 * dela o bem não é mais da empresa, e continuar depreciando inventaria despesa.
 */
export async function darBaixa(
  id: string,
  _prev: EstadoBem,
  formData: FormData
): Promise<EstadoBem> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const bem = await prisma.asset.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, purchasedAt: true },
  })
  if (!bem) return { erro: "naoEncontrado" }
  if (bem.status === "BAIXADO") return { erro: "jaBaixado" }

  const dataCru = String(formData.get("disposedAt") ?? "").trim()
  const disposedAt = dataCru ? new Date(`${dataCru}T12:00:00`) : new Date()
  if (Number.isNaN(disposedAt.getTime())) return { erro: "dataInvalida" }
  // O banco também recusa (CHECK), mas aqui a mensagem explica.
  if (disposedAt < bem.purchasedAt) return { erro: "baixaAntesDaCompra" }

  await prisma.asset.update({
    where: { id },
    data: {
      status: "BAIXADO",
      disposedAt,
      disposalNotes: String(formData.get("disposalNotes") ?? "").trim().slice(0, 500) || null,
    },
  })

  revalidatePath("/bens")
  revalidatePath(`/bens/${id}`)
  return { ok: true }
}

/** Volta um bem baixado por engano. */
export async function reativarBem(id: string): Promise<EstadoBem> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const bem = await prisma.asset.findFirst({ where: { id, tenantId }, select: { status: true } })
  if (!bem) return { erro: "naoEncontrado" }
  if (bem.status !== "BAIXADO") return { erro: "naoEstaBaixado" }

  // Limpa a data: com ela preenchida a depreciação continuaria congelada, e o
  // bem reativado ficaria parado no tempo.
  await prisma.asset.update({
    where: { id },
    data: { status: "ATIVO", disposedAt: null, disposalNotes: null },
  })

  revalidatePath("/bens")
  return { ok: true }
}

/** Troca a situação entre ATIVO e MANUTENCAO. Baixado não entra aqui. */
export async function alternarManutencao(id: string): Promise<EstadoBem> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const bem = await prisma.asset.findFirst({ where: { id, tenantId }, select: { status: true } })
  if (!bem) return { erro: "naoEncontrado" }
  if (bem.status === "BAIXADO") return { erro: "jaBaixado" }

  await prisma.asset.update({
    where: { id },
    data: { status: bem.status === "MANUTENCAO" ? "ATIVO" : "MANUTENCAO" },
  })

  revalidatePath("/bens")
  return { ok: true }
}

export async function excluirBem(id: string): Promise<EstadoBem> {
  const { tenantId, role } = await contexto()
  // Só o DONO apaga de vez, e só o que nunca deveria ter existido — um
  // cadastro duplicado, um erro de digitação. Bem que a empresa teve de
  // verdade recebe BAIXA, que preserva a história para o contador.
  if (role !== "OWNER") return { erro: "semPermissao" }

  const bem = await prisma.asset.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { maintenance: true, attachments: true } } },
  })
  if (!bem) return { erro: "naoEncontrado" }
  if (bem._count.maintenance > 0) return { erro: "temHistorico" }

  await prisma.asset.delete({ where: { id } })
  revalidatePath("/bens")
  return { ok: true }
}

/**
 * A lista para o contador, em CSV.
 *
 * É o que ele pede todo fim de exercício, e o que hoje sai de uma planilha
 * feita à mão. Sai com o valor de aquisição, a taxa usada, a depreciação
 * acumulada e o valor contábil — as quatro colunas de que ele precisa para
 * lançar o imobilizado.
 */
export async function exportarPatrimonioCsv(): Promise<string> {
  const bens = await getBens()

  const cabecalho = [
    "Bem",
    "Categoria",
    "Marca",
    "Modelo",
    "Numero de serie",
    "Data de aquisicao",
    "Valor de aquisicao",
    "Taxa anual (%)",
    "Depreciacao acumulada",
    "Valor contabil",
    "Situacao",
    "Data da baixa",
  ]

  // Aspas duplicadas e campo entre aspas: nome de bem com vírgula (“Furadeira
  // 1/2”, bancada”) quebraria a coluna do contador.
  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const data = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "")

  const linhas = bens.map((b) =>
    [
      b.name,
      b.category,
      b.brand,
      b.model,
      b.serialNumber,
      data(b.purchasedAt),
      b.purchaseValue.toFixed(2),
      b.taxa.toFixed(2),
      b.depreciado.toFixed(2),
      b.contabil.toFixed(2),
      b.status,
      data(b.disposedAt),
    ]
      .map(escapar)
      .join(",")
  )

  // BOM na frente: sem ele o Excel em português abre o arquivo em ANSI e todo
  // acento vira caractere estranho — e o contador devolve pedindo de novo.
  return "﻿" + [cabecalho.map(escapar).join(","), ...linhas].join("\r\n")
}
