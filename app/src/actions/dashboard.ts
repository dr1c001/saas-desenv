"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { todayInBRT, brtMidnightUTC } from "@/lib/utils"
import { getTranslations } from "next-intl/server"

export async function getMonthlyRevenueChart() {
  const { tenantId, role } = await getTenant()
  // Financeiro é OWNER/ADMIN-only em todo o resto do sistema (finance.ts,
  // reports.ts) — este gráfico expunha os mesmos totais de receita/despesa
  // pra qualquer TECHNICIAN via /dashboard. (Achado em auditoria pré-venda,
  // 2026-08-05.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)

  // Last 6 months (limites de mês em horário de Brasília, não UTC do
  // servidor — ver brtMidnightUTC em lib/utils.ts)
  const { year, month } = todayInBRT()
  const months: { label: string; chave: string; start: Date; end: Date }[] = []

  for (let i = 5; i >= 0; i--) {
    const m = month - i
    const start = brtMidnightUTC(year, m, 1)
    const end = brtMidnightUTC(year, m + 1, 1) // início do mês seguinte, exclusive
    // `m` pode ser negativo (em janeiro, m vai até -5). Date.UTC normaliza pra
    // ano/mês reais, e daí sai a chave 'AAAA-MM' que casa com o to_char do SQL.
    const normalizado = new Date(Date.UTC(year, m, 1))
    months.push({
      label: new Date(year, m, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      chave: `${normalizado.getUTCFullYear()}-${String(normalizado.getUTCMonth() + 1).padStart(2, "0")}`,
      start,
      end,
    })
  }

  // Antes eram 2 consultas POR MÊS dentro de um laço de 6 — 12 idas ao banco
  // só pra montar este gráfico, num carregamento que já fazia outras 13.
  // Agora são 2 consultas cobrindo a janela inteira, agrupadas no banco.
  //
  // O agrupamento precisa ser no fuso de Brasília, não em UTC: `paidAt` é
  // `timestamp without time zone` guardando UTC, então um pagamento das 22h de
  // 31/07 (BRT) está gravado como 01/08 01:00 e cairia no mês errado. O
  // `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` primeiro declara que
  // o valor é UTC e depois converte pra hora local, reproduzindo exatamente o
  // recorte que o brtMidnightUTC fazia mês a mês.
  //
  // A chave volta como texto ('AAAA-MM') de propósito: se voltasse como data,
  // o driver interpretaria o timestamp sem fuso usando o fuso do processo Node
  // — que é UTC na Vercel e BRT na máquina local, ou seja, resultado diferente
  // conforme onde roda.
  const inicio = months[0].start
  const fim = months[months.length - 1].end

  type LinhaMes = { chave: string; total: string | null }
  const [receitas, despesas] = await Promise.all([
    prisma.$queryRaw<LinhaMes[]>`
      SELECT to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS chave,
             SUM(amount)::text AS total
      FROM "Revenue"
      WHERE "tenantId" = ${tenantId} AND status = 'PAID'
        AND "paidAt" >= ${inicio} AND "paidAt" < ${fim}
      GROUP BY 1`,
    prisma.$queryRaw<LinhaMes[]>`
      SELECT to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS chave,
             SUM(amount)::text AS total
      FROM "Expense"
      WHERE "tenantId" = ${tenantId} AND status = 'PAID'
        AND "paidAt" >= ${inicio} AND "paidAt" < ${fim}
      GROUP BY 1`,
  ])

  const porChave = (linhas: LinhaMes[]) =>
    new Map(linhas.map((l) => [l.chave, Number(l.total ?? 0)]))
  const mapaReceitas = porChave(receitas)
  const mapaDespesas = porChave(despesas)

  return months.map(({ label, chave }) => ({
    month: label,
    receita: mapaReceitas.get(chave) ?? 0,
    despesa: mapaDespesas.get(chave) ?? 0,
  }))
}
