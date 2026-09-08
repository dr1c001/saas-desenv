"use server"

import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { brtMidnightUTC, todayInBRT } from "@/lib/utils"
import { REGIME_PADRAO, regimeValido, type Regime } from "@/lib/competencia"
import { temRecurso } from "@/lib/plan"
import { agruparPorProfissional } from "@/lib/relatorio-profissional"
import { getTranslations } from "next-intl/server"
import { quemPaga, somarPorPagador } from "@/lib/subcliente"

export async function getReportData(from: string, to: string, regimePedido?: string) {
  const { tenantId, role } = await getTenant()
  // Auto-defesa: mesmo padrão do getFinanceSummary() em finance.ts — Action
  // tem Action ID próprio, despachável independente da página que redireciona
  // antes. (Achado em revisão de segurança 2026-07-21.)
  if (role !== "OWNER" && role !== "ADMIN") throw new Error((await getTranslations("common"))("noPermission"))
  await requireActiveSubscription(tenantId)

  // "Relatórios básicos" (Starter) x "avançados" (Pro+). A linha fica assim:
  // básico responde "como foi o meu mês" — resumo de receita/despesa/resultado
  // e OS por status. Avançado responde "como foi o período X e quem são meus
  // melhores clientes" — período personalizado, ranking de clientes e
  // detalhamento de receitas.
  //
  // O período é forçado aqui no servidor, não escondido na tela: a Action tem
  // ID próprio e é despachável direto com qualquer from/to.
  const avancado = await temRecurso(tenantId, "advancedReports")

  let [fromY, fromM, fromD] = from.split("-").map(Number)
  let [toY, toM, toD] = to.split("-").map(Number)
  if (!avancado) {
    const { year, month } = todayInBRT()
    ;[fromY, fromM, fromD] = [year, month + 1, 1]
    // Dia 0 do mês seguinte = último dia do mês corrente.
    ;[toY, toM, toD] = [year, month + 1, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()]
  }
  // from/to vêm do <input type="date"> como "AAAA-MM-DD" — new Date(from)
  // parseava isso como meia-noite UTC, que é 21h do dia anterior em horário
  // de Brasília (UTC-3): o relatório de "01/08" incluía 3h da noite de
  // 31/07. Monta os limites como meia-noite BRT de verdade (ver
  // brtMidnightUTC em lib/utils.ts), fim exclusive (início do dia seguinte)
  // em vez de 23:59:59 pra não truncar o último segundo do dia.
  // (Achado verificando o sistema antes da primeira venda, 2026-08-03.)
  const start = brtMidnightUTC(fromY, fromM - 1, fromD)
  const end = brtMidnightUTC(toY, toM - 1, toD + 1)

  // Caixa continua sendo o padrão. Trocá-lo faria todos os meses que o dono já
  // conferiu mudarem de valor de um dia para o outro, sem ele ter pedido — e o
  // relatório é justamente o número em que ele mais confia.
  const regime: Regime =
    regimePedido && regimeValido(regimePedido) ? regimePedido : REGIME_PADRAO

  // Em COMPETÊNCIA o lançamento entra pelo fato, tenha o dinheiro se movido ou
  // não — então a consulta não pode filtrar por `status: PAID` nem por `paidAt`.
  // O recorte do período é feito depois, em memória, pela mesma regra dos dois
  // lados (ver lib/competencia.ts): somar receita por um critério e despesa por
  // outro é exatamente o defeito que este regime existe para consertar.
  const janelaCaixa = { status: "PAID" as const, paidAt: { gte: start, lt: end } }
  const janelaCompetencia = {
    OR: [
      { accrualDate: { gte: start, lt: end } },
      { accrualDate: null, dueDate: { gte: start, lt: end } },
    ],
  }
  const janela = regime === "caixa" ? janelaCaixa : janelaCompetencia

  const [revenues, expenses, orders, topClients, concluidas, equipe] = await Promise.all([
    prisma.revenue.findMany({
      where: { tenantId, ...janela },
      include: { order: { select: { number: true, title: true, createdAt: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.expense.findMany({
      where: { tenantId, ...janela },
      orderBy: { dueDate: "asc" },
    }),
    prisma.serviceOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lt: end },
        status: { notIn: ["CANCELLED"] },
      },
      select: { status: true, totalAmount: true },
    }),
    prisma.client.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        // O contratante vem junto: o ranking soma por QUEM PAGA, e nao por
        // onde o servico aconteceu. Ver o porque logo abaixo, em `ranked`.
        parentId: true,
        serviceOrders: {
          where: {
            status: "INVOICED",
            revenues: { some: { status: "PAID", paidAt: { gte: start, lt: end } } },
          },
          select: { totalAmount: true, payerId: true },
        },
      },
    }),
    // Desempenho por profissional: conta por CONCLUSÃO, não por abertura.
    // Serviço aberto em julho e terminado em agosto é produção de agosto.
    prisma.serviceOrder.findMany({
      where: {
        tenantId,
        concludedAt: { gte: start, lt: end },
        status: { notIn: ["CANCELLED"] },
      },
      select: {
        technicianId: true,
        totalAmount: true,
        createdAt: true,
        concludedAt: true,
        npsScore: true,
      },
    }),
    // A equipe inteira, não só os técnicos: o dono também pega serviço, e sem
    // o nome dele aqui a linha dele sairia como "sem responsável".
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, role: true },
    }),
  ])

  const totalRevenue = revenues.reduce((s, r) => s + Number(r.amount), 0)
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const result = totalRevenue - totalExpense

  const osByStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const tCommon = await getTranslations("common")
  const porProfissional = agruparPorProfissional(
    concluidas.map((o) => ({
      technicianId: o.technicianId,
      totalAmount: Number(o.totalAmount),
      createdAt: o.createdAt,
      // O where já garante que não é nulo; o tipo do Prisma não sabe disso.
      concludedAt: o.concludedAt!,
      npsScore: o.npsScore,
    })),
    equipe.map((u) => ({ id: u.id, name: u.name, emCampo: u.role === "TECHNICIAN" })),
    tCommon("unassigned")
  )

  // O ranking soma por QUEM PAGA, e nao por cliente da OS.
  //
  // Sem isto, uma administradora com trinta condominios teria o faturamento
  // dela espalhado entre os trinta: nenhum entra no Top 10, e o cliente que
  // MAIS fatura some do relatorio inteiro. Quem nao trabalha com subcliente
  // nao ve diferenca nenhuma — sem contratante, quem paga e o proprio cliente.
  const nomePorId = new Map(topClients.map((c) => [c.id, c.name]))
  const porPagador = somarPorPagador(
    topClients.flatMap((c) =>
      c.serviceOrders.map((o) => ({
        pagador: quemPaga({ id: c.id, parentId: c.parentId }, o.payerId),
        valor: Number(o.totalAmount),
      }))
    ),
    (o) => o.pagador,
    (o) => o.valor
  )

  const ranked = [...porPagador.entries()]
    .map(([id, total]) => ({ name: nomePorId.get(id) ?? "", total }))
    .filter((c) => c.total > 0 && c.name !== "")
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return {
    avancado,
    // Período efetivamente usado — no plano básico pode não ser o que foi
    // pedido, e a tela precisa mostrar o que de fato está em cima da mesa.
    periodo: {
      from: start.toISOString().slice(0, 10),
      to: new Date(end.getTime() - 86400000).toISOString().slice(0, 10),
    },
    // Totais e CONTAGENS fazem parte do básico — são o "como foi meu mês".
    // Qual regime respondeu. A tela PRECISA dizer isto: os dois números são
    // plausíveis, e um relatório que não diz qual pergunta respondeu é o
    // defeito de origem outra vez, só que com duas respostas.
    regime,
    totalRevenue,
    totalExpense,
    result,
    revenueCount: revenues.length,
    expenseCount: expenses.length,
    osByStatus,
    // Já o DETALHAMENTO linha a linha e o ranking de clientes são o avançado.
    // Vão vazios de verdade no Starter, não apenas escondidos no HTML: a
    // Action é despachável direto, e esconder na tela não esconderia o dado.
    revenues: avancado ? revenues : [],
    expenses: avancado ? expenses : [],
    topClients: avancado ? ranked : [],
    // Desempenho por profissional é da mesma classe do ranking de clientes:
    // responde "quem" em vez de "quanto". Vai vazio de verdade no Starter,
    // não só escondido na tela — a Action é despachável direto.
    porProfissional: avancado ? porProfissional : [],
  }
}
