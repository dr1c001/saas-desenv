"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso } from "@/lib/plan"
import { formatCurrency } from "@/lib/utils"
import {
  GRUPOS,
  lerValorManual,
  montarBalanco,
  type Balanco,
  type GrupoDoBalanco,
  type NumerosDaEmpresa,
} from "@/lib/balanco"
import { conferirBalanco, DIAS_RECEBIVEL_VELHO, type Achado } from "@/lib/contador-agente"
import { resumirPatrimonio, valorContabil, type Bem } from "@/lib/patrimonio"
import type { PaymentStatus } from "@/generated/prisma/client"

// O BALANÇO PATRIMONIAL.
//
// Toda export aqui é endereço HTTP despachável, e cada uma refaz as checagens
// por conta própria — esconder o botão na tela não protege nada.
//
// ─── Por que ESTE tem trava de plano, e o controle de bens não ───────────────
//
// Anotar o que a empresa tem é o mínimo para ela existir direito, e por isso
// /bens é de todo mundo. O balanço é o RELATÓRIO CONTÁBIL montado em cima
// disso — outra coisa, e a que naturalmente cresce com a empresa. A linha é:
// anotar é de todos, o relatório é do Pro.

export type EstadoBalanco = { erro?: string; ok?: boolean }

const ehAdmin = (role: string) => role === "OWNER" || role === "ADMIN"

async function contexto() {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  await requireRecurso(tenantId, "balanco")
  return { tenantId, role }
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

const somaDe = (r: { _sum?: { amount?: unknown } }) => num(r._sum?.amount)

/**
 * Contas em aberto: pendentes e vencidas.
 *
 * CANCELLED fica de fora de propósito — conta cancelada não é dívida nem
 * crédito, e somá-la inflaria os dois lados do balanço com dinheiro que não
 * existe. Por isso é uma lista explícita e não `{ not: "PAID" }`.
 */
const EM_ABERTO: { in: PaymentStatus[] } = { in: ["PENDING", "OVERDUE"] }

export type BalancoCompleto = {
  balanco: Balanco
  achados: Achado[]
  /** O que a empresa informou à mão, para o formulário. */
  caixaInicial: number | null
  capitalSocial: number | null
}

export async function getBalanco(): Promise<BalancoCompleto> {
  const { tenantId } = await contexto()
  const hoje = new Date()
  const corte = new Date(hoje.getTime() - DIAS_RECEBIVEL_VELHO * 24 * 60 * 60 * 1000)

  const [empresa, recebido, pago, aReceber, aPagar, velhos, pecas, bens, manuais, movimentos] =
    await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { openingCash: true, shareCapital: true },
      }),
      prisma.revenue.aggregate({ where: { tenantId, status: "PAID" }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { tenantId, status: "PAID" }, _sum: { amount: true } }),
      prisma.revenue.aggregate({ where: { tenantId, status: EM_ABERTO }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { tenantId, status: EM_ABERTO }, _sum: { amount: true } }),
      prisma.revenue.aggregate({
        where: { tenantId, status: EM_ABERTO, dueDate: { lt: corte } },
        _sum: { amount: true },
        _count: true,
      }),
      // Saldo e custo de uma vez: a mesma leitura responde quanto vale o
      // estoque E quantas peças estão sem preço — que é o que o subavalia.
      prisma.part.findMany({
        where: { tenantId, stock: { gt: 0 } },
        select: { stock: true, costPrice: true },
      }),
      prisma.asset.findMany({
        where: { tenantId, status: { not: "BAIXADO" } },
        select: {
          category: true,
          purchaseValue: true,
          purchasedAt: true,
          status: true,
          disposedAt: true,
          annualRate: true,
          residualValue: true,
          _count: { select: { attachments: true } },
        },
      }),
      prisma.balanceEntry.findMany({
        where: { tenantId },
        orderBy: [{ group: "asc" }, { createdAt: "asc" }],
      }),
      prisma.revenue.count({ where: { tenantId } }),
    ])

  const estoque = pecas.reduce((s, p) => s + num(p.stock) * num(p.costPrice), 0)
  const pecasSemCusto = pecas.filter((p) => p.costPrice === null || num(p.costPrice) === 0).length

  const paraRegra = (a: (typeof bens)[number]): Bem => ({
    categoria: a.category,
    valorAquisicao: num(a.purchaseValue),
    aquisicaoEm: a.purchasedAt,
    situacao: a.status,
    baixaEm: a.disposedAt,
    taxaAnual: a.annualRate === null ? null : num(a.annualRate),
    valorResidual: a.residualValue === null ? null : num(a.residualValue),
  })
  const resumo = resumirPatrimonio(bens.map(paraRegra), hoje)

  const numeros: NumerosDaEmpresa = {
    caixaInicial: num(empresa?.openingCash),
    recebido: somaDe(recebido),
    pago: somaDe(pago),
    aReceber: somaDe(aReceber),
    aPagar: somaDe(aPagar),
    estoque,
    imobilizadoBruto: resumo.totalAquisicao,
    depreciacao: resumo.totalDepreciado,
    capitalSocial: num(empresa?.shareCapital),
    manuais: manuais.map((m) => ({
      id: m.id,
      grupo: m.group as GrupoDoBalanco,
      descricao: m.description,
      valor: num(m.amount),
    })),
  }

  const balanco = montarBalanco(numeros)

  const achados = conferirBalanco(balanco, {
    pecasSemCusto,
    recebiveisVelhos: { quantidade: velhos._count ?? 0, valor: somaDe(velhos) },
    bens: bens.length,
    bensSemNota: bens.filter((b) => b._count.attachments === 0).length,
    // "Já totalmente depreciado e ainda em uso" — vale rever a vida útil com o
    // contador. Só conta o que TEM valor de aquisição: um bem doado (valor
    // zero) nasce com contábil zero e não é caso de revisão nenhuma.
    bensZerados: bens.filter(
      (b) => num(b.purchaseValue) > 0 && valorContabil(paraRegra(b), hoje) === 0
    ).length,
    caixaInicialInformado: empresa?.openingCash !== null && empresa?.openingCash !== undefined,
    temMovimento: movimentos > 0,
  })

  return {
    balanco,
    achados,
    caixaInicial: empresa?.openingCash === null ? null : num(empresa?.openingCash),
    capitalSocial: empresa?.shareCapital === null ? null : num(empresa?.shareCapital),
  }
}

/**
 * O caixa inicial e o capital social.
 *
 * Campo VAZIO grava NULL, e não zero — "não informou" e "informou zero" são
 * coisas diferentes, e é dessa diferença que o conferente tira qual mensagem
 * mostrar: falta cadastrar, ou o dinheiro acabou mesmo.
 */
export async function salvarBasesDoBalanco(
  _prev: EstadoBalanco,
  formData: FormData
): Promise<EstadoBalanco> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const ler = (campo: string): number | null | undefined => {
    const cru = String(formData.get(campo) ?? "").trim()
    if (!cru) return null
    const n = lerValorManual(cru)
    // `undefined` = digitou algo que não é número. Diferente de vazio, que
    // apaga de propósito.
    if (n === null || n < 0) return undefined
    return n
  }

  const openingCash = ler("openingCash")
  const shareCapital = ler("shareCapital")
  if (openingCash === undefined || shareCapital === undefined) return { erro: "valorInvalido" }

  await prisma.tenant.update({ where: { id: tenantId }, data: { openingCash, shareCapital } })
  revalidatePath("/balanco")
  return { ok: true }
}

function lerGrupo(v: string): GrupoDoBalanco | null {
  return (GRUPOS as readonly string[]).includes(v) ? (v as GrupoDoBalanco) : null
}

export async function salvarLinhaManual(
  id: string | null,
  _prev: EstadoBalanco,
  formData: FormData
): Promise<EstadoBalanco> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  const description = String(formData.get("description") ?? "").trim().slice(0, 120)
  if (description.length < 2) return { erro: "descricaoObrigatoria" }

  const group = lerGrupo(String(formData.get("group") ?? ""))
  if (!group) return { erro: "grupoInvalido" }

  // Negativo passa: conta retificadora existe. Vazio não passa — gravaria uma
  // linha de R$ 0,00 com nome e tudo, e ninguém saberia o que ela é.
  const amount = lerValorManual(formData.get("amount"))
  if (amount === null) return { erro: "valorInvalido" }

  if (id) {
    const existe = await prisma.balanceEntry.findFirst({
      where: { id, tenantId },
      select: { id: true },
    })
    if (!existe) return { erro: "naoEncontrado" }
    await prisma.balanceEntry.update({ where: { id }, data: { group, description, amount } })
  } else {
    await prisma.balanceEntry.create({ data: { tenantId, group, description, amount } })
  }

  revalidatePath("/balanco")
  return { ok: true }
}

export async function excluirLinhaManual(id: string): Promise<EstadoBalanco> {
  const { tenantId, role } = await contexto()
  if (!ehAdmin(role)) return { erro: "semPermissao" }

  // deleteMany com o tenant no WHERE: `delete` por id puro apagaria a linha de
  // outra empresa para quem chamasse a Action direto com um id adivinhado.
  const r = await prisma.balanceEntry.deleteMany({ where: { id, tenantId } })
  if (r.count === 0) return { erro: "naoEncontrado" }

  revalidatePath("/balanco")
  return { ok: true }
}

/**
 * O balanço em CSV, para o contador.
 *
 * Sai com os cinco grupos, linha a linha, e os totais — que é a estrutura que
 * ele já lê. As ressalvas do conferente vão JUNTO, no fim: mandar o balanço sem
 * elas seria entregar o número escondendo o que se sabe sobre ele.
 *
 * TUDO TRADUZIDO, e não as chaves internas. O arquivo é para uma pessoa, e
 * `ATIVO_NAO_CIRCULANTE` / `caixaNegativoSemInicial` não são para ninguém ler —
 * o contador abriria a planilha e ligaria perguntando o que é isso.
 */
/**
 * Os números que a mensagem do conferente interpola, já como dinheiro.
 *
 * Sem isto o CSV sairia com "ficou em -8000" em vez de "ficou em R$ -8.000,00"
 * — e quem lê é o contador. Espelha `dinheirizar` da tela: as mesmas chaves são
 * dinheiro nos dois lugares, e `dias`/`pecas`/`bens` continuam contagem.
 */
const CHAVES_EM_DINHEIRO = new Set(["caixa", "pl", "passivo", "ativo", "valor", "depreciacao"])

function emDinheiro(dados?: Record<string, number>): Record<string, string | number> {
  if (!dados) return {}
  const saida: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(dados)) {
    saida[k] = CHAVES_EM_DINHEIRO.has(k) ? formatCurrency(v) : v
  }
  return saida
}

export async function exportarBalancoCsv(): Promise<string> {
  const { balanco, achados } = await getBalanco()
  const t = await getTranslations("balanco")

  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const linha = (cols: unknown[]) => cols.map(escapar).join(",")

  const linhas: string[] = [linha(["Grupo", "Linha", "Valor"])]

  for (const g of balanco.grupos) {
    const nomeDoGrupo = t(`grupos.${g.grupo}` as "grupos.ATIVO_CIRCULANTE")
    for (const l of g.linhas) {
      // Automática traduz; manual sai como a empresa digitou.
      const nome = l.automatica ? t(`linhas.${l.chave}` as "linhas.caixa") : l.chave
      linhas.push(linha([nomeDoGrupo, nome, l.valor.toFixed(2)]))
    }
    linhas.push(linha([nomeDoGrupo, "TOTAL", g.total.toFixed(2)]))
  }

  linhas.push(linha([]))
  linhas.push(linha(["", t("totais.ativo"), balanco.ativo.toFixed(2)]))
  linhas.push(linha(["", t("totais.passivo"), balanco.passivo.toFixed(2)]))
  linhas.push(linha(["", t("totais.pl"), balanco.patrimonioLiquido.toFixed(2)]))

  if (achados.length > 0) {
    linhas.push(linha([]))
    linhas.push(linha([t("conferente.titulo"), "", ""]))
    for (const a of achados) {
      linhas.push(
        linha([
          t(`conferente.gravidades.${a.gravidade}` as "conferente.gravidades.impede"),
          t(`conferente.achados.${a.chave}` as "conferente.achados.naoFecha", emDinheiro(a.dados)),
          "",
        ])
      )
    }
  }

  // BOM na frente: sem ele o Excel em português abre em ANSI e todo acento
  // vira caractere estranho — e o contador devolve pedindo de novo.
  return "﻿" + linhas.join("\r\n")
}

// Sem `export type { ... }` aqui.
//
// O typecheck aceita, e o BUILD NÃO: o compilador de Server Actions do Turbopack
// trata toda export de um arquivo "use server" como endereço em tempo de
// execução, e reclama que "The export Balanco was not found in module". Quem
// precisa dos tipos importa direto de lib/balanco.ts e lib/contador-agente.ts,
// que é de onde eles vêm.
