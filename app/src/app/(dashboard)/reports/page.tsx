import Link from "next/link"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { getReportData } from "@/actions/reports"
import { formatCurrency, formatDate, formatOsNumber } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TrendingUp, TrendingDown, DollarSign, Lock, FileDown } from "lucide-react"
import { PeriodPicker } from "@/components/reports/period-picker"
import { RegimePicker } from "@/components/reports/regime-picker"

type SearchParams = Promise<{ from?: string; to?: string; regime?: string }>

function defaultDates() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
  return { from, to }
}

// Bloco no lugar da seção que o plano não inclui. Dizer "seu plano não tem
// isto, e é aqui que se resolve" é bem diferente de uma tabela vazia, que o
// usuário lê como "não tenho dados".
function UpgradeAviso({ texto, botao }: { texto: string; botao: string }) {
  return (
    <div className="flex flex-col items-start gap-2 p-4">
      <p className="text-sm text-muted-foreground">{texto}</p>
      <Link href="/billing" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Lock className="size-3.5 mr-1.5" />
        {botao}
      </Link>
    </div>
  )
}

// Ordem fixa de exibição no bloco "OS por Status" — os rótulos vêm de
// common.serviceOrderStatus pra não duplicar tradução.
const OS_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "INVOICED"]

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("finance")
  const tCommon = await getTranslations("common")
  const { role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const sp = await searchParams
  const { from: defFrom, to: defTo } = defaultDates()
  const from = sp.from ?? defFrom
  const to = sp.to ?? defTo

  const data = await getReportData(from, to, sp.regime)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{t("reports.title")}</h1>
          {/* O periodo vai no endereco: o PDF sai do MESMO periodo que a tela
              esta mostrando. Um botao que gerasse "o mes corrente" enquanto a
              tela mostra o trimestre entregaria um arquivo que nao confere com
              o que a pessoa acabou de ler. */}
          <a
            href={`/api/pdf/relatorio?from=${encodeURIComponent(data.periodo.from)}&to=${encodeURIComponent(data.periodo.to)}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <FileDown className="size-4" />
            {t("reports.baixarPdf")}
          </a>
        </div>
        {/* Período personalizado faz parte dos "relatórios avançados"
            (Pro+). No básico o servidor força o mês corrente — esconder o
            seletor aqui evita oferecer um controle que não teria efeito. */}
        {data.avancado ? (
          <Suspense>
            <div className="flex flex-wrap items-center gap-3">
              <PeriodPicker defaultFrom={from} defaultTo={to} />
              {/* Caixa ou competência. Fica junto do período porque as duas
                  escolhas decidem a mesma coisa: quais lançamentos entram. */}
              <RegimePicker atual={data.regime} />
            </div>
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground">{t("reports.currentMonthOnly")}</p>
        )}
      </div>

      {/* DRE */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("reports.dre.title")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("reports.dre.revenueTitle")}</CardTitle>
              <TrendingUp className="size-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(data.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.dre.revenueCount", { count: data.revenueCount })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("reports.dre.expenseTitle")}</CardTitle>
              <TrendingDown className="size-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(data.totalExpense)}</p>
              <p className="text-xs text-muted-foreground">{t("reports.dre.expenseCount", { count: data.expenseCount })}</p>
            </CardContent>
          </Card>
          <Card className={data.result >= 0 ? "border-green-200" : "border-red-200"}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("reports.dre.resultTitle")}</CardTitle>
              <DollarSign className={`size-4 ${data.result >= 0 ? "text-green-600" : "text-red-600"}`} />
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${data.result >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(data.result)}
              </p>
              <p className="text-xs text-muted-foreground">{data.result >= 0 ? t("reports.dre.profitInPeriod") : t("reports.dre.lossInPeriod")}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* OS por status */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("reports.osByStatus.title")}</h2>
          <Card>
            <CardContent className="pt-4 space-y-2">
              {OS_STATUSES.map(status => {
                const count = data.osByStatus[status] ?? 0
                const total = Object.values(data.osByStatus).reduce((s, n) => s + n, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{tCommon(`serviceOrderStatus.${status}` as "serviceOrderStatus.OPEN")}</span>
                      <span className="font-medium">{count} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {Object.keys(data.osByStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("reports.osByStatus.empty")}</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Top clientes */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("reports.topClients.title")}</h2>
          <Card>
            <CardContent className="p-0">
              {/* Ranking de clientes é dos "relatórios avançados". Sem isto, a
                  tabela viria vazia e pareceria "você não tem clientes" — bem
                  diferente de "seu plano não inclui isto". */}
              {!data.avancado ? (
                <UpgradeAviso texto={t("reports.advancedOnly")} botao={t("reports.upgradeButton")} />
              ) : data.topClients.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">{t("reports.topClients.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{t("reports.topClients.columns.client")}</TableHead>
                      <TableHead className="text-right">{t("reports.topClients.columns.invoiced")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topClients.map((c, i) => (
                      <TableRow key={c.name}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{c.name}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(c.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Separator />

      {/* Desempenho por profissional */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t("reports.byProfessional.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("reports.byProfessional.subtitle")}</p>
        </div>
        <Card>
          <CardContent className="p-0">
            {!data.avancado ? (
              <UpgradeAviso texto={t("reports.advancedOnly")} botao={t("reports.upgradeButton")} />
            ) : data.porProfissional.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("reports.byProfessional.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports.byProfessional.columns.professional")}</TableHead>
                      <TableHead className="text-right">{t("reports.byProfessional.columns.done")}</TableHead>
                      <TableHead className="text-right">{t("reports.byProfessional.columns.total")}</TableHead>
                      <TableHead className="text-right">{t("reports.byProfessional.columns.average")}</TableHead>
                      <TableHead className="text-right" title={t("reports.byProfessional.daysHint")}>
                        {t("reports.byProfessional.columns.days")}
                      </TableHead>
                      <TableHead className="text-right">{t("reports.byProfessional.columns.rating")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.porProfissional.map((p) => (
                      <TableRow key={p.id ?? "__sem__"}>
                        <TableCell className={`text-sm ${p.id === null ? "text-muted-foreground italic" : "font-medium"}`}>
                          {p.nome}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{p.concluidas}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatCurrency(p.total)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(p.ticketMedio)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {p.diasMedios === null ? "—" : p.diasMedios}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {/* A contagem de respostas anda junto com a nota:
                              "10,0" de uma resposta só não é "10,0". */}
                          {p.nota === null ? (
                            <span className="text-muted-foreground">{t("reports.byProfessional.noRating")}</span>
                          ) : (
                            <>
                              <span className="tabular-nums font-medium">{p.nota.toFixed(1)}</span>{" "}
                              <span className="text-xs text-muted-foreground">
                                ({t("reports.byProfessional.ratingCount", { n: p.respostas })})
                              </span>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold text-sm">{t("reports.totalLabel")}</TableCell>
                      <TableCell className="text-right font-bold text-sm tabular-nums">
                        {data.porProfissional.reduce((s, p) => s + p.concluidas, 0)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm tabular-nums">
                        {formatCurrency(data.porProfissional.reduce((s, p) => s + p.total, 0))}
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Detalhe receitas */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("reports.revenueDetail.title")}</h2>
        <Card>
          <CardContent className="p-0">
            {!data.avancado ? (
              <UpgradeAviso texto={t("reports.advancedOnly")} botao={t("reports.upgradeButton")} />
            ) : data.revenues.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("reports.revenueDetail.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.revenueDetail.columns.description")}</TableHead>
                    <TableHead>{t("reports.revenueDetail.columns.order")}</TableHead>
                    <TableHead>{t("reports.revenueDetail.columns.paidAt")}</TableHead>
                    <TableHead className="text-right">{t("reports.revenueDetail.columns.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.revenues.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {r.order ? formatOsNumber(r.order.number, r.order.createdAt) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.paidAt ? formatDate(r.paidAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-700">
                        {formatCurrency(Number(r.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold text-sm">{t("reports.totalLabel")}</TableCell>
                    <TableCell className="text-right font-bold text-green-700">
                      {formatCurrency(data.totalRevenue)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Detalhe despesas */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("reports.expenseDetail.title")}</h2>
        <Card>
          <CardContent className="p-0">
            {!data.avancado ? (
              <UpgradeAviso texto={t("reports.advancedOnly")} botao={t("reports.upgradeButton")} />
            ) : data.expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("reports.expenseDetail.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.expenseDetail.columns.description")}</TableHead>
                    <TableHead>{t("reports.expenseDetail.columns.category")}</TableHead>
                    <TableHead>{t("reports.expenseDetail.columns.paidAt")}</TableHead>
                    <TableHead className="text-right">{t("reports.expenseDetail.columns.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expenses.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{e.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {t(`expenseCategory.${e.category}` as "expenseCategory.FIXED")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.paidAt ? formatDate(e.paidAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-red-700">
                        {formatCurrency(Number(e.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold text-sm">{t("reports.totalLabel")}</TableCell>
                    <TableCell className="text-right font-bold text-red-700">
                      {formatCurrency(data.totalExpense)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
