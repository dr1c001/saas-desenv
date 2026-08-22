"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { BellOff, CheckCircle2, Volume2, VolumeX } from "lucide-react"
import { salvarPreferencias, type PreferenciasDeAviso } from "@/actions/notificacoes"
import { EVENTOS } from "@/lib/notificacoes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * O que cada pessoa recebe no celular, e se faz barulho.
 *
 * NÃO oferece escolher o toque, e isso é decisão, não falta: a propriedade
 * `sound` da API de notificação foi removida da especificação e nenhum
 * navegador implementa. No Android o som vem do canal de notificação, que é do
 * sistema operacional; no iPhone, do som padrão. Uma lista de toques aqui
 * seria uma lista que não toca nada — e a pessoa passaria meses achando que
 * escolheu.
 *
 * O que dá para oferecer de verdade está aqui: quais avisos, e silêncio.
 */
export function AvisosForm({ atual }: { atual: PreferenciasDeAviso }) {
  const t = useTranslations("avisos")
  const tn = useTranslations("notifications")
  const tc = useTranslations("common")
  const [silenciados, setSilenciados] = useState<string[]>(atual.silenciados)
  const [semSom, setSemSom] = useState(atual.semSom)
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciar] = useTransition()

  function salvar() {
    iniciar(async () => {
      await salvarPreferencias(silenciados, semSom)
      setSalvo(true)
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-1">
          {EVENTOS.map(({ evento, insistente }) => {
            const recebe = !silenciados.includes(evento)
            return (
              <div
                key={evento}
                className="flex items-start justify-between gap-3 border-b py-3 last:border-0"
              >
                <label htmlFor={`aviso-${evento}`} className="min-w-0 cursor-pointer text-sm">
                  <span className="font-medium">
                    {tn(`${evento}.title` as "osAtribuida.title")}
                  </span>
                  {insistente && (
                    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      {t("insistente")}
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {t(`quando.${evento}` as "quando.osAtribuida")}
                  </span>
                </label>
                <input
                  id={`aviso-${evento}`}
                  type="checkbox"
                  checked={recebe}
                  disabled={pendente}
                  onChange={() =>
                    setSilenciados((s) =>
                      recebe ? [...s, evento] : s.filter((x) => x !== evento)
                    )
                  }
                  className="mt-0.5 size-4 shrink-0 accent-primary cursor-pointer"
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start justify-between gap-3 pt-4">
          <label htmlFor="sem-som" className="min-w-0 cursor-pointer text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              {semSom ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              {t("semSom")}
            </span>
            <span className="block text-xs text-muted-foreground">{t("semSomAjuda")}</span>
          </label>
          <input
            id="sem-som"
            type="checkbox"
            checked={semSom}
            disabled={pendente}
            onChange={() => setSemSom((v) => !v)}
            className="mt-0.5 size-4 shrink-0 accent-primary cursor-pointer"
          />
        </CardContent>
      </Card>

      {/* A parte que evita a pergunta voltar toda semana. */}
      <p className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <BellOff className="mt-0.5 size-3.5 shrink-0" />
        {t("sobreOToque")}
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? tc("saving") : t("salvar")}
        </Button>
        {salvo && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="size-4" />
            {t("salvo")}
          </span>
        )}
      </div>
    </div>
  )
}
