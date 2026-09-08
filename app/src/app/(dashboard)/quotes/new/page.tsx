import { getTranslations } from "next-intl/server"
import { createQuote } from "@/actions/quotes"
import { QuoteForm } from "@/components/quotes/quote-form"
import { clientesParaOrcamento } from "@/actions/quotes"

export default async function NewQuotePage() {
  const t = await getTranslations("quotes")
  const clientes = await clientesParaOrcamento()

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t("new.title")}</h1>
      <QuoteForm action={createQuote} clientes={clientes} />
    </div>
  )
}
