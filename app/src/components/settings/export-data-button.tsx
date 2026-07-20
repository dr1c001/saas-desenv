"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { exportTenantData } from "@/actions/data-export"

export function ExportDataButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const data = await exportTenantData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const date = new Date().toISOString().split("T")[0]
      a.href = url
      a.download = `servicos-dados-${date}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao exportar dados.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={loading}
        className={buttonVariants({ variant: "outline" })}
      >
        {loading ? (
          <Loader2 className="size-4 mr-2 animate-spin" />
        ) : (
          <Download className="size-4 mr-2" />
        )}
        {loading ? "Gerando arquivo..." : "Baixar todos os meus dados (.json)"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
