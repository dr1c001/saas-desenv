"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { exportarBalancoCsv } from "@/actions/balanco"

// O balanço para o contador.
//
// Vai com as RESSALVAS do conferente no fim do arquivo, de propósito: mandar o
// número escondendo o que se sabe sobre ele é pior do que não mandar.

export function ExportarBalanco() {
  const t = useTranslations("balanco")
  const [pendente, iniciar] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const csv = await exportarBalancoCsv()
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `balanco-${new Date().toISOString().slice(0, 10)}.csv`
          a.click()
          // Sem o revoke o blob fica na memória da aba até ela fechar.
          URL.revokeObjectURL(url)
        })
      }
    >
      {pendente ? (
        <Loader2 className="size-4 mr-1.5 animate-spin" />
      ) : (
        <Download className="size-4 mr-1.5" />
      )}
      {t("exportar")}
    </Button>
  )
}
