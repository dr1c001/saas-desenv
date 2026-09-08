"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Download, FileUp, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { importClients, type ResultadoImportacao } from "@/actions/clients"

// Colunas que o modelo baixado traz, na ordem. Os títulos vêm da tradução
// porque são os mesmos nomes que o mapeador reconhece — se divergirem, o
// arquivo que nós mesmos entregamos deixa de ser importável.
const COLUNAS_MODELO = [
  "name", "document", "email", "phone", "whatsapp",
  "zipCode", "street", "number", "complement", "district", "city", "state",
] as const

export function ImportForm() {
  const t = useTranslations("clients.import")
  const [estado, formAction, enviando] = useActionState<ResultadoImportacao, FormData>(
    importClients,
    { ok: false }
  )
  const [arquivo, setArquivo] = useState<string | null>(null)

  function baixarModelo() {
    const cabecalho = COLUNAS_MODELO.map((c) => t(`templateColumns.${c}`))
    const exemplo = COLUNAS_MODELO.map((c) => t(`templateExample.${c}`))
    // ﻿ (BOM) é o que faz o Excel abrir como UTF-8. Sem ele, o modelo que
    // entregamos já chega com os acentos quebrados — e o cliente conclui que o
    // sistema não sabe lidar com português.
    const csv = "﻿" + [cabecalho, exemplo].map((l) => l.join(";")).join("\r\n") + "\r\n"
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "modelo-clientes.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const concluido = estado.ok

  return (
    <div className="space-y-6">
      {!concluido && (
        <>
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <h2 className="font-semibold">{t("howTo.title")}</h2>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>{t("howTo.step1")}</li>
                <li>{t("howTo.step2")}</li>
                <li>{t("howTo.step3")}</li>
              </ol>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={baixarModelo}>
              <Download className="size-3.5 mr-1.5" />
              {t("downloadTemplate")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("recognizedColumns")}</p>
          </div>

          <form action={formAction} className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="arquivo">
                {t("fileLabel")}
              </label>
              <input
                id="arquivo"
                type="file"
                name="arquivo"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? null)}
                className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="mt-2 text-xs text-muted-foreground">{t("fileHint")}</p>
            </div>

            <Button type="submit" disabled={enviando || !arquivo}>
              {enviando ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <FileUp className="size-4 mr-2" />
              )}
              {enviando ? t("submitting") : t("submit")}
            </Button>

            {/* Falha que impede o arquivo inteiro: motivo é chave de tradução
                vinda do servidor, então a mensagem explica o que fazer em vez
                de dizer só "erro ao importar". */}
            {estado.motivo && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                <span>{t(`reasons.${estado.motivo}` as "reasons.arquivoVazio")}</span>
              </div>
            )}
          </form>
        </>
      )}

      {concluido && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-green-600/40 bg-green-600/5 p-6">
            <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                {t("result.imported", { count: estado.importados ?? 0 })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("result.summary", {
                  total: estado.totalLinhas ?? 0,
                  existed: estado.jaExistiam ?? 0,
                  duplicated: estado.duplicadosNoArquivo ?? 0,
                })}
              </p>
              <p className="text-xs text-muted-foreground pt-1">{t("result.mapNote")}</p>
            </div>
          </div>

          <ListaOcorrencias
            titulo={t("result.errorsTitle")}
            vazio={null}
            itens={estado.erros ?? []}
            tom="destructive"
          />
          <ListaOcorrencias
            titulo={t("result.warningsTitle")}
            vazio={null}
            itens={estado.avisos ?? []}
            tom="warning"
          />

          <div className="flex gap-2">
            <Link href="/clients" className={buttonVariants()}>
              {t("result.backToList")}
            </Link>
            <Link href="/clients/import" className={buttonVariants({ variant: "outline" })}>
              {t("result.importAnother")}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function ListaOcorrencias({
  titulo,
  itens,
  tom,
}: {
  titulo: string
  vazio: null
  itens: { linha: number; motivo: string; detalhe?: string }[]
  tom: "destructive" | "warning"
}) {
  const t = useTranslations("clients.import")
  // Lista longa demais some no scroll e ninguém corrige nada. Mostra as
  // primeiras e diz quantas ficaram de fora.
  const LIMITE = 30
  if (itens.length === 0) return null

  const cor = tom === "destructive" ? "text-destructive" : "text-yellow-600"

  return (
    <div className="rounded-xl border bg-card p-6 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className={`size-4 ${cor}`} />
        <h3 className="font-semibold text-sm">
          {titulo} ({itens.length})
        </h3>
      </div>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {itens.slice(0, LIMITE).map((o, i) => (
          <li key={i}>
            <span className="font-medium text-foreground">{t("result.line", { n: o.linha })}</span>{" "}
            {t(`occurrences.${o.motivo}` as "occurrences.nomeInvalido")}
            {o.detalhe && <span className="text-xs"> — {o.detalhe}</span>}
          </li>
        ))}
      </ul>
      {itens.length > LIMITE && (
        <p className="text-xs text-muted-foreground">
          {t("result.andMore", { count: itens.length - LIMITE })}
        </p>
      )}
    </div>
  )
}
