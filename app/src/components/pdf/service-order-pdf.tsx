import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer"

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
  osTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  osNumber: { fontSize: 11, textAlign: "right", color: "#555" },
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
  table: { marginTop: 4 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f4f4f4",
    padding: "6 8",
    borderRadius: 2,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    padding: "5 8",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e5e5",
  },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colUnit: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
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
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  INVOICED: "Faturada",
  CANCELLED: "Cancelada",
}

type OrderItem = {
  id: string
  description: string
  quantity: unknown
  unitPrice: unknown
  total: unknown
}

type Props = {
  companyName: string
  order: {
    number: number
    title: string
    description: string | null
    status: string
    totalAmount: unknown
    createdAt: Date
    scheduledAt: Date | null
    concludedAt: Date | null
    client: {
      name: string
      document: string | null
      phone: string | null
      email: string | null
      address?: {
        street: string | null
        number: string | null
        city: string | null
        state: string | null
        zipCode: string | null
      } | null
    }
    technician: { name: string } | null
    items: OrderItem[]
  }
}

function fmt(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(date: Date | string) {
  return new Date(date).toLocaleDateString("pt-BR")
}

export function ServiceOrderPDF({ order, companyName }: Props) {
  const addr = order.client.address
  const addressLine = addr
    ? [addr.street, addr.number, addr.city, addr.state, addr.zipCode]
        .filter(Boolean)
        .join(", ")
    : null

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{companyName}</Text>
          </View>
          <View>
            <Text style={styles.osTitle}>Ordem de Serviço</Text>
            <Text style={styles.osNumber}>#{order.number}</Text>
          </View>
        </View>

        {/* Status + datas */}
        <View style={[styles.section, { flexDirection: "row", gap: 24 }]}>
          <View>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusBadge}>
              <Text>{statusLabel[order.status] ?? order.status}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.sectionTitle}>Criada em</Text>
            <Text>{fmtDate(order.createdAt)}</Text>
          </View>
          {order.scheduledAt && (
            <View>
              <Text style={styles.sectionTitle}>Agendada</Text>
              <Text>{fmtDate(order.scheduledAt)}</Text>
            </View>
          )}
          {order.concludedAt && (
            <View>
              <Text style={styles.sectionTitle}>Concluída</Text>
              <Text>{fmtDate(order.concludedAt)}</Text>
            </View>
          )}
        </View>

        {/* Serviço */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Serviço</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{order.title}</Text>
          {order.description && <Text style={{ color: "#555" }}>{order.description}</Text>}
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nome:</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>{order.client.name}</Text>
          </View>
          {order.client.document && (
            <View style={styles.row}>
              <Text style={styles.label}>Documento:</Text>
              <Text style={styles.value}>{order.client.document}</Text>
            </View>
          )}
          {order.client.phone && (
            <View style={styles.row}>
              <Text style={styles.label}>Telefone:</Text>
              <Text style={styles.value}>{order.client.phone}</Text>
            </View>
          )}
          {order.client.email && (
            <View style={styles.row}>
              <Text style={styles.label}>E-mail:</Text>
              <Text style={styles.value}>{order.client.email}</Text>
            </View>
          )}
          {addressLine && (
            <View style={styles.row}>
              <Text style={styles.label}>Endereço:</Text>
              <Text style={styles.value}>{addressLine}</Text>
            </View>
          )}
        </View>

        {/* Técnico */}
        {order.technician && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Responsável</Text>
            <Text>{order.technician.name}</Text>
          </View>
        )}

        {/* Itens */}
        {order.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Itens / Serviços</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.colDesc, { fontFamily: "Helvetica-Bold" }]}>Descrição</Text>
                <Text style={[styles.colQty, { fontFamily: "Helvetica-Bold" }]}>Qtd.</Text>
                <Text style={[styles.colUnit, { fontFamily: "Helvetica-Bold" }]}>Unit.</Text>
                <Text style={[styles.colTotal, { fontFamily: "Helvetica-Bold" }]}>Total</Text>
              </View>
              {order.items.map((item) => (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={styles.colDesc}>{item.description}</Text>
                  <Text style={styles.colQty}>{Number(item.quantity)}</Text>
                  <Text style={styles.colUnit}>{fmt(Number(item.unitPrice))}</Text>
                  <Text style={styles.colTotal}>{fmt(Number(item.total))}</Text>
                </View>
              ))}
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>{fmt(Number(order.totalAmount))}</Text>
            </View>
          </View>
        )}

        {/* Assinaturas */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureLine}>Assinatura do Cliente</Text>
          <Text style={styles.signatureLine}>Assinatura do Responsável</Text>
        </View>
      </Page>
    </Document>
  )
}
