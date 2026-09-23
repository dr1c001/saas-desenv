import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
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
  // Altura fixa: sem ela, um lado assinado e o outro em branco deixam as
  // linhas em alturas diferentes e o rodapé torto.
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

type Props = {
  locale: "pt" | "en"
  /** Termos escritos pela empresa. Ausente = a secao nem aparece. */
  termos?: string | null
  /** Cobranca por PIX. Ausente quando a empresa nao configurou chave. */
  pix?: { qr: Qr; chave: string; recebedor: string } | null
  /** Fotos do que sera feito, ja como data URI. E o documento que o cliente le
   *  para DECIDIR: a foto do cano estourado responde sozinha "por que custa
   *  isso". */
  fotos?: string[]
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
    /** Quem EMITIU o orçamento — `signatureUrl` é a assinatura que a pessoa
     *  desenhou uma vez em Configurações. Nulo nos orçamentos criados antes de
     *  o autor passar a ser registrado: saem com a linha para assinar à mão. */
    createdBy?: { name: string; signatureUrl: string | null } | null
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

export function QuotePDF({ quote, companyName, logoUrl, companyPhone, companyAddress, companyWebsite, locale, termos, pix, fotos = [] }: Props) {
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

        {/* As fotos vem ANTES do total, e nao depois.
            A pergunta se forma nesta ordem na cabeca de quem le: o que e, como
            esta, quanto custa. Foto depois do preco chega tarde — a pessoa ja
            decidiu se achou caro. */}
        {fotos.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{t("quote.photosTitle")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {fotos.map((src, i) => (
                /* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não aceita alt */
                <Image key={i} src={src} style={{ width: 150, height: 110, objectFit: "cover" }} />
              ))}
            </View>
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
        {/* Termos escritos pela propria empresa. Antes das assinaturas: quem
            assina precisa ter lido o que esta assinando. wrap={false} pra o
            texto nao ser cortado no meio entre duas paginas. */}
        {termos && (
          <View style={styles.termos} wrap={false}>
            <Text style={styles.sectionTitle}>{t("quote.termsTitle")}</Text>
            <Text style={styles.termosTexto}>{termos}</Text>
          </View>
        )}

        {pix && <PixBloco qr={pix.qr} chave={pix.chave} recebedor={pix.recebedor} locale={locale} />}

        {/* A assinatura de quem EMITIU o orçamento. A do cliente continua
            sendo linha para assinar à mão: o aceite dele vem pelo portal
            público, não pelo papel. */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureLine}>{t("common.clientSignature")}</Text>

          <View style={styles.signatureBloco}>
            <View style={styles.signatureEspaco}>
              {quote.createdBy?.signatureUrl && (
                /* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não aceita alt */
                <Image src={quote.createdBy.signatureUrl} style={styles.signatureImagem} />
              )}
            </View>
            <Text style={styles.signatureLine}>
              {quote.createdBy?.name
                ? `${t("common.responsibleSignature")} — ${quote.createdBy.name}`
                : t("common.responsibleSignature")}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
