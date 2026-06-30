"use client"

import { useActionState } from "react"
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
  const [state, formAction, isPending] = useActionState<QuoteFormState, FormData>(action, {})

  const fmtAmount = quote ? Number(quote.amount).toFixed(2).replace(".", ",") : ""
  const fmtDate = quote?.validUntil
    ? new Date(quote.validUntil).toISOString().split("T")[0]
    : ""

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">Nome do cliente *</Label>
            <Input id="clientName" name="clientName" defaultValue={quote?.clientName ?? ""} placeholder="Nome completo ou razão social" />
            {state.errors?.clientName && <p className="text-sm text-destructive">{state.errors.clientName[0]}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="clientContact">Contato (telefone / e-mail)</Label>
              <Input id="clientContact" name="clientContact" defaultValue={quote?.clientContact ?? ""} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientAddress">Endereço</Label>
              <Input id="clientAddress" name="clientAddress" defaultValue={quote?.clientAddress ?? ""} placeholder="Rua, número — Cidade/UF" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Serviço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="description">O que precisa ser feito *</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={quote?.description ?? ""}
              placeholder="Descreva detalhadamente o serviço a ser executado..."
              rows={4}
            />
            {state.errors?.description && <p className="text-sm text-destructive">{state.errors.description[0]}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="materials">Materiais a serem utilizados</Label>
            <Textarea
              id="materials"
              name="materials"
              defaultValue={quote?.materials ?? ""}
              placeholder="Liste os materiais, quantidades e especificações..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valores e condições</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor a ser cobrado (R$)</Label>
              <Input id="amount" name="amount" defaultValue={fmtAmount} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="validUntil">Válido até</Label>
              <Input id="validUntil" name="validUntil" type="date" defaultValue={fmtDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={quote?.status ?? "DRAFT"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Rascunho</SelectItem>
                  <SelectItem value="SENT">Enviado</SelectItem>
                  <SelectItem value="APPROVED">Aprovado</SelectItem>
                  <SelectItem value="REJECTED">Recusado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={quote?.notes ?? ""}
              placeholder="Condições de pagamento, prazo de execução, garantia..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando..." : quote ? "Salvar alterações" : "Criar orçamento"}
        </Button>
        <Link href="/quotes" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  )
}
