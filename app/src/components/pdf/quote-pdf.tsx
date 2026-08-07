import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { getTranslator } from "@/lib/i18n"

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 12,
  },
  companyName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  docNumber: { fontSize: 11, textAlign: "right", color: "#555" },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#888",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { color: "#555", width: 90 },
  value: { flex: 1 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  totalLabel: { fontFamily: "Helvetica-Bold", marginRight: 24 },
  totalValue: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  signatureSection: {
    marginTop: 48,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    width: 200,
    paddingTop: 4,
    textAlign: "center",
    color: "#555",
    fontSize: 9,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: "#e8f4fd",
    alignSelf: "flex-start",
  },
})

type Props = {
  locale: "pt" | "en"
  companyName: string
  logoUrl?: string | null
  companyPhone?: string | null
  companyAddress?: string | null
  companyWebsite?: string | null
  quote: {
    number: number
    clientName: string
    clientAddress: string | null
    clientContact: string | null
    description: string
    materials: string | null
    amount: unknown
    notes: string | null
    status: string
    validUntil: Date | null
    createdAt: Date
  }
}

// Valor sempre em BRL (documento comercial brasileiro) — só o agrupamento de
// milhar/decimal e o formato de data seguem o idioma de leitura do tenant.
function fmtCurrency(value: number, locale: "pt" | "en") {
  return value.toLocaleString(locale === "en" ? "en-US" : "pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDateFor(date: Date | string, locale: "pt" | "en") {
  return new Date(date).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR")
}

function quoteNum(number: number, createdAt: Date | string) {
  const year = new Date(createdAt).getFullYear()
  return `ORC${year}${String(number).padStart(4, "0")}`
}

export function QuotePDF({ quote, companyName, logoUrl, companyPhone, companyAddress, companyWebsite, locale }: Props) {
  // PDFs são gerados via renderToBuffer, fora do request context do Next.js —
  // o locale vem explícito por prop (ver lib/i18n.ts).
  const t = getTranslator(locale, "pdf")
  const tc = getTranslator(locale, "common")
  const fmt = (value: number) => fmtCurrency(value, locale)
  const fmtDate = (date: Date | string) => fmtDateFor(date, locale)

  const docNumber = quoteNum(quote.number, quote.createdAt)
  // status vem do banco como string — .has() preserva o fallback pro valor cru
  // que o mapa local tinha antes (`statusLabel[status] ?? status`).
  const statusKey = `quoteStatus.${quote.status}` as "quoteStatus.DRAFT"
  const statusText = tc.has(statusKey) ? tc(statusKey) : quote.status

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {logoUrl ? (
              <Image src={logoUrl} style={{ height: 40, maxWidth: 160, objectFit: "contain" }} />
            ) : (
              <Text style={styles.companyName}>{companyName}</Text>
            )}
            {logoUrl && <Text style={{ fontSize: 11, marginTop: 4 }}>{companyName}</Text>}
            {companyAddress && <Text style={{ fontSize: 9, color: "#555", marginTop: 3 }}>{companyAddress}</Text>}
            {companyPhone && <Text style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{t("common.phonePrefix")} {companyPhone}</Text>}
            {companyWebsite && <Text style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{companyWebsite}</Text>}
          </View>
          <View>
            <Text style={styles.docTitle}>{t("quote.docTitle")}</Text>
            <Text style={styles.docNumber}>{docNumber}</Text>
          </View>
        </View>

        {/* Status + datas */}
        <View style={[styles.section, { flexDirection: "row", gap: 24 }]}>
          <View>
            <Text style={styles.sectionTitle}>{t("common.status")}</Text>
            <View style={styles.statusBadge}>
              <Text>{statusText}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.sectionTitle}>{t("quote.createdAt")}</Text>
            <Text>{fmtDate(quote.createdAt)}</Text>
          </View>
          {quote.validUntil && (
            <View>
              <Text style={styles.sectionTitle}>{t("quote.validUntil")}</Text>
              <Text>{fmtDate(quote.validUntil)}</Text>
            </View>
          )}
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("common.clientTitle")}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t("common.nameLabel")}</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>{quote.clientName}</Text>
          </View>
          {quote.clientContact && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("quote.contactLabel")}</Text>
              <Text style={styles.value}>{quote.clientContact}</Text>
            </View>
          )}
          {quote.clientAddress && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("common.addressLabel")}</Text>
              <Text style={styles.value}>{quote.clientAddress}</Text>
            </View>
          )}
        </View>

        {/* Serviço */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("quote.whatNeedsToBeDone")}</Text>
          <Text style={{ color: "#555" }}>{quote.description}</Text>
        </View>

        {quote.materials && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("quote.materialsTitle")}</Text>
            <Text style={{ color: "#555" }}>{quote.materials}</Text>
          </View>
        )}

        {quote.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("quote.notesTitle")}</Text>
            <Text style={{ color: "#555" }}>{quote.notes}</Text>
          </View>
        )}

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t("quote.totalAmount")}</Text>
          <Text style={styles.totalValue}>{fmt(Number(quote.amount))}</Text>
        </View>

        {/* Assinaturas */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureLine}>{t("common.clientSignature")}</Text>
          <Text style={styles.signatureLine}>{t("common.responsibleSignature")}</Text>
        </View>
      </Page>
    </Document>
  )
}
