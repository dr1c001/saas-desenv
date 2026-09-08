import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { getTranslator } from "@/lib/i18n"

// A FATURA: o documento de cobrança que vai anexado no e-mail.
//
// ─── Por que não dava para reaproveitar o recibo ─────────────────────────────
//
// `receipt-pdf.tsx` carimba "PAGO" incondicionalmente, e a rota dele só abre
// para conta já quitada. É o documento OPOSTO: o recibo prova que entrou, a
// fatura pede que entre.
//
// ─── Por que o número é o da OS ─────────────────────────────────────────────
//
// Uma numeração própria de fatura seria mais uma sequência para manter, com o
// mesmo problema de concorrência que a OS e o orçamento já tiveram — e sem
// ganho: o cliente identifica o serviço pelo número da OS, que é o que está no
// e-mail, no portal e na nota fiscal.
//
// ─── O que ela mostra ───────────────────────────────────────────────────────
//
// As parcelas EM ABERTO, com vencimento, e o total. Não o serviço inteiro: o
// cliente que já pagou a entrada não quer receber um documento cobrando os
// R$ 2.000 outra vez. As pagas aparecem, riscadas, para a conta fechar na
// cabeça de quem lê.

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, padding: 40, color: "#1a1a1a" },
  header: {
    flexDirection: "row", justifyContent: "space-between", marginBottom: 24,
    borderBottomWidth: 2, borderBottomColor: "#1a1a1a", paddingBottom: 12,
  },
  companyName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  companyLine: { fontSize: 9, color: "#555", marginTop: 2 },
  logo: { width: 90, height: 36, objectFit: "contain", marginBottom: 6 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  number: { fontSize: 11, textAlign: "right", color: "#555" },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    color: "#888", letterSpacing: 0.8, marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { color: "#555", width: 110 },
  value: { flex: 1 },
  tabela: { marginTop: 4 },
  th: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ddd",
    paddingBottom: 4, marginBottom: 4,
  },
  td: { flexDirection: "row", paddingVertical: 3 },
  colDesc: { flex: 1 },
  colVenc: { width: 80, textAlign: "right" },
  colValor: { width: 90, textAlign: "right" },
  paga: { color: "#888", textDecoration: "line-through" },
  caixa: {
    backgroundColor: "#f4f4f4", borderRadius: 4, padding: 12, marginTop: 16,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  totalLabel: { fontSize: 12 },
  total: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  pixTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 4 },
  pixCodigo: {
    fontSize: 7, fontFamily: "Courier", backgroundColor: "#f4f4f4",
    padding: 8, borderRadius: 4, color: "#333",
  },
  rodape: { marginTop: 28, fontSize: 8, color: "#888", textAlign: "center" },
})

function fmtCurrency(v: number, locale: "pt" | "en") {
  return v.toLocaleString(locale === "en" ? "en-US" : "pt-BR", { style: "currency", currency: "BRL" })
}
function fmtDateFor(d: Date | string, locale: "pt" | "en") {
  return new Date(d).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR", {
    timeZone: locale === "en" ? "UTC" : "America/Sao_Paulo",
  })
}

export type LinhaDaFatura = {
  descricao: string
  vencimento: Date
  valor: number
  paga: boolean
}

export type DadosDaFatura = {
  locale: "pt" | "en"
  empresa: { nome: string; documento?: string | null; telefone?: string | null; logoUrl?: string | null }
  cliente: { nome: string; documento?: string | null }
  /** O número da OS, como o cliente o vê: OS20260042. */
  numero: string
  titulo: string
  linhas: LinhaDaFatura[]
  /** A soma do que está EM ABERTO. */
  totalEmAberto: number
  /** O código copia-e-cola do PIX da empresa, quando ela configurou. */
  pix?: string | null
  emitidaEm: Date
}

export function FaturaPDF({ dados }: { dados: DadosDaFatura }) {
  // PDF é gerado fora do request do Next (renderToBuffer), então o idioma vem
  // por prop — ver lib/i18n.ts.
  const t = getTranslator(dados.locale, "pdf")
  const fmt = (v: number) => fmtCurrency(v, dados.locale)
  const data = (d: Date | string) => fmtDateFor(d, dados.locale)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {dados.empresa.logoUrl && <Image src={dados.empresa.logoUrl} style={styles.logo} />}
            <Text style={styles.companyName}>{dados.empresa.nome}</Text>
            {dados.empresa.documento && (
              <Text style={styles.companyLine}>{dados.empresa.documento}</Text>
            )}
            {dados.empresa.telefone && (
              <Text style={styles.companyLine}>{dados.empresa.telefone}</Text>
            )}
          </View>
          <View>
            <Text style={styles.title}>{t("fatura.titulo")}</Text>
            <Text style={styles.number}>{dados.numero}</Text>
            <Text style={styles.number}>{data(dados.emitidaEm)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("fatura.cliente")}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t("fatura.nome")}</Text>
            <Text style={styles.value}>{dados.cliente.nome}</Text>
          </View>
          {dados.cliente.documento && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("fatura.documento")}</Text>
              <Text style={styles.value}>{dados.cliente.documento}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>{t("fatura.servico")}</Text>
            <Text style={styles.value}>{dados.titulo}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("fatura.parcelas")}</Text>
          <View style={styles.tabela}>
            <View style={styles.th}>
              <Text style={styles.colDesc}>{t("fatura.descricao")}</Text>
              <Text style={styles.colVenc}>{t("fatura.vencimento")}</Text>
              <Text style={styles.colValor}>{t("fatura.valor")}</Text>
            </View>
            {dados.linhas.map((l, i) => (
              <View key={i} style={styles.td}>
                {/* A parcela paga aparece RISCADA, e não some: a conta precisa
                    fechar na cabeça de quem lê o documento. */}
                <Text style={[styles.colDesc, ...(l.paga ? [styles.paga] : [])]}>{l.descricao}</Text>
                <Text style={[styles.colVenc, ...(l.paga ? [styles.paga] : [])]}>
                  {data(l.vencimento)}
                </Text>
                <Text style={[styles.colValor, ...(l.paga ? [styles.paga] : [])]}>
                  {fmt(l.valor)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.caixa}>
          <Text style={styles.totalLabel}>{t("fatura.totalEmAberto")}</Text>
          <Text style={styles.total}>{fmt(dados.totalEmAberto)}</Text>
        </View>

        {dados.pix && (
          <View>
            <Text style={styles.pixTitulo}>{t("fatura.pix")}</Text>
            <Text style={styles.pixCodigo}>{dados.pix}</Text>
          </View>
        )}

        <Text style={styles.rodape}>{t("fatura.desconsidere")}</Text>
      </Page>
    </Document>
  )
}
