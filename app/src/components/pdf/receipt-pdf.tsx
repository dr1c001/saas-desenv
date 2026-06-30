import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { formatOsNumber } from "@/lib/utils"

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
  stampText: { color: "#16a34a", fontFamily: "Helvetica-Bold", fontSize: 14 },
})

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("pt-BR")
}

type Props = {
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

export function ReceiptPDF({ receipt, companyName, logoUrl }: Props) {
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
            <Text style={styles.title}>RECIBO</Text>
            <Text style={styles.number}>{receiptNumber}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.amountLabel}>Valor recebido:</Text>
          <Text style={styles.amount}>{fmt(Number(receipt.amount))}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados do Pagamento</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Descrição:</Text>
            <Text style={styles.value}>{receipt.description}</Text>
          </View>
          {receipt.order && (
            <View style={styles.row}>
              <Text style={styles.label}>OS vinculada:</Text>
              <Text style={styles.value}>
                {`${formatOsNumber(receipt.order.number, receipt.order.createdAt)} — ${receipt.order.title}`}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Vencimento:</Text>
            <Text style={styles.value}>{fmtDate(receipt.dueDate)}</Text>
          </View>
          {receipt.paidAt && (
            <View style={styles.row}>
              <Text style={styles.label}>Data de pagamento:</Text>
              <Text style={styles.value}>{fmtDate(receipt.paidAt)}</Text>
            </View>
          )}
        </View>

        <View style={styles.stamp}>
          <Text style={styles.stampText}>PAGO</Text>
        </View>

        <View style={styles.signatureSection}>
          <Text style={styles.signatureLine}>Assinatura do Pagador</Text>
          <Text style={styles.signatureLine}>Assinatura do Recebedor</Text>
        </View>
      </Page>
    </Document>
  )
}
