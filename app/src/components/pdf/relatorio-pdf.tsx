import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"

// O relatorio da empresa, em PDF — para levar ao contador, ao socio, ao banco.
//
// ─── O que este arquivo NAO faz ──────────────────────────────────────────────
//
// Nao consulta o banco, e nao decide o que a empresa pode ver. Recebe pronto o
// que `getReportData` devolveu, e essa funcao ja aplica a fronteira entre
// relatorio basico e avancado.
//
// A alternativa — o PDF montar as proprias consultas — teria criado uma PORTA
// LATERAL: um endereco que devolve, em arquivo, o ranking de clientes e o
// detalhamento que o plano Starter nao inclui. Regra de plano duplicada e
// regra de plano que diverge.
//
// Por isso as listas avancadas chegam VAZIAS no Starter, e este componente so
// precisa saber desenhar lista vazia.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, padding: 32, color: "#1a1a1a" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    borderBottomWidth: 2, borderBottomColor: "#1a1a1a", paddingBottom: 10, marginBottom: 16,
  },
  esquerda: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  marca: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 8, color: "#666", marginTop: 1.5 },
  meta: { fontSize: 8, color: "#666", textAlign: "right" },

  tituloSecao: {
    fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    color: "#888", letterSpacing: 0.8, marginBottom: 6, marginTop: 16,
  },

  cartoes: { flexDirection: "row", gap: 8 },
  cartao: {
    flex: 1, borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 4, padding: 9,
  },
  cartaoRotulo: { fontSize: 7, color: "#666", marginBottom: 3 },
  cartaoValor: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  cartaoNota: { fontSize: 7, color: "#888", marginTop: 2 },

  th: {
    flexDirection: "row", backgroundColor: "#f4f4f4", paddingVertical: 5,
    paddingHorizontal: 4, fontFamily: "Helvetica-Bold", fontSize: 7.5,
    borderBottomWidth: 1, borderBottomColor: "#ddd",
  },
  tr: {
    flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4,
    borderBottomWidth: 0.5, borderBottomColor: "#eee",
  },
  trTotal: {
    flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: "#1a1a1a", fontFamily: "Helvetica-Bold",
  },
  vazio: { fontSize: 8, color: "#888", paddingVertical: 8 },

  aviso: {
    borderLeftWidth: 3, borderLeftColor: "#f59e0b", backgroundColor: "#fffbeb",
    borderRadius: 3, padding: 9, marginTop: 16, color: "#92400e", fontSize: 8,
  },

  rodape: {
    position: "absolute", bottom: 20, left: 32, right: 32,
    borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 6,
    flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#888",
  },
})

const brl = (v: number) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dia = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—"

const ROTULO_STATUS: Record<string, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  INVOICED: "Faturada",
  CANCELLED: "Cancelada",
}

const ROTULO_CATEGORIA: Record<string, string> = {
  FIXED: "Fixa",
  VARIABLE: "Variável",
  OTHER: "Outra",
}

export type DadosDoRelatorio = {
  /** Os mesmos dados que saem no cabecalho da OS e do orcamento. Este PDF vai
   *  para contador, socio e banco — precisa se identificar sozinho, porque
   *  chega desacompanhado de qualquer contexto. */
  empresa: {
    nome: string
    documento: string | null
    logoUrl: string | null
    telefone: string | null
    endereco: string | null
    site: string | null
  }
  periodo: { from: string; to: string }
  geradoEm: Date
  /** Falso = plano básico. Governa o aviso do rodapé, e nada mais: as listas
   *  avançadas já chegam vazias. */
  avancado: boolean
  totalRevenue: number
  totalExpense: number
  result: number
  revenueCount: number
  expenseCount: number
  osByStatus: Record<string, number>
  topClients: { name: string; total: number }[]
  porProfissional: {
    nome: string
    concluidas: number
    total: number
    ticketMedio: number
    diasMedios: number | null
    nota: number | null
    respostas: number
  }[]
  revenues: {
    description: string
    amount: unknown
    paidAt: Date | null
    order?: { number: number; title: string } | null
  }[]
  expenses: { description: string; amount: unknown; paidAt: Date | null; category: string }[]
}

function Coluna({ w, children, right }: { w: string; children: React.ReactNode; right?: boolean }) {
  return <Text style={{ width: w, textAlign: right ? "right" : "left" }}>{children}</Text>
}

export function RelatorioPDF({ d }: { d: DadosDoRelatorio }) {
  const periodo = `${dia(d.periodo.from)} a ${dia(d.periodo.to)}`
  const lucro = d.result >= 0

  return (
    <Document title={`Relatório — ${d.empresa.nome}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.esquerda}>
            {d.empresa.logoUrl ? (
              /* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não aceita alt */
              <Image src={d.empresa.logoUrl} style={styles.logo} />
            ) : null}
            <View>
              <Text style={styles.marca}>{d.empresa.nome}</Text>
              {d.empresa.documento ? <Text style={styles.sub}>{d.empresa.documento}</Text> : null}
              {d.empresa.endereco ? <Text style={styles.sub}>{d.empresa.endereco}</Text> : null}
              {d.empresa.telefone ? <Text style={styles.sub}>Tel: {d.empresa.telefone}</Text> : null}
              {d.empresa.site ? <Text style={styles.sub}>{d.empresa.site}</Text> : null}
            </View>
          </View>
          <View>
            <Text style={styles.meta}>Relatório do período</Text>
            <Text style={[styles.meta, { fontFamily: "Helvetica-Bold", color: "#1a1a1a" }]}>
              {periodo}
            </Text>
            <Text style={styles.meta}>Gerado em {dia(d.geradoEm)}</Text>
          </View>
        </View>

        {/* ── Resultado ─────────────────────────────────────────────────── */}
        <Text style={styles.tituloSecao}>Resultado do período</Text>
        <View style={styles.cartoes}>
          <View style={styles.cartao}>
            <Text style={styles.cartaoRotulo}>Receitas recebidas</Text>
            <Text style={styles.cartaoValor}>{brl(d.totalRevenue)}</Text>
            <Text style={styles.cartaoNota}>
              {d.revenueCount} pagamento{d.revenueCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={styles.cartao}>
            <Text style={styles.cartaoRotulo}>Despesas pagas</Text>
            <Text style={styles.cartaoValor}>{brl(d.totalExpense)}</Text>
            <Text style={styles.cartaoNota}>
              {d.expenseCount} despesa{d.expenseCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={[styles.cartao, { borderColor: lucro ? "#16a34a" : "#dc2626" }]}>
            <Text style={styles.cartaoRotulo}>{lucro ? "Lucro" : "Prejuízo"}</Text>
            <Text style={[styles.cartaoValor, { color: lucro ? "#16a34a" : "#dc2626" }]}>
              {brl(Math.abs(d.result))}
            </Text>
            <Text style={styles.cartaoNota}>receitas menos despesas</Text>
          </View>
        </View>

        {/* ── OS por status ─────────────────────────────────────────────── */}
        <Text style={styles.tituloSecao}>Ordens de serviço por status</Text>
        {Object.keys(d.osByStatus).length === 0 ? (
          <Text style={styles.vazio}>Nenhuma ordem de serviço no período.</Text>
        ) : (
          <View>
            <View style={styles.th}>
              <Coluna w="70%">Status</Coluna>
              <Coluna w="30%" right>Quantidade</Coluna>
            </View>
            {Object.entries(d.osByStatus).map(([status, n]) => (
              <View key={status} style={styles.tr}>
                <Coluna w="70%">{ROTULO_STATUS[status] ?? status}</Coluna>
                <Coluna w="30%" right>{String(n)}</Coluna>
              </View>
            ))}
          </View>
        )}

        {/* ── Clientes ──────────────────────────────────────────────────── */}
        {d.topClients.length > 0 && (
          <>
            <Text style={styles.tituloSecao}>Clientes que mais faturaram</Text>
            <View style={styles.th}>
              <Coluna w="70%">Cliente</Coluna>
              <Coluna w="30%" right>Faturado</Coluna>
            </View>
            {d.topClients.map((c) => (
              <View key={c.name} style={styles.tr}>
                <Coluna w="70%">{c.name}</Coluna>
                <Coluna w="30%" right>{brl(c.total)}</Coluna>
              </View>
            ))}
          </>
        )}

        {/* ── Desempenho ────────────────────────────────────────────────── */}
        {d.porProfissional.length > 0 && (
          <>
            <Text style={styles.tituloSecao}>Desempenho por profissional</Text>
            <View style={styles.th}>
              <Coluna w="34%">Profissional</Coluna>
              <Coluna w="14%" right>Concluídas</Coluna>
              <Coluna w="20%" right>Total</Coluna>
              <Coluna w="16%" right>Ticket médio</Coluna>
              <Coluna w="16%" right>Dias médios</Coluna>
            </View>
            {d.porProfissional.map((p) => (
              <View key={p.nome} style={styles.tr}>
                <Coluna w="34%">
                  {p.nome}
                  {p.nota !== null ? ` · nota ${p.nota.toFixed(1)} (${p.respostas})` : ""}
                </Coluna>
                <Coluna w="14%" right>{String(p.concluidas)}</Coluna>
                <Coluna w="20%" right>{brl(p.total)}</Coluna>
                <Coluna w="16%" right>{brl(p.ticketMedio)}</Coluna>
                <Coluna w="16%" right>
                  {p.diasMedios === null ? "—" : p.diasMedios.toFixed(1)}
                </Coluna>
              </View>
            ))}
          </>
        )}

        <Text
          style={styles.rodape}
          render={({ pageNumber, totalPages }) =>
            `${d.empresa.nome} · ${periodo}          Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />
      </Page>

      {/* ── Detalhamento: página própria ────────────────────────────────────
          Separado por ser LISTA LONGA. Junto com os totais, uma empresa com
          duzentos lançamentos empurraria o resultado do período para a segunda
          página — e o resultado é o que quem recebe o relatório abre para ver
          primeiro. */}
      {(d.revenues.length > 0 || d.expenses.length > 0) && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <View>
              <Text style={styles.marca}>Detalhamento</Text>
              <Text style={styles.sub}>{d.empresa.nome}</Text>
              {d.empresa.documento ? <Text style={styles.sub}>{d.empresa.documento}</Text> : null}
            </View>
            <Text style={styles.meta}>{periodo}</Text>
          </View>

          <Text style={styles.tituloSecao}>Receitas recebidas</Text>
          {d.revenues.length === 0 ? (
            <Text style={styles.vazio}>Nenhuma receita no período.</Text>
          ) : (
            <View>
              <View style={styles.th}>
                <Coluna w="46%">Descrição</Coluna>
                <Coluna w="18%">Ordem</Coluna>
                <Coluna w="18%">Pago em</Coluna>
                <Coluna w="18%" right>Valor</Coluna>
              </View>
              {d.revenues.map((r, i) => (
                <View key={i} style={styles.tr} wrap={false}>
                  <Coluna w="46%">{r.description}</Coluna>
                  <Coluna w="18%">{r.order ? `#${r.order.number}` : "—"}</Coluna>
                  <Coluna w="18%">{dia(r.paidAt)}</Coluna>
                  <Coluna w="18%" right>{brl(Number(r.amount))}</Coluna>
                </View>
              ))}
              <View style={styles.trTotal}>
                <Coluna w="82%">Total</Coluna>
                <Coluna w="18%" right>{brl(d.totalRevenue)}</Coluna>
              </View>
            </View>
          )}

          <Text style={styles.tituloSecao}>Despesas pagas</Text>
          {d.expenses.length === 0 ? (
            <Text style={styles.vazio}>Nenhuma despesa no período.</Text>
          ) : (
            <View>
              <View style={styles.th}>
                <Coluna w="46%">Descrição</Coluna>
                <Coluna w="18%">Categoria</Coluna>
                <Coluna w="18%">Pago em</Coluna>
                <Coluna w="18%" right>Valor</Coluna>
              </View>
              {d.expenses.map((e, i) => (
                <View key={i} style={styles.tr} wrap={false}>
                  <Coluna w="46%">{e.description}</Coluna>
                  <Coluna w="18%">{ROTULO_CATEGORIA[e.category] ?? e.category}</Coluna>
                  <Coluna w="18%">{dia(e.paidAt)}</Coluna>
                  <Coluna w="18%" right>{brl(Number(e.amount))}</Coluna>
                </View>
              ))}
              <View style={styles.trTotal}>
                <Coluna w="82%">Total</Coluna>
                <Coluna w="18%" right>{brl(d.totalExpense)}</Coluna>
              </View>
            </View>
          )}

          <Text
            style={styles.rodape}
            render={({ pageNumber, totalPages }) =>
              `${d.empresa.nome} · ${periodo}          Página ${pageNumber} de ${totalPages}`
            }
            fixed
          />
        </Page>
      )}

      {/* O aviso do plano básico vai na PRIMEIRA página quando não há
          detalhamento — senão o PDF terminaria sem explicar por que só tem
          totais, e quem recebe concluiria que o sistema não faz mais que isso. */}
      {!d.avancado && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.marca}>{d.empresa.nome}</Text>
            <Text style={styles.meta}>{periodo}</Text>
          </View>
          <View style={styles.aviso}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
              Este é o relatório básico
            </Text>
            <Text>
              O ranking de clientes, o desempenho por profissional e o detalhamento
              lançamento a lançamento fazem parte dos relatórios avançados, incluídos a
              partir do plano Pro. O período também fica no mês corrente — no plano Pro
              dá para escolher qualquer intervalo.
            </Text>
          </View>
          <Text
            style={styles.rodape}
            render={({ pageNumber, totalPages }) =>
              `${d.empresa.nome} · ${periodo}          Página ${pageNumber} de ${totalPages}`
            }
            fixed
          />
        </Page>
      )}
    </Document>
  )
}
