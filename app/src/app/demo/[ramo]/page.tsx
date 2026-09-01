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
  return {
    title: `ServiçoOS para ${nome} — Demonstração`,
    description: t("meta", { ramo: nome }),
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
