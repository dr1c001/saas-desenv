import type { MetadataRoute } from "next"
import { ehProducao } from "@/lib/ambiente"

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"

// Só a landing, a demo e as páginas legais têm valor de SEO — tudo abaixo do
// login (dashboard, clientes, OS, financeiro, etc.) não tem conteúdo indexável
// e o proxy já redireciona quem não está autenticado, então liberar isso pro
// crawler só desperdiça crawl budget. As páginas de auth e os portais públicos
// por token (/p, /q) também ficam de fora — sem valor de busca e, no caso dos
// portais, é conteúdo privado do cliente que não deveria aparecer indexado
// mesmo sendo tecnicamente acessível sem login.
//
// A LISTA ENVELHECEU UMA VEZ, e por isso agora tem teste. Nove abas criadas de
// agosto em diante (/ajuda, /balanco, /bens, /contracts, /cotacoes,
// /fornecedores, /notas, /parts, /purchases) e a tela /criar-senha ficaram de
// fora sem ninguém perceber: o crawler gastava orçamento em dez rotas que só
// devolvem redirecionamento, num site com três páginas de valor de busca.
//
// Ela segue LITERAL de propósito — o runtime serverless não lê src/ —, e quem
// garante que não envelhece de novo é src/app/__tests__/link-colado.test.ts,
// que confere esta lista contra as rotas que existem no disco.
// (Achado na auditoria de 13/09/2026, grupo 9.)
export default function robots(): MetadataRoute.Robots {
  // Ambiente de teste fora do Google: além de ser conteúdo sem valor, uma
  // cópia do site indexada compete com o site real pelo mesmo termo de busca
  // e confunde quem procura o produto.
  if (!ehProducao()) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }

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
        "/ajuda",
        "/balanco",
        "/bens",
        "/contracts",
        "/cotacoes",
        "/fornecedores",
        "/notas",
        "/parts",
        "/purchases",
        "/admin",
        "/expired",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/criar-senha",
        "/offline",
        "/p/",
        "/q/",
        "/api/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
