"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button, buttonVariants } from "@/components/ui/button"
import { FileDown, Play, Pencil } from "lucide-react"
import { ConcluirDialog } from "./conclude-dialog"
import { updateOrderStatus } from "@/actions/service-orders"

type Item = { description: string; quantity: number; unitPrice: number }

type Props = {
  id: string
  title: string
  status: string
  conclusionNote?: string | null
  items?: Item[]
}

export function OsActionsRow({ id, title, status, conclusionNote, items }: Props) {
  const t = useTranslations("serviceOrdersComponents")
  const tCommon = useTranslations("common")
  const [isPending, startTransition] = useTransition()

  function handleStart() {
    startTransition(() => updateOrderStatus(id, "IN_PROGRESS"))
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === "OPEN" && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
          onClick={handleStart}
          disabled={isPending}
        >
          <Play className="size-3.5" />
          {t("osActionsRow.startButton")}
        </Button>
      )}
      <ConcluirDialog
        orderId={id}
        orderTitle={title}
        currentStatus={status}
        initialConclusionNote={conclusionNote}
        initialItems={items}
      />
      {/* Editar direto da lista: antes era preciso abrir a OS pra achar o
          botão. Some quando a OS está faturada porque updateServiceOrder
          recusa INVOICED (NFS-e emitida, assinatura coletada) — mostrar o
          botão ali seria convidar o usuário a preencher o formulário inteiro
          pra levar erro no fim. (Pedido do usuário em 10/08/2026.) */}
      {status !== "INVOICED" && (
        <Link
          href={`/service-orders/${id}/edit`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Pencil className="size-3.5 mr-1" />
          {tCommon("edit")}
        </Link>
      )}
      <Link
        href={`/api/pdf/service-order/${id}`}
        target="_blank"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <FileDown className="size-3.5" />
        PDF
      </Link>
    </div>
  )
}
