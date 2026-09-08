import { getTranslations } from "next-intl/server"
import { cartaoOg, TAMANHO_OG } from "@/components/demo/cartao-og"
import { ehSegmento, SEGMENTOS, SEGMENTO_PADRAO } from "@/lib/demo"

// Um cartão por RAMO. É o que faz o link colado no WhatsApp dizer
// "Refrigeração" em vez de "CRM, OS, Financeiro e Dashboard" — que é jargão
// para quem controla serviço no caderno.
export const alt = "ServiçoOS — demonstração"
export const size = TAMANHO_OG
export const contentType = "image/png"

export function generateStaticParams() {
  return SEGMENTOS.filter((s) => s.slug !== SEGMENTO_PADRAO).map((s) => ({ ramo: s.slug }))
}

export default async function Image({ params }: { params: Promise<{ ramo: string }> }) {
  const { ramo } = await params
  const t = await getTranslations("demo")
  return cartaoOg({
    // Slug desconhecido não deve derrubar a geração da imagem: a página já
    // devolve 404, e uma exceção aqui viraria erro de build.
    ramo: ehSegmento(ramo) ? t(`ramos.${ramo}` as "ramos.desentupidora") : null,
    chamada: t("ogChamada"),
    semRamo: t("ogSemRamo"),
  })
}
