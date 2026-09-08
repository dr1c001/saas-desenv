import { getTranslations } from "next-intl/server"
import { cartaoOg, TAMANHO_OG } from "@/components/demo/cartao-og"

// O cartão do endereço curto /demo. Sem ramo: é o link que se manda quando não
// se sabe o ramo de quem vai abrir.
export const alt = "ServiçoOS — demonstração"
export const size = TAMANHO_OG
export const contentType = "image/png"

export default async function Image() {
  const t = await getTranslations("demo")
  return cartaoOg({ ramo: null, chamada: t("ogChamada"), semRamo: t("ogSemRamo") })
}
