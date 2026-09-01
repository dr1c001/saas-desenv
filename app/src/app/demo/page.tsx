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

export const metadata: Metadata = {
  title: "ServiçoOS — Demonstração",
  description:
    "Veja o ServiçoOS funcionando, com dados de exemplo. Sem cadastro e sem cartão.",
}

export default function DemoPage() {
  return <Moldura segmento={segmentoPorSlug(SEGMENTO_PADRAO)} />
}
