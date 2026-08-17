"use client"

import { useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Camera, Loader2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apagarFotoDaOs, enviarFotoDaOs, type FotoExibicao } from "@/actions/attachments"
import { MAX_FOTOS_POR_OS } from "@/lib/foto"

/** Maior lado da imagem depois de reduzir. 1600px imprime bem em A4 e mostra
 *  detalhe de vazamento, risco ou etiqueta de equipamento. */
const LADO_MAXIMO = 1600
const QUALIDADE = 0.75

/**
 * Reduz a foto no próprio aparelho, antes de subir.
 *
 * É a decisão que faz a diferença em campo: foto de celular moderno tem 3–8 MB
 * e o técnico está num subsolo com 4G ruim. Depois disto fica em 200–400 KB —
 * a diferença entre enviar em segundos e desistir no meio.
 *
 * De quebra resolve o HEIC do iPhone: o canvas devolve JPEG, que todo mundo
 * abre, sem precisar de biblioteca de conversão.
 */
async function comprimir(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const canvas = document.createElement("canvas")
  canvas.width = largura
  canvas.height = altura
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close()

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALIDADE))
  // Se o navegador não devolver o blob (caso raro), envia o original em vez de
  // travar: melhor upload pesado que foto perdida.
  if (!blob) return arquivo
  return new File([blob], "foto.jpg", { type: "image/jpeg" })
}

export function OsFotos({
  orderId,
  fotos,
  podeApagar,
  bloqueada,
}: {
  orderId: string
  fotos: FotoExibicao[]
  podeApagar: boolean
  bloqueada: boolean
}) {
  const t = useTranslations("fotos")
  const [enviando, startEnvio] = useTransition()
  const [apagando, startApagar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cheio = fotos.length >= MAX_FOTOS_POR_OS

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const escolhidos = Array.from(e.target.files ?? [])
    if (inputRef.current) inputRef.current.value = ""
    if (!escolhidos.length) return
    setErro(null)

    // Uma de cada vez: o servidor confere o limite por OS a cada envio, e
    // mandar tudo junto passaria do teto sem ninguém perceber.
    for (const bruto of escolhidos.slice(0, MAX_FOTOS_POR_OS - fotos.length)) {
      const comprimida = await comprimir(bruto)
      const fd = new FormData()
      fd.set("orderId", orderId)
      fd.set("foto", comprimida)
      await new Promise<void>((pronto) =>
        startEnvio(async () => {
          const r = await enviarFotoDaOs({}, fd)
          if (r.erro) setErro(r.erro)
          pronto()
        })
      )
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t("title")} {fotos.length > 0 && `(${fotos.length}/${MAX_FOTOS_POR_OS})`}
        </CardTitle>
        {!bloqueada && !cheio && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
          >
            {enviando ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Camera className="size-3.5 mr-1.5" />
            )}
            {enviando ? t("sending") : t("add")}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          // capture="environment" abre a câmera traseira direto no celular, em
          // vez da galeria — que é o gesto certo pra quem está no local.
          capture="environment"
          multiple
          onChange={aoEscolher}
          className="hidden"
        />

        {fotos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {bloqueada ? t("emptyLocked") : t("empty")}
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {fotos.map((f) => (
              <div key={f.id} className="relative group aspect-square">
                {f.link ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.link}
                    alt=""
                    loading="lazy"
                    onClick={() => setAmpliada(f.link)}
                    className="size-full object-cover rounded-md border cursor-zoom-in"
                  />
                ) : (
                  <div className="size-full rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    {t("unavailable")}
                  </div>
                )}
                {podeApagar && !bloqueada && (
                  <button
                    type="button"
                    disabled={apagando}
                    aria-label={t("remove")}
                    onClick={() => {
                      if (confirm(t("confirmRemove"))) {
                        startApagar(async () => {
                          const r = await apagarFotoDaOs(f.id)
                          if (r.erro) setErro(r.erro)
                        })
                      }
                    }}
                    className="absolute top-1 right-1 rounded-full bg-background/90 border p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {erro && (
          <p className="text-sm text-destructive">{t(`errors.${erro}` as "errors.muitoGrande")}</p>
        )}
        {!bloqueada && fotos.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        )}
      </CardContent>

      {/* Ampliação: no celular a miniatura não serve pra conferir se a foto
          ficou nítida, e refazer depois de sair do local é impossível. */}
      {ampliada && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setAmpliada(null)}
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <button
            type="button"
            aria-label={t("close")}
            className="absolute top-4 right-4 text-white"
            onClick={() => setAmpliada(null)}
          >
            <X className="size-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada} alt="" className="max-h-full max-w-full object-contain rounded" />
        </div>
      )}
    </Card>
  )
}
