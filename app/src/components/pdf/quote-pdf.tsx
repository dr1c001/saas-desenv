import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"

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

const statusLabel: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
}

type Props = {
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

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(date: Date | string) {
  return new Date(date).toLocaleDateString("pt-BR")
}

function quoteNum(number: number, createdAt: Date | string) {
  const year = new Date(createdAt).getFullYear()
  return `ORC${year}${String(number).padStart(4, "0")}`
}

export function QuotePDF({ quote, companyName, logoUrl, companyPhone, companyAddress, companyWebsite }: Props) {
  const docNumber = quoteNum(quote.number, quote.createdAt)

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
            {companyPhone && <Text style={{ fontSize: 9, color: "#555", marginTop: 1 }}>Tel: {companyPhone}</Text>}
            {companyWebsite && <Text style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{companyWebsite}</Text>}
          </View>
          <View>
            <Text style={styles.docTitle}>Orçamento</Text>
            <Text style={styles.docNumber}>{docNumber}</Text>
          </View>
        </View>

        {/* Status + datas */}
        <View style={[styles.section, { flexDirection: "row", gap: 24 }]}>
          <View>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusBadge}>
              <Text>{statusLabel[quote.status] ?? quote.status}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.sectionTitle}>Criado em</Text>
            <Text>{fmtDate(quote.createdAt)}</Text>
          </View>
          {quote.validUntil && (
            <View>
              <Text style={styles.sectionTitle}>Válido até</Text>
              <Text>{fmtDate(quote.validUntil)}</Text>
            </View>
          )}
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome:</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>{quote.clientName}</Text>
          </View>
          {quote.clientContact && (
            <View style={styles.row}>
              <Text style={styles.label}>Contato:</Text>
              <Text style={styles.value}>{quote.clientContact}</Text>
            </View>
          )}
          {quote.clientAddress && (
            <View style={styles.row}>
              <Text style={styles.label}>Endereço:</Text>
              <Text style={styles.value}>{quote.clientAddress}</Text>
            </View>
          )}
        </View>

        {/* Serviço */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>O que precisa ser feito</Text>
          <Text style={{ color: "#555" }}>{quote.description}</Text>
        </View>

        {quote.materials && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Materiais a serem utilizados</Text>
            <Text style={{ color: "#555" }}>{quote.materials}</Text>
          </View>
        )}

        {quote.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <Text style={{ color: "#555" }}>{quote.notes}</Text>
          </View>
        )}

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>VALOR TOTAL</Text>
          <Text style={styles.totalValue}>{fmt(Number(quote.amount))}</Text>
        </View>

        {/* Assinaturas */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureLine}>Assinatura do Cliente</Text>
          <Text style={styles.signatureLine}>Assinatura do Responsável</Text>
        </View>
      </Page>
    </Document>
  )
}
