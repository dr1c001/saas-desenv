import { getTranslations } from "next-intl/server"
import { createQuote } from "@/actions/quotes"
import { QuoteForm } from "@/components/quotes/quote-form"

export default async function NewQuotePage() {
  const t = await getTranslations("quotes")

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t("new.title")}</h1>
      <QuoteForm action={createQuote} />
    </div>
  )
}
