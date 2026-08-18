import { Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer"
import { getTranslator } from "@/lib/i18n"
import type { Qr } from "@/lib/qr"

const styles = StyleSheet.create({
  bloco: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 6 },
  qr: { width: 90, height: 90 },
  texto: { fontSize: 8, color: "#555", lineHeight: 1.5 },
  chave: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#1a1a1a" },
})

type Props = {
  qr: Qr
  /** Chave como a empresa cadastrou — é o que o cliente digita no banco. */
  chave: string
  recebedor: string
  locale: "pt" | "en"
}

/**
 * Bloco de pagamento por PIX nos documentos impressos.
 *
 * Sai o QR e a CHAVE, não o "copia e cola" de 150 caracteres: ninguém digita
 * 150 caracteres de um papel, mas todo mundo digita um CNPJ ou um telefone.
 * O copia e cola completo fica no portal do cliente, que é onde o botão de
 * copiar funciona de verdade.
 *
 * O QR é desenhado em vetor (o mesmo caminho que o portal usa) porque o
 * documento vai ser impresso, e QR em bitmap esticado sai borrado — leitor de
 * celular não lê borrado, e aí o cliente liga pra empresa perguntando como
 * paga, que é justamente o que este bloco existe pra evitar.
 */
export function PixBloco({ qr, chave, recebedor, locale }: Props) {
  const t = getTranslator(locale, "pdf")

  return (
    <View style={styles.bloco} wrap={false}>
      <Svg viewBox={`0 0 ${qr.tamanho} ${qr.tamanho}`} style={styles.qr}>
        <Rect x={0} y={0} width={qr.tamanho} height={qr.tamanho} fill="#ffffff" />
        <Path d={qr.caminho} fill="#000000" />
      </Svg>
      <View>
        <Text style={styles.titulo}>{t("pix.title")}</Text>
        <Text style={styles.texto}>{t("pix.scan")}</Text>
        <Text style={styles.texto}>{t("pix.orCopy")}</Text>
        <Text style={styles.chave}>{chave}</Text>
        <Text style={styles.texto}>
          {t("pix.receiver")}: {recebedor}
        </Text>
      </View>
    </View>
  )
}
