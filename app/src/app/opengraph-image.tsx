import { getTranslations } from "next-intl/server"
import { cartaoOg, TAMANHO_OG } from "@/components/demo/cartao-og"

// O cartão de compartilhamento da LANDING, que não existia.
//
// O `openGraph` do layout raiz declarava title, description, url, siteName,
// locale e type — e nenhum `images`. Só a demo tinha cartão próprio. Resultado:
// servicoos.com.br colado numa conversa de WhatsApp saía como um retângulo de
// texto sem figura, com a descrição genérica "CRM, OS, Financeiro e Dashboard
// para empresas de serviço" — jargão de módulo interno, que o comentário da
// própria página da demo já registra que "não diz nada para quem controla
// serviço no caderno".
//
// Reaproveita o cartão da demo, que foi desenhado para ser legível em
// miniatura, com o posicionamento da LANDING (landing.og.*) em vez do texto da
// demo: a landing não é a demo.
//
// ATENÇÃO — esta rota é `/opengraph-image`, SEM EXTENSÃO. O matcher do proxy
// isenta caminho com ponto, então ela passa pelo middleware; sem uma entrada em
// `isPublicRoute` (src/proxy.ts), o scraper do WhatsApp recebe 307 para /login
// e o cartão continua não aparecendo. Os cartões da demo só funcionam hoje
// porque `startsWith("/demo")` já os cobre.
// (Achado na auditoria de 13/09/2026, grupo 9.)
export const alt = "ServiçoOS"
export const size = TAMANHO_OG
export const contentType = "image/png"

export default async function Image() {
  const t = await getTranslations("landing")
  const td = await getTranslations("demo")
  return cartaoOg({
    // Sem ramo: a landing fala com todo mundo, e a manchete é o posicionamento.
    ramo: null,
    semRamo: t("og.manchete"),
    chamada: t("og.chamada"),
    // `prefixo` não é renderizado quando não há ramo; vai junto porque o cartão
    // o exige, e mentir com string vazia esconderia um erro futuro.
    prefixo: td("ogPrefixo"),
    modulos: td.raw("ogModulos") as string[],
  })
}
