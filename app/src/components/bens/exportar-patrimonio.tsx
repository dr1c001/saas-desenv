"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { exportarPatrimonioCsv } from "@/actions/patrimonio"

// A lista para o contador.
//
// É o que ele pede todo fim de exercício, e o que hoje sai de uma planilha
// feita à mão — quando sai. Aqui ele recebe valor de aquisição, taxa usada,
// depreciação acumulada e valor contábil, que são as quatro colunas de que
// precisa para lançar o imobilizado.

export function ExportarPatrimonio() {
  const t = useTranslations("bens")
  const [pendente, iniciar] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const csv = await exportarPatrimonioCsv()

          // Baixa pelo navegador, sem passar por rota: o arquivo é pequeno e
          // já vem pronto da Action — uma rota só para servi-lo seria mais uma
          // superfície pública para defender.
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `patrimonio-${new Date().toISOString().slice(0, 10)}.csv`
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
