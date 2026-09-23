"use client"

import { useActionState, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ExternalLink, FileText, Loader2, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { enviarNota, type EstadoNota, type NotaExibicao } from "@/actions/notas-compra"
import { ApagarNotaButton } from "@/components/notas/apagar-nota-button"
import { comprimir } from "@/lib/comprimir-foto"

// A nota do fornecedor, dentro da ordem de compra.
//
// Aqui é onde ela é anexada, no momento em que chega. A aba /notas é onde ela é
// PROCURADA depois — duas perguntas diferentes, duas telas.

export function NotasDaCompra({
  purchaseOrderId,
  notas,
  podeAnexar,
}: {
  purchaseOrderId: string
  notas: NotaExibicao[]
  podeAnexar: boolean
}) {
  const t = useTranslations("notasCompra")
  const inputRef = useRef<HTMLInputElement>(null)
  const [estado, formAction, enviando] = useActionState<EstadoNota, FormData>(enviarNota, {})
  const [comprimindo, setComprimindo] = useState(false)

  /**
   * Reduz a foto NO APARELHO antes de mandar.
   *
   * A primeira versão mandava o arquivo cru, e falhava exatamente no aparelho
   * em que a funcionalidade é usada: fotografar uma nota de papel dá 3–8 MB, o
   * limite de corpo das Server Actions é 4 MB (next.config.ts), e o HEIC do
   * iPhone nem passa pela validação de tipo. Depois disto fica em 200–400 KB e
   * sai JPEG, que todo mundo abre.
   *
   * Envia por `FormData` montado à mão, e não pelo `requestSubmit` do
   * formulário: o arquivo que vai é o COMPRIMIDO, não o que está no input.
   */
  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    // Limpa o input já: sem isso, escolher o MESMO arquivo de novo (depois de
    // um erro) não dispara `change`, e o botão parece morto.
    e.target.value = ""
    if (!arquivo) return

    setComprimindo(true)
    try {
      const fd = new FormData()
      fd.set("purchaseOrderId", purchaseOrderId)
      fd.set("foto", await comprimir(arquivo))
      formAction(fd)
    } finally {
      setComprimindo(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Paperclip className="size-4" />
          {t("titulo")}
        </CardTitle>

        {podeAnexar && (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              // Envia ao escolher: um botão "anexar" seguido de outro "enviar"
              // é um passo a mais sem nenhuma decisão no meio.
              onChange={aoEscolher}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={enviando || comprimindo}
              onClick={() => inputRef.current?.click()}
            >
              {enviando || comprimindo ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Paperclip className="size-3.5 mr-1.5" />
              )}
              {enviando || comprimindo ? t("enviando") : t("anexar")}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {notas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("vazio")}</p>
        ) : (
          notas.map((n) => (
            <div key={n.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{n.nome}</span>
              {n.link ? (
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-sm underline-offset-4 hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  {t("abrir")}
                </a>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">{t("indisponivel")}</span>
              )}
              {podeAnexar && <ApagarNotaButton notaId={n.id} />}
            </div>
          ))
        )}

        {estado.erro && (
          <p className="text-sm text-destructive">
            {t(`erros.${estado.erro}` as "erros.semPermissao")}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
