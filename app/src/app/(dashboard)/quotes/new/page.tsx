import { createQuote } from "@/actions/quotes"
import { QuoteForm } from "@/components/quotes/quote-form"

export default function NewQuotePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Novo Orçamento</h1>
      <QuoteForm action={createQuote} />
    </div>
  )
}
