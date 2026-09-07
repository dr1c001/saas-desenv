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

export type ClienteDaLista = { id: string; name: string; email: string | null }

type Quote = {
  id: string
  number: number
  clientId: string | null
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
  /** Os clientes cadastrados desta empresa. */
  clientes: ClienteDaLista[]
}

export function QuoteForm({ action, quote, clientes }: Props) {
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
          {/* O cliente CADASTRADO, e não mais três campos de texto livre.
              Nome, contato e endereço passam a ser copiados do cadastro no
              servidor — digitá-los aqui deixaria o orçamento discordar da ficha
              do cliente no dia seguinte. */}
          <div className="space-y-1.5">
            <Label htmlFor="clientId">{t("form.clientLabel")}</Label>
            <select
              id="clientId"
              name="clientId"
              defaultValue={quote?.clientId ?? ""}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="">{t("form.clientPlaceholder")}</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? "" : ` — ${t("form.semEmail")}`}
                </option>
              ))}
            </select>
            {state.errors?.clientId && <p className="text-sm text-destructive">{fieldError(state.errors.clientId)}</p>}

            {/* O caminho de escape, no lugar onde ele é necessário.
                Sem isto, "o cliente ligou pedindo preço" vira: sair da tela,
                cadastrar, voltar, redigitar tudo — e o dono volta a fazer
                orçamento por WhatsApp. */}
            <p className="text-xs text-muted-foreground">
              {t("form.clienteNaoCadastrado")}{" "}
              <Link href="/clients/new" className="underline">
                {t("form.cadastrarCliente")}
              </Link>
            </p>
          </div>

          {/* O orçamento ANTIGO, feito antes de o cliente ser obrigatório,
              mostra para quem ele foi — senão a pessoa abre a edição e não
              reconhece o documento que está mexendo. */}
          {quote && !quote.clientId && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
              {t("form.orcamentoAntigo", { nome: quote.clientName })}
            </p>
          )}
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
