import type { Metadata } from "next"
import { segmentoPorSlug, SEGMENTO_PADRAO } from "@/lib/demo"
import { Moldura } from "@/components/demo/moldura"

// A demonstração pública, no ramo padrão.
//
// Existe por um motivo comercial concreto: até 31/08/2026 não havia forma de
// ver o sistema por dentro sem criar conta E assinar. Para uma marca que o dono
// da empresa nunca ouviu falar, pedir R$ 97 antes de mostrar qualquer coisa é o
// pedido mais difícil que existe — e o funil mostrava isso (quatro cadastros em
// três meses).
//
// Os OUTROS ramos vivem em /demo/[ramo]. Esta rota é o endereço curto, que é o
// que se manda quando não se sabe o ramo de quem vai abrir.

// `openGraph` PRECISA ser declarado aqui, e não só `title`/`description`.
//
// O layout raiz define um `openGraph` próprio, e um filho que muda apenas o
// título não o sobrescreve: o link colado no WhatsApp continuava anunciando
// "CRM, OS, Financeiro e Dashboard para empresas de serviço" — jargão que não
// diz nada para quem controla serviço no caderno. (Conferido no HTML servido em
// produção, 01/09/2026.)
//
// `summary_large_image` para o cartão sair com a figura grande; com `summary`
// ela vira uma miniatura ao lado do texto.
const TITULO = "ServiçoOS — veja o sistema funcionando"
const DESCRICAO =
  "Orçamento, ordem de serviço, equipe em campo e financeiro num sistema só. Uma empresa de exemplo, sem cadastro e sem cartão."

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  openGraph: { title: TITULO, description: DESCRICAO, url: "/demo", type: "website" },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO },
}

export default function DemoPage() {
  return <Moldura segmento={segmentoPorSlug(SEGMENTO_PADRAO)} />
}
