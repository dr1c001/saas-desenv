import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { formatOsNumber } from "@/lib/utils"
import { getTranslator } from "@/lib/i18n"

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, padding: 40, color: "#1a1a1a" },
  header: {
    flexDirection: "row", justifyContent: "space-between", marginBottom: 24,
    borderBottomWidth: 2, borderBottomColor: "#1a1a1a", paddingBottom: 12,
  },
  companyName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  number: { fontSize: 11, textAlign: "right", color: "#555" },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    color: "#888", letterSpacing: 0.8, marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { color: "#555", width: 110 },
  value: { flex: 1, fontFamily: "Helvetica-Bold" },
  box: {
    backgroundColor: "#f4f4f4", borderRadius: 4, padding: 12, marginTop: 16, marginBottom: 16,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  amountLabel: { fontSize: 12 },
  amount: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#16a34a" },
  signatureSection: {
    marginTop: 48, flexDirection: "row", justifyContent: "space-between",
  },
  signatureLine: {
    borderTopWidth: 1, borderTopColor: "#1a1a1a", width: 200,
    paddingTop: 4, textAlign: "center", color: "#555", fontSize: 9,
  },
  stamp: {
    marginTop: 24, borderWidth: 2, borderColor: "#16a34a", borderRadius: 4,
    padding: 8, alignSelf: "center", textAlign: "center",
  },
  // O carimbo reaproveita common.paymentStatus.PAID ("Pago"/"Paid"), que vem
  // em caixa normal — o caixa alta do carimbo fica no estilo.
  stampText: { color: "#16a34a", fontFamily: "Helvetica-Bold", fontSize: 14, textTransform: "uppercase" },
})

// Valor sempre em BRL (documento comercial brasileiro) — só o agrupamento de
// milhar/decimal e o formato de data seguem o idioma de leitura do tenant.
function fmtCurrency(v: number, locale: "pt" | "en") {
  return v.toLocaleString(locale === "en" ? "en-US" : "pt-BR", { style: "currency", currency: "BRL" })
}
function fmtDateFor(d: Date | string, locale: "pt" | "en") {
  return new Date(d).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR")
}

type Props = {
  locale: "pt" | "en"
  companyName: string
  logoUrl?: string | null
  receipt: {
    id: string
    description: string
    amount: unknown
    dueDate: Date
    paidAt: Date | null
    order?: { number: number; createdAt: Date; title: string } | null
  }
}

export function ReceiptPDF({ receipt, companyName, logoUrl, locale }: Props) {
  // PDFs são gerados via renderToBuffer, fora do request context do Next.js —
  // o locale vem explícito por prop (ver lib/i18n.ts).
  const t = getTranslator(locale, "pdf")
  const tc = getTranslator(locale, "common")
  const fmt = (v: number) => fmtCurrency(v, locale)
  const fmtDate = (d: Date | string) => fmtDateFor(d, locale)

  const receiptNumber = `REC-${receipt.id.slice(-8).toUpperCase()}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {logoUrl
              ? <Image src={logoUrl} style={{ height: 40, maxWidth: 160, objectFit: "contain" }} />
              : <Text style={styles.companyName}>{companyName}</Text>}
            {logoUrl && <Text style={{ fontSize: 11, marginTop: 4 }}>{companyName}</Text>}
          </View>
          <View>
            <Text style={styles.title}>{t("receipt.docTitle")}</Text>
            <Text style={styles.number}>{receiptNumber}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.amountLabel}>{t("receipt.amountReceivedLabel")}</Text>
          <Text style={styles.amount}>{fmt(Number(receipt.amount))}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("receipt.paymentDataTitle")}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t("receipt.descriptionLabel")}</Text>
            <Text style={styles.value}>{receipt.description}</Text>
          </View>
          {receipt.order && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("receipt.linkedOrderLabel")}</Text>
              <Text style={styles.value}>
                {`${formatOsNumber(receipt.order.number, receipt.order.createdAt)} — ${receipt.order.title}`}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>{t("receipt.dueDateLabel")}</Text>
            <Text style={styles.value}>{fmtDate(receipt.dueDate)}</Text>
          </View>
          {receipt.paidAt && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("receipt.paidAtLabel")}</Text>
              <Text style={styles.value}>{fmtDate(receipt.paidAt)}</Text>
            </View>
          )}
        </View>

        <View style={styles.stamp}>
          <Text style={styles.stampText}>{tc("paymentStatus.PAID")}</Text>
        </View>

        <View style={styles.signatureSection}>
          <Text style={styles.signatureLine}>{t("receipt.payerSignature")}</Text>
          <Text style={styles.signatureLine}>{t("receipt.receiverSignature")}</Text>
        </View>
      </Page>
    </Document>
  )
}
