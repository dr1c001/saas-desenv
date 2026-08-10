export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import React, { type ReactElement, type JSXElementConstructor } from "react"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/admin"
import { calcularRetratoAtual, chaveMesBRT, valorMensal } from "@/lib/snapshot"
import { AdminReportPDF, type DadosRelatorio } from "@/components/pdf/admin-report-pdf"

const ROTULO_ACAO: Record<string, string> = {
  liberar_acesso: "Liberou acesso",
  cancelar: "Cancelou acesso",
  reativar: "Reativou",
  trocar_plano: "Trocou o plano",
  entrar_na_conta: "Entrou na conta",
  sair_da_conta: "Saiu da conta",
}

function rotuloDoMes(chave: string) {
  const [ano, mes] = chave.split("-").map(Number)
  return new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export async function GET(request: NextRequest) {
  // Este PDF junta dados de TODAS as empresas clientes num arquivo só, feito
  // pra ser encaminhado. Se vazar, vaza tudo de uma vez — daí a checagem
  // própria aqui, sem depender de layout nenhum.
  let admin: string
  try {
    admin = await requireSuperAdmin()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const busca = request.nextUrl.searchParams.get("q")?.trim() || undefined

  const [tenants, retratos, retratoAtual, acoes] = await Promise.all([
    prisma.tenant.findMany({
      where: busca
        ? {
            OR: [
              { name: { contains: busca, mode: "insensitive" } },
              { document: { contains: busca, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: {
        plan: { select: { name: true, priceMonthly: true, priceYearly: true } },
        _count: { select: { users: true, orders: true, clients: true } },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { billingCycle: true, currentPeriodEnd: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.monthlySnapshot.findMany({ orderBy: { month: "asc" }, take: 12 }),
    calcularRetratoAtual(),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ])

  const mesAtual = chaveMesBRT(new Date())
  const evolucao = [...retratos.filter((r) => r.month !== mesAtual), { month: mesAtual, ...retratoAtual }].map(
    (r) => ({
      mes: rotuloDoMes(r.month),
      empresas: r.companies,
      pagantes: r.activeCompanies,
      mrr: Number(r.mrr),
    })
  )

  const dados: DadosRelatorio = {
    geradoEm: new Date(),
    geradoPor: admin,
    filtro: busca,
    resumo: {
      ...retratoAtual,
      // Mesma subtração do painel: os cinco status são exaustivos.
      trialCompanies:
        retratoAtual.companies -
        retratoAtual.activeCompanies -
        retratoAtual.pendingCompanies -
        retratoAtual.pastDueCompanies -
        retratoAtual.cancelledCompanies,
    },
    evolucao,
    empresas: tenants.map((t) => ({
      nome: t.name,
      documento: t.document,
      status: t.subscriptionStatus,
      plano: t.plan?.name ?? null,
      valorMensal: valorMensal(t.subscriptions[0]?.billingCycle, t.plan),
      usuarios: t._count.users,
      ordens: t._count.orders,
      clientes: t._count.clients,
      cadastroEm: t.createdAt,
      renovaEm: t.subscriptions[0]?.currentPeriodEnd ?? null,
    })),
    acoes: acoes.map((a) => ({
      quando: a.createdAt,
      quem: a.adminEmail,
      acao: ROTULO_ACAO[a.action] ?? a.action,
      detalhe: a.detail,
    })),
  }

  const buffer = await renderToBuffer(
    React.createElement(AdminReportPDF, { dados }) as ReactElement<
      DocumentProps,
      string | JSXElementConstructor<unknown>
    >
  )

  const arquivo = `servicoos-relatorio-${new Date().toISOString().slice(0, 10)}.pdf`
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${arquivo}"`,
      // Relatório com dados de todos os clientes nunca deve ficar em cache
      // de proxy ou CDN.
      "Cache-Control": "private, no-store",
    },
  })
}
