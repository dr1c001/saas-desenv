import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

// Relatório para o dono da plataforma ler e encaminhar para a equipe de
// administração. Fica em português fixo, sem i18n, de propósito: tem uma única
// audiência, e traduzir relatório interno é trabalho sem leitor.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, padding: 32, color: "#1a1a1a" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    borderBottomWidth: 2, borderBottomColor: "#1a1a1a", paddingBottom: 10, marginBottom: 16,
  },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: "#666", marginTop: 2 },
  meta: { fontSize: 8, color: "#666", textAlign: "right" },
  sectionTitle: {
    fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    color: "#888", letterSpacing: 0.8, marginBottom: 6, marginTop: 14,
  },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  card: {
    width: "23.5%", borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 4,
    padding: 7, marginBottom: 6,
  },
  cardLabel: { fontSize: 7, color: "#666", marginBottom: 3 },
  cardValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  aviso: {
    borderWidth: 1, borderColor: "#f59e0b", backgroundColor: "#fffbeb",
    borderRadius: 4, padding: 8, marginTop: 8, color: "#92400e", fontSize: 8,
  },
  th: {
    flexDirection: "row", backgroundColor: "#f4f4f4", paddingVertical: 5,
    paddingHorizontal: 4, fontFamily: "Helvetica-Bold", fontSize: 7.5,
    borderBottomWidth: 1, borderBottomColor: "#ddd",
  },
  tr: {
    flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4,
    borderBottomWidth: 0.5, borderBottomColor: "#eee",
  },
  vazio: { fontSize: 8, color: "#888", paddingVertical: 8 },
  rodape: {
    position: "absolute", bottom: 20, left: 32, right: 32,
    borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 6,
    flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#888",
  },
})

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dia = (d: Date) => new Date(d).toLocaleDateString("pt-BR")

const ROTULO_STATUS: Record<string, string> = {
  TRIAL: "Sem assinatura",
  PENDING: "Aguardando pagamento",
  ACTIVE: "Ativa",
  PAST_DUE: "Inadimplente",
  CANCELLED: "Cancelada",
}

export type DadosRelatorio = {
  geradoEm: Date
  geradoPor: string
  filtro?: string
  resumo: {
    companies: number
    activeCompanies: number
    pendingCompanies: number
    pastDueCompanies: number
    cancelledCompanies: number
    trialCompanies: number
    users: number
    payingUsers: number
    mrr: number
  }
  evolucao: { mes: string; empresas: number; pagantes: number; mrr: number }[]
  empresas: {
    nome: string
    documento: string | null
    status: string
    plano: string | null
    valorMensal: number
    usuarios: number
    ordens: number
    clientes: number
    cadastroEm: Date
    renovaEm: Date | null
  }[]
  acoes: { quando: Date; quem: string; acao: string; detalhe: string | null }[]
}

const COLS = [
  { k: "nome", w: "26%", t: "Empresa" },
  { k: "status", w: "16%", t: "Status" },
  { k: "plano", w: "13%", t: "Plano" },
  { k: "valor", w: "12%", t: "Valor/mês" },
  { k: "usuarios", w: "8%", t: "Usuários" },
  { k: "ordens", w: "7%", t: "OS" },
  { k: "clientes", w: "8%", t: "Clientes" },
  { k: "renova", w: "10%", t: "Renova" },
] as const

export function AdminReportPDF({ dados }: { dados: DadosRelatorio }) {
  const r = dados.resumo
  const cartoes: [string, string][] = [
    ["Empresas", String(r.companies)],
    ["Ativas", String(r.activeCompanies)],
    ["Aguardando pagamento", String(r.pendingCompanies)],
    ["Sem assinatura", String(r.trialCompanies)],
    ["Inadimplentes", String(r.pastDueCompanies)],
    ["Canceladas", String(r.cancelledCompanies)],
    ["Usuários cadastrados", String(r.users)],
    ["Usuários pagantes", String(r.payingUsers)],
  ]

  return (
    <Document title={`ServiçoOS — Relatório administrativo ${dia(dados.geradoEm)}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>ServiçoOS</Text>
            <Text style={styles.subtitle}>
              Relatório administrativo{dados.filtro ? ` — busca: "${dados.filtro}"` : ""}
            </Text>
          </View>
          <View>
            <Text style={styles.meta}>Gerado em {dados.geradoEm.toLocaleString("pt-BR")}</Text>
            <Text style={styles.meta}>por {dados.geradoPor}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Resumo do negócio</Text>
        <View style={styles.cards}>
          {cartoes.map(([rotulo, valor]) => (
            <View key={rotulo} style={styles.card}>
              <Text style={styles.cardLabel}>{rotulo}</Text>
              <Text style={styles.cardValue}>{valor}</Text>
            </View>
          ))}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Receita recorrente (MRR)</Text>
            <Text style={styles.cardValue}>{brl(r.mrr)}</Text>
          </View>
        </View>

        {r.pendingCompanies > 0 && (
          <Text style={styles.aviso}>
            Atenção: {r.pendingCompanies} empresa(s) assinaram e aguardam confirmação de pagamento.
            Se o pagamento já caiu na Asaas, libere o acesso pelo painel — elas estão sem usar o sistema.
          </Text>
        )}

        <Text style={styles.sectionTitle}>Evolução mensal</Text>
        {dados.evolucao.length === 0 ? (
          <Text style={styles.vazio}>Ainda sem retratos mensais gravados.</Text>
        ) : (
          <View>
            <View style={styles.th}>
              <Text style={{ width: "25%" }}>Mês</Text>
              <Text style={{ width: "25%" }}>Empresas</Text>
              <Text style={{ width: "25%" }}>Pagantes</Text>
              <Text style={{ width: "25%" }}>MRR</Text>
            </View>
            {dados.evolucao.map((e) => (
              <View key={e.mes} style={styles.tr}>
                <Text style={{ width: "25%" }}>{e.mes}</Text>
                <Text style={{ width: "25%" }}>{e.empresas}</Text>
                <Text style={{ width: "25%" }}>{e.pagantes}</Text>
                <Text style={{ width: "25%" }}>{brl(e.mrr)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Empresas ({dados.empresas.length})</Text>
        <View style={styles.th}>
          {COLS.map((c) => (
            <Text key={c.k} style={{ width: c.w }}>{c.t}</Text>
          ))}
        </View>
        {dados.empresas.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma empresa encontrada.</Text>
        ) : (
          dados.empresas.map((e, i) => (
            <View key={`${e.nome}-${i}`} style={styles.tr} wrap={false}>
              <View style={{ width: "26%" }}>
                <Text>{e.nome}</Text>
                <Text style={{ fontSize: 7, color: "#888" }}>
                  {e.documento ?? "sem CNPJ"} · desde {dia(e.cadastroEm)}
                </Text>
              </View>
              <Text style={{ width: "16%" }}>{ROTULO_STATUS[e.status] ?? e.status}</Text>
              <Text style={{ width: "13%" }}>{e.plano ?? "—"}</Text>
              <Text style={{ width: "12%" }}>{e.plano ? brl(e.valorMensal) : "—"}</Text>
              <Text style={{ width: "8%" }}>{e.usuarios}</Text>
              <Text style={{ width: "7%" }}>{e.ordens}</Text>
              <Text style={{ width: "8%" }}>{e.clientes}</Text>
              <Text style={{ width: "10%" }}>{e.renovaEm ? dia(e.renovaEm) : "—"}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Últimas ações no painel</Text>
        {dados.acoes.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma ação registrada.</Text>
        ) : (
          dados.acoes.map((a, i) => (
            <View key={i} style={styles.tr} wrap={false}>
              <Text style={{ width: "18%" }}>{a.quando.toLocaleString("pt-BR")}</Text>
              <Text style={{ width: "24%" }}>{a.quem}</Text>
              <Text style={{ width: "18%" }}>{a.acao}</Text>
              <Text style={{ width: "40%" }}>{a.detalhe ?? "—"}</Text>
            </View>
          ))
        )}

        <View style={styles.rodape} fixed>
          <Text>ServiçoOS — documento interno. Contém dados de clientes; não repassar fora da equipe de administração.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
