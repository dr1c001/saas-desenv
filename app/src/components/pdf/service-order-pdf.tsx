import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import { formatOsNumber } from "@/lib/utils"
import { getTranslator } from "@/lib/i18n"
import { PixBloco } from "@/components/pdf/pix-bloco"
import type { Qr } from "@/lib/qr"

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
  fotosGrade: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  foto: { width: 120, height: 90, objectFit: "cover", borderRadius: 3 },
  termos: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  termosTexto: { fontSize: 7.5, color: "#555", lineHeight: 1.4 },
  signatureSection: {
    marginTop: 48,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureBloco: { width: 200, alignItems: "center" },
  // Altura fixa para os dois lados: sem ela, um lado assinado e o outro em
  // branco deixam as linhas em alturas diferentes e o rodapé torto.
  signatureEspaco: { height: 46, justifyContent: "flex-end", alignItems: "center" },
  signatureImagem: { maxHeight: 44, objectFit: "contain" },
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

type OrderItem = {
  id: string
  description: string
  quantity: unknown
  unitPrice: unknown
  total: unknown
}

type Props = {
  locale: "pt" | "en"
  /** Termos escritos pela empresa. Ausente = a secao nem aparece. */
  termos?: string | null
  /** Ja formatado pela rota: "90 dias — valida ate 13/06/2026". */
  garantia?: string | null
  /** Cobranca por PIX. Ausente quando a empresa nao configurou chave. */
  pix?: { qr: Qr; chave: string; recebedor: string } | null
  /** Fotos ja em data URI. Vazio quando a OS nao tem foto ou o download
   *  falhou — nesse caso a secao inteira some, sem espaco vazio no papel. */
  fotos?: string[]
  companyName: string
  logoUrl?: string | null
  companyPhone?: string | null
  companyAddress?: string | null
  companyWebsite?: string | null
  order: {
    number: number
    title: string
    description: string | null
    conclusionNote: string | null
    status: string
    totalAmount: unknown
    createdAt: Date
    scheduledAt: Date | null
    concludedAt: Date | null
    /** O CONTRATANTE, quando o servico foi feito para o cliente final dele.
     *  Presente so nesse caso — documento de cliente direto nao muda em nada. */
    contratante?: { name: string; document: string | null } | null
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
    /** Colhida do cliente final na tela do celular ou pelo portal. Existia no
     *  banco desde sempre e NUNCA era impressa: o PDF saía com uma linha em
     *  branco por cima dela. (Achado em 21/08/2026.) */
    clientSignatureUrl: string | null
    /** `signatureUrl`: a assinatura que a pessoa desenhou uma vez em
     *  Configurações. Sai a de QUEM EXECUTOU o serviço. */
    technician: { name: string; signatureUrl: string | null } | null
    items: OrderItem[]
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

export function ServiceOrderPDF({ order, companyName, logoUrl, companyPhone, companyAddress, companyWebsite, locale, fotos = [] , termos, garantia, pix }: Props) {
  // PDFs são gerados via renderToBuffer, fora do request context do Next.js —
  // o locale vem explícito por prop (ver lib/i18n.ts).
  const t = getTranslator(locale, "pdf")
  const tc = getTranslator(locale, "common")
  const fmt = (value: number) => fmtCurrency(value, locale)
  const fmtDate = (date: Date | string) => fmtDateFor(date, locale)

  const addr = order.client.address
  const addressLine = addr
    ? [addr.street, addr.number, addr.city, addr.state, addr.zipCode]
        .filter(Boolean)
        .join(", ")
    : null
  const osNumber = formatOsNumber(order.number, order.createdAt)
  // status vem do banco como string — .has() preserva o fallback pro valor cru
  // que o mapa local tinha antes (`statusLabel[status] ?? status`).
  const statusKey = `serviceOrderStatus.${order.status}` as "serviceOrderStatus.OPEN"
  const statusText = tc.has(statusKey) ? tc(statusKey) : order.status

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
            <Text style={styles.osTitle}>{t("serviceOrder.docTitle")}</Text>
            <Text style={styles.osNumber}>{osNumber}</Text>
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
            <Text style={styles.sectionTitle}>{t("serviceOrder.createdAt")}</Text>
            <Text>{fmtDate(order.createdAt)}</Text>
          </View>
          {order.scheduledAt && (
            <View>
              <Text style={styles.sectionTitle}>{t("serviceOrder.scheduledAt")}</Text>
              <Text>{fmtDate(order.scheduledAt)}</Text>
            </View>
          )}
          {order.concludedAt && (
            <View>
              <Text style={styles.sectionTitle}>{t("serviceOrder.concludedAt")}</Text>
              <Text>{fmtDate(order.concludedAt)}</Text>
            </View>
          )}
        </View>

        {/* Serviço */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("serviceOrder.serviceTitle")}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{order.title}</Text>
          {order.description && <Text style={{ color: "#555", marginBottom: 4 }}>{order.description}</Text>}
          {order.conclusionNote && (
            <View style={{ marginTop: 6 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 2 }]}>{t("serviceOrder.servicesPerformedTitle")}</Text>
              <Text style={{ color: "#555" }}>{order.conclusionNote}</Text>
            </View>
          )}
        </View>

        {/* Cliente.
            Quando ha CONTRATANTE, o documento passa a mostrar os dois lados:
            quem contratou e onde o servico foi feito. Sem isso, o condominio
            recebe um papel que nao explica por que a administradora aparece na
            nota, e a administradora recebe um papel que nao diz onde o servico
            aconteceu. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("common.clientTitle")}</Text>
          {order.contratante && (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>{t("serviceOrder.contratanteLabel")}</Text>
                <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>
                  {order.contratante.name}
                  {order.contratante.document ? ` — ${order.contratante.document}` : ""}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("serviceOrder.localLabel")}</Text>
                <Text style={styles.value}>{order.client.name}</Text>
              </View>
            </>
          )}
          {!order.contratante && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("common.nameLabel")}</Text>
              <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>{order.client.name}</Text>
            </View>
          )}
          {order.client.document && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("serviceOrder.documentLabel")}</Text>
              <Text style={styles.value}>{order.client.document}</Text>
            </View>
          )}
          {order.client.phone && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("serviceOrder.phoneLabel")}</Text>
              <Text style={styles.value}>{order.client.phone}</Text>
            </View>
          )}
          {order.client.email && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("serviceOrder.emailLabel")}</Text>
              <Text style={styles.value}>{order.client.email}</Text>
            </View>
          )}
          {addressLine && (
            <View style={styles.row}>
              <Text style={styles.label}>{t("common.addressLabel")}</Text>
              <Text style={styles.value}>{addressLine}</Text>
            </View>
          )}
        </View>

        {/* Técnico */}
        {order.technician && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("serviceOrder.responsibleTitle")}</Text>
            <Text>{order.technician.name}</Text>
          </View>
        )}

        {/* Itens */}
        {order.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("serviceOrder.itemsTitle")}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.colDesc, { fontFamily: "Helvetica-Bold" }]}>{t("serviceOrder.columns.description")}</Text>
                <Text style={[styles.colQty, { fontFamily: "Helvetica-Bold" }]}>{t("serviceOrder.columns.quantity")}</Text>
                <Text style={[styles.colUnit, { fontFamily: "Helvetica-Bold" }]}>{t("serviceOrder.columns.unitPrice")}</Text>
                <Text style={[styles.colTotal, { fontFamily: "Helvetica-Bold" }]}>{t("serviceOrder.columns.total")}</Text>
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
              <Text style={styles.totalLabel}>{t("serviceOrder.totalLabel")}</Text>
              <Text style={styles.totalValue}>{fmt(Number(order.totalAmount))}</Text>
            </View>
          </View>
        )}

        {/* Fotos do servico — a prova de que o trabalho foi feito, que e o
            que o cliente final guarda e mostra pra quem pagou. Vem antes das
            assinaturas: assina-se depois de ver o registro. */}
        {fotos.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{t("serviceOrder.photosTitle")}</Text>
            <View style={styles.fotosGrade}>
              {fotos.map((src, i) => (
                <Image key={i} src={src} style={styles.foto} />
              ))}
            </View>
          </View>
        )}

        {/* Assinaturas */}
        {/* Termos escritos pela propria empresa. Antes das assinaturas: quem
            assina precisa ter lido o que esta assinando. wrap={false} pra o
            texto nao ser cortado no meio entre duas paginas. */}
        {garantia && (
          <View style={styles.termos} wrap={false}>
            <Text style={styles.sectionTitle}>{t("serviceOrder.warrantyTitle")}</Text>
            <Text style={styles.termosTexto}>{garantia}</Text>
          </View>
        )}

        {termos && (
          <View style={styles.termos} wrap={false}>
            <Text style={styles.sectionTitle}>{t("serviceOrder.termsTitle")}</Text>
            <Text style={styles.termosTexto}>{termos}</Text>
          </View>
        )}

        {pix && <PixBloco qr={pix.qr} chave={pix.chave} recebedor={pix.recebedor} locale={locale} />}

        {/* As duas assinaturas do documento.
            Um documento de serviço tem dois lados: quem recebeu assina que
            recebeu, quem fez assina que fez. Até 21/08/2026 os dois lados eram
            só uma linha em branco — inclusive quando a assinatura do cliente
            JÁ estava gravada no banco.
            Quem não tem assinatura gravada continua com a linha para assinar à
            mão: o documento nunca deixa de sair por causa disto. */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBloco}>
            <View style={styles.signatureEspaco}>
              {order.clientSignatureUrl && (
                /* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não aceita alt */
                <Image src={order.clientSignatureUrl} style={styles.signatureImagem} />
              )}
            </View>
            <Text style={styles.signatureLine}>{t("common.clientSignature")}</Text>
          </View>

          <View style={styles.signatureBloco}>
            <View style={styles.signatureEspaco}>
              {order.technician?.signatureUrl && (
                /* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não aceita alt */
                <Image src={order.technician.signatureUrl} style={styles.signatureImagem} />
              )}
            </View>
            <Text style={styles.signatureLine}>
              {order.technician?.name
                ? `${t("common.responsibleSignature")} — ${order.technician.name}`
                : t("common.responsibleSignature")}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
