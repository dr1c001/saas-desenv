"use client"

import { useActionState, useState } from "react"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("finance")
  const tCommon = useTranslations("common")
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
        {t("expenseDialog.newButton")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("expenseDialog.title")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("expenseDialog.descriptionLabel")}</Label>
            <Input id="description" name="description" placeholder={t("expenseDialog.descriptionPlaceholder")} required />
            {state.errors?.description && (
              <p className="text-sm text-destructive">{state.errors.description[0]}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">{t("expenseDialog.amountLabel")}</Label>
              <Input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder={t("expenseDialog.amountPlaceholder")} required />
              {state.errors?.amount && (
                <p className="text-sm text-destructive">{state.errors.amount[0]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">{t("expenseDialog.dueDateLabel")}</Label>
              <Input id="dueDate" name="dueDate" type="date" required />
              {state.errors?.dueDate && (
                <p className="text-sm text-destructive">{state.errors.dueDate[0]}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">{t("expenseDialog.categoryLabel")}</Label>
              <Select name="category" defaultValue="OTHER">
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">{t("expenseCategory.FIXED")}</SelectItem>
                  <SelectItem value="VARIABLE">{t("expenseCategory.VARIABLE")}</SelectItem>
                  <SelectItem value="OTHER">{t("expenseCategory.OTHER")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recurring">{t("expenseDialog.recurringLabel")}</Label>
              <Select name="recurring" defaultValue="false">
                <SelectTrigger id="recurring">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">{tCommon("no")}</SelectItem>
                  <SelectItem value="true">{tCommon("yes")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon("saving") : t("expenseDialog.submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
