import type { MetadataRoute } from "next"

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app-olive-six-67.vercel.app"

// Só a landing e as páginas legais têm valor de SEO — tudo abaixo do login
// (dashboard, clientes, OS, financeiro, etc.) não tem conteúdo indexável e
// o proxy já redireciona quem não está autenticado, então liberar isso pro
// crawler só desperdiça crawl budget. As páginas de auth e os portais
// públicos por token (/p, /q) também ficam de fora — sem valor de busca e,
// no caso dos portais, é conteúdo privado do cliente que não deveria
// aparecer indexado mesmo sendo tecnicamente acessível sem login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/clients",
        "/service-orders",
        "/history",
        "/maintenance",
        "/providers",
        "/receipts",
        "/schedule",
        "/finance",
        "/reports",
        "/team",
        "/map",
        "/billing",
        "/referral",
        "/quotes",
        "/settings",
        "/admin",
        "/expired",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/p/",
        "/q/",
        "/api/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
