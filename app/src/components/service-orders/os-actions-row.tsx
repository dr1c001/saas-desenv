"use client"

import Link from "next/link"
import { useTransition } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { FileDown, Play } from "lucide-react"
import { ConcluirDialog } from "./conclude-dialog"
import { updateOrderStatus } from "@/actions/service-orders"

type Props = {
  id: string
  title: string
  status: string
}

export function OsActionsRow({ id, title, status }: Props) {
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
          Iniciar
        </Button>
      )}
      <ConcluirDialog orderId={id} orderTitle={title} currentStatus={status} />
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
