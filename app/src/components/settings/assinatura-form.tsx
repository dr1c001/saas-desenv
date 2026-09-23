"use client"

import { useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import SignatureCanvas from "react-signature-canvas"
import { CheckCircle2, PenLine, RotateCcw, Trash2 } from "lucide-react"
import { apagarMinhaAssinatura, salvarMinhaAssinatura } from "@/actions/assinatura"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useQuadroNoTamanhoDaCaixa } from "@/components/shared/usar-quadro"

/**
 * O quadro onde cada pessoa desenha a assinatura dela.
 *
 * Desenhar, e não enviar arquivo: assinatura é gesto, e quase ninguém tem a
 * própria assinatura como imagem no computador. O mesmo componente que o
 * cliente final usa para assinar a OS no celular do técnico.
 */
export function AssinaturaForm({ atual }: { atual: string | null }) {
  const t = useTranslations("assinatura")
  const tc = useTranslations("common")
  const quadro = useRef<SignatureCanvas>(null)
  const [gravada, setGravada] = useState(atual)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  // Sem isto o desenho é gravado num buffer de 300x150 esticado para a
  // largura da caixa, e o traço cai fora — nada era salvo.
  useQuadroNoTamanhoDaCaixa(quadro, !gravada)

  function salvar() {
    setErro(null)
    if (!quadro.current || quadro.current.isEmpty()) {
      setErro(t("erro.vazio"))
      return
    }
    // getTrimmedCanvas apara o espaço em branco em volta do traço: sem isso a
    // assinatura sai minúscula no meio de um retângulo enorme no PDF.
    const desenho = quadro.current.getTrimmedCanvas().toDataURL("image/png")
    iniciar(async () => {
      const r = await salvarMinhaAssinatura(desenho)
      if (r.erro) {
        setErro(t(`erro.${r.erro}` as "erro.formato"))
        return
      }
      setGravada(desenho)
    })
  }

  function apagar() {
    iniciar(async () => {
      await apagarMinhaAssinatura()
      setGravada(null)
      quadro.current?.clear()
    })
  }

  if (gravada) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-green-600">
          <CheckCircle2 className="size-4" />
          {t("gravada")}
        </div>
        {/* Fundo claro fixo: a assinatura é preta e transparente, e sumiria
            sobre o fundo escuro do tema noturno. */}
        <img
          src={gravada}
          alt={t("alt")}
          className="max-h-24 rounded-md border bg-white p-2"
        />
        <Button variant="outline" size="sm" onClick={apagar} disabled={pendente}>
          <Trash2 className="size-3.5 mr-1" />
          {t("apagar")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("ondeSai")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-2">
          <SignatureCanvas
            ref={quadro}
            penColor="#111827"
            canvasProps={{
              className: "w-full h-40 rounded bg-white touch-none",
              "aria-label": t("alt"),
            }}
          />
        </CardContent>
      </Card>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={pendente}>
          <PenLine className="size-4 mr-1" />
          {pendente ? tc("saving") : t("salvar")}
        </Button>
        <Button variant="outline" onClick={() => quadro.current?.clear()} disabled={pendente}>
          <RotateCcw className="size-4 mr-1" />
          {t("limpar")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t("ondeSai")}</p>
    </div>
  )
}
