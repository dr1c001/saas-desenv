"use client"

import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { FileDown } from "lucide-react"

export function ReceiptPdfButton({ revenueId }: { revenueId: string }) {
  return (
    <Link
      href={`/api/pdf/receipt/${revenueId}`}
      target="_blank"
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <FileDown className="size-4 mr-1" />
      Recibo
    </Link>
  )
}
