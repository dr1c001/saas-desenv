"use client"

import { useActionState, useState } from "react"
import { createExpense, type FinanceFormState } from "@/actions/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"

export function ExpenseDialog() {
  const [open, setOpen] = useState(false)

  const [state, formAction, isPending] = useActionState<FinanceFormState, FormData>(
    async (prev, data) => {
      const result = await createExpense(prev, data)
      if (result.message) setOpen(false)
      return result
    },
    {}
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button />} className="inline-flex items-center justify-center rounded-lg border border-transparent bg-primary text-primary-foreground px-2.5 h-8 gap-1.5 text-sm font-medium whitespace-nowrap transition-all">
        <Plus className="size-4" />
        Nova despesa
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova despesa</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição *</Label>
            <Input id="description" name="description" placeholder="Ex: Aluguel do escritório" required />
            {state.errors?.description && (
              <p className="text-sm text-destructive">{state.errors.description[0]}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor *</Label>
              <Input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="0,00" required />
              {state.errors?.amount && (
                <p className="text-sm text-destructive">{state.errors.amount[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Vencimento *</Label>
              <Input id="dueDate" name="dueDate" type="date" required />
              {state.errors?.dueDate && (
                <p className="text-sm text-destructive">{state.errors.dueDate[0]}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">Categoria</Label>
              <Select name="category" defaultValue="OTHER">
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixa</SelectItem>
                  <SelectItem value="VARIABLE">Variável</SelectItem>
                  <SelectItem value="OTHER">Outra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recurring">Recorrente?</Label>
              <Select name="recurring" defaultValue="false">
                <SelectTrigger id="recurring">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Não</SelectItem>
                  <SelectItem value="true">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar despesa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
