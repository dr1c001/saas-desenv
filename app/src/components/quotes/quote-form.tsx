"use client"

import { useActionState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import type { QuoteFormState } from "@/actions/quotes"

type Quote = {
  id: string
  number: number
  clientName: string
  clientAddress: string | null
  clientContact: string | null
  description: string
  materials: string | null
  amount: string | number
  notes: string | null
  status: string
  validUntil: Date | string | null
} | null

type Props = {
  action: (prev: QuoteFormState, form: FormData) => Promise<QuoteFormState>
  quote?: Quote
}

export function QuoteForm({ action, quote }: Props) {
  const t = useTranslations("quotes")
  const tc = useTranslations("common")
  const [state, formAction, isPending] = useActionState<QuoteFormState, FormData>(action, {})

  // A action devolve códigos (ver actions/quotes.ts) e o texto é montado aqui.
  // Fallback pro texto cru porque nem todo erro do zod é código nosso: campo
  // ausente no FormData cai na mensagem padrão dele ("Invalid input: ...").
  function fieldError(codes?: string[]) {
    const code = codes?.[0]
    if (!code) return null
    const key = `validation.${code}` as "validation.clientNameRequired"
    return t.has(key) ? t(key) : code
  }

  const fmtAmount = quote ? Number(quote.amount).toFixed(2).replace(".", ",") : ""
  const fmtDate = quote?.validUntil
    ? new Date(quote.validUntil).toISOString().split("T")[0]
    : ""

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.clientDataTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">{t("form.clientNameLabel")}</Label>
            <Input id="clientName" name="clientName" defaultValue={quote?.clientName ?? ""} placeholder={t("form.clientNamePlaceholder")} />
            {state.errors?.clientName && <p className="text-sm text-destructive">{fieldError(state.errors.clientName)}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="clientContact">{t("form.clientContactLabel")}</Label>
              <Input id="clientContact" name="clientContact" defaultValue={quote?.clientContact ?? ""} placeholder={t("form.clientContactPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientAddress">{t("form.clientAddressLabel")}</Label>
              <Input id="clientAddress" name="clientAddress" defaultValue={quote?.clientAddress ?? ""} placeholder={t("form.clientAddressPlaceholder")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.serviceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("form.descriptionLabel")}</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={quote?.description ?? ""}
              placeholder={t("form.descriptionPlaceholder")}
              rows={4}
            />
            {state.errors?.description && <p className="text-sm text-destructive">{fieldError(state.errors.description)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="materials">{t("form.materialsLabel")}</Label>
            <Textarea
              id="materials"
              name="materials"
              defaultValue={quote?.materials ?? ""}
              placeholder={t("form.materialsPlaceholder")}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("form.valuesTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">{t("form.amountLabel")}</Label>
              <Input id="amount" name="amount" defaultValue={fmtAmount} placeholder={t("form.amountPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validUntil">{t("form.validUntilLabel")}</Label>
              <Input id="validUntil" name="validUntil" type="date" defaultValue={fmtDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">{t("form.statusLabel")}</Label>
              <Select name="status" defaultValue={quote?.status ?? "DRAFT"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">{tc("quoteStatus.DRAFT")}</SelectItem>
                  <SelectItem value="SENT">{tc("quoteStatus.SENT")}</SelectItem>
                  <SelectItem value="APPROVED">{tc("quoteStatus.APPROVED")}</SelectItem>
                  <SelectItem value="REJECTED">{tc("quoteStatus.REJECTED")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("form.notesLabel")}</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={quote?.notes ?? ""}
              placeholder={t("form.notesPlaceholder")}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {state.messageCode === "NO_PERMISSION" && (
        <p className="text-sm text-destructive">{tc("noPermission")}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? tc("saving") : quote ? t("form.submitUpdate") : t("form.submitCreate")}
        </Button>
        <Link href="/quotes" className={buttonVariants({ variant: "outline" })}>
          {tc("cancel")}
        </Link>
      </div>
    </form>
  )
}
