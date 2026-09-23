import type { MetadataRoute } from "next"
import { SEGMENTOS, SEGMENTO_PADRAO } from "@/lib/demo"

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

// A DEMO ficava de fora, e ela é a página de conversão.
//
// O sitemap listava três URLs: a raiz, /terms e /privacy. Ficavam fora /demo —
// o link que o herói aponta e o único endereço com cartão de compartilhamento
// próprio — e as páginas por RAMO, feitas justamente para ranquear em "sistema
// para desentupidora", "sistema para refrigeração". O Google só as descobria
// por rastreio a partir da landing: trabalho de SEO por segmento feito e não
// declarado.
//
// /status NÃO entra, de propósito: ela é `robots: { index: false }`, e sitemap
// com noindex é contradição. Há teste que trava isso.
// (Achado na auditoria de 13/09/2026, grupo 9.)
export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date()
  // A mesma expressão de demo/[ramo]/page.tsx: o ramo padrão já é /demo, e
  // publicar os dois seria conteúdo duplicado.
  const porRamo = SEGMENTOS.filter((s) => s.slug !== SEGMENTO_PADRAO).map((s) => ({
    url: `${baseUrl}/demo/${s.slug}`,
    lastModified: agora,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }))

  return [
    { url: baseUrl, lastModified: agora, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/demo`, lastModified: agora, changeFrequency: "monthly", priority: 0.8 },
    ...porRamo,
    { url: `${baseUrl}/terms`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
  ]
}
