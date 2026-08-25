export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import React, { type ReactElement, type JSXElementConstructor } from "react"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { getReportData } from "@/actions/reports"
import { RelatorioPDF, type DadosDoRelatorio } from "@/components/pdf/relatorio-pdf"

// O relatorio da empresa em PDF — para levar ao contador, ao socio, ao banco.
//
// ─── A decisao que importa aqui ──────────────────────────────────────────────
//
// Esta rota NAO consulta o banco para montar o relatorio. Ela chama
// `getReportData`, a mesma funcao que a tela usa.
//
// Consultar por conta propria seria mais direto e criaria uma PORTA LATERAL:
// um endereco que devolve, em arquivo, o ranking de clientes e o detalhamento
// que o plano Starter nao inclui — e que a tela corretamente esconde. Regra de
// plano duplicada e regra de plano que diverge, e a que diverge em silencio e
// a que da dinheiro de graca.
//
// De quebra, `getReportData` ja confere o papel (OWNER/ADMIN), a assinatura
// ativa e forca o periodo ao mes corrente no plano basico. Nada disso precisa
// ser repetido, e por isso nada disso pode ser esquecido.

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? ""
  const to = request.nextUrl.searchParams.get("to") ?? ""

  let dados: Awaited<ReturnType<typeof getReportData>>
  let tenantId: string
  try {
    ;({ tenantId } = await getTenant())
    // Datas invalidas viram o mes corrente la dentro; nao ha o que validar aqui.
    dados = await getReportData(from, to)
  } catch {
    // Sem papel, sem assinatura ou sem sessao: mesma resposta, para nao dizer
    // a quem tenta QUAL das tres barrou.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const empresa = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      document: true,
      logoUrl: true,
      phone: true,
      address: true,
      website: true,
    },
  })

  const d: DadosDoRelatorio = {
    empresa: {
      nome: empresa?.name ?? "",
      documento: empresa?.document ?? null,
      logoUrl: empresa?.logoUrl ?? null,
      telefone: empresa?.phone ?? null,
      endereco: empresa?.address ?? null,
      site: empresa?.website ?? null,
    },
    periodo: dados.periodo,
    geradoEm: new Date(),
    avancado: dados.avancado,
    totalRevenue: dados.totalRevenue,
    totalExpense: dados.totalExpense,
    result: dados.result,
    revenueCount: dados.revenueCount,
    expenseCount: dados.expenseCount,
    osByStatus: dados.osByStatus,
    topClients: dados.topClients,
    porProfissional: dados.porProfissional,
    revenues: dados.revenues,
    expenses: dados.expenses,
  }

  const elemento = React.createElement(RelatorioPDF, { d }) as ReactElement<
    DocumentProps,
    string | JSXElementConstructor<unknown>
  >
  const buffer = await renderToBuffer(elemento)

  // O periodo entra no NOME do arquivo: quem baixa o relatorio de tres meses
  // seguidos fica com tres arquivos distinguiveis na pasta de downloads, em
  // vez de "relatorio (2).pdf".
  const nome = `Relatorio_${dados.periodo.from}_a_${dados.periodo.to}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  })
}
