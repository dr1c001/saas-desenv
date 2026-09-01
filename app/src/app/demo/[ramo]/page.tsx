import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ehSegmento, segmentoPorSlug, SEGMENTOS, SEGMENTO_PADRAO } from "@/lib/demo"
import { Moldura } from "@/components/demo/moldura"

// Um endereço por RAMO. É o que se manda no WhatsApp para uma empresa
// específica: /demo/refrigeracao para quem instala ar-condicionado,
// /demo/eletrica para quem faz quadro elétrico.
//
// Uma demo genérica faz o dono perguntar "isso serve para mim?". Uma demo com
// os serviços, o checklist e os valores do ramo dele não faz pergunta nenhuma.

export function generateStaticParams() {
  // O ramo padrão não entra: ele já é /demo, e ter os dois endereços servindo
  // a mesma página dividiria o link em duas versões sem motivo.
  return SEGMENTOS.filter((s) => s.slug !== SEGMENTO_PADRAO).map((s) => ({ ramo: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ramo: string }>
}): Promise<Metadata> {
  const { ramo } = await params
  if (!ehSegmento(ramo)) return {}
  const t = await getTranslations("demo")
  const nome = t(`ramos.${ramo}` as "ramos.desentupidora")
  const titulo = `ServiçoOS para ${nome}`
  const descricao = t("meta", { ramo: nome })
  // `openGraph` explícito: o layout raiz tem o dele, e mudar só o `title` não
  // o sobrescreve — o cartão do WhatsApp continuaria com o texto genérico do
  // site em vez do nome do ramo, que é a razão de a página por ramo existir.
  return {
    title: titulo,
    description: descricao,
    openGraph: { title: titulo, description: descricao, url: `/demo/${ramo}`, type: "website" },
    twitter: { card: "summary_large_image", title: titulo, description: descricao },
  }
}

export default async function DemoDoRamo({ params }: { params: Promise<{ ramo: string }> }) {
  const { ramo } = await params
  // Slug desconhecido é 404, e não o ramo padrão em silêncio: um link errado
  // que "funciona" esconde o erro de digitação até alguém reparar que metade
  // dos contatos recebeu a demo do ramo errado.
  if (!ehSegmento(ramo) || ramo === SEGMENTO_PADRAO) notFound()
  return <Moldura segmento={segmentoPorSlug(ramo)} />
}
