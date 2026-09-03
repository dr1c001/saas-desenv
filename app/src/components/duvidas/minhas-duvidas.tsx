"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { CheckCircle2, Loader2, MessageCircleQuestion, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  abrirDuvida,
  fecharMinhaDuvida,
  marcarDuvidaLida,
  responderNaDuvida,
  type EstadoDuvida,
} from "@/actions/duvidas"
import { MAX_ABERTAS_POR_EMPRESA, MAX_CARACTERES, temRespostaNova } from "@/lib/duvida"

// "Preciso de ajuda" — o canal que não existia.
//
// Até aqui não havia caminho nenhum para o cliente perguntar dentro do sistema:
// ele ligava, mandava mensagem para o celular do dono, ou desistia. E
// "desistia" não deixa rastro nenhum.
//
// O formulário manda junto a TELA em que a pessoa está. Não é telemetria: é a
// metade da resposta. "Como emito nota?" vindo de /settings/fiscal e vindo de
// /service-orders são duas perguntas diferentes.

export type DuvidaNaTela = {
  id: string
  status: string
  lastMessageAt: string
  lastMessageFrom: "CLIENTE" | "PLATAFORMA"
  readByClientAt: string | null
  mensagens: { id: string; kind: "CLIENTE" | "PLATAFORMA"; body: string; authorName: string }[]
}

export function MinhasDuvidas({ duvidas }: { duvidas: DuvidaNaTela[] }) {
  const t = useTranslations("duvidas")
  const caminho = usePathname()
  const [abrindo, setAbrindo] = useState(false)

  const abertas = duvidas.filter((d) => d.status !== "FECHADA").length
  const cheio = abertas >= MAX_ABERTAS_POR_EMPRESA

  return (
    <section id="duvidas" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("titulo")}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitulo")}</p>
        </div>
        {!abrindo && (
          <Button size="sm" disabled={cheio} onClick={() => setAbrindo(true)}>
            <MessageCircleQuestion className="size-4 mr-1.5" />
            {t("novaPergunta")}
          </Button>
        )}
      </div>

      {cheio && !abrindo && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t("erros.muitasAbertas", { max: MAX_ABERTAS_POR_EMPRESA })}
        </p>
      )}

      {abrindo && (
        <FormularioNovo caminho={caminho} onPronto={() => setAbrindo(false)} />
      )}

      {duvidas.length === 0 && !abrindo && (
        <p className="text-sm text-muted-foreground">{t("vazio")}</p>
      )}

      <div className="space-y-3">
        {duvidas.map((d) => (
          <Conversa key={d.id} duvida={d} />
        ))}
      </div>
    </section>
  )
}

function FormularioNovo({ caminho, onPronto }: { caminho: string; onPronto: () => void }) {
  const t = useTranslations("duvidas")
  const [estado, formAction, enviando] = useActionState<EstadoDuvida, FormData>(abrirDuvida, {})

  if (estado.ok) setTimeout(onPronto, 0)

  return (
    <Card>
      <CardContent className="py-4">
        <form action={formAction} className="space-y-3">
          {/* A tela em que a pessoa está, para o suporte não precisar
              perguntar "onde você estava?" antes de qualquer coisa. É filtrada
              pelo catálogo no servidor: caminho fora dele vira nulo. */}
          <input type="hidden" name="tela" value={caminho} />
          <Textarea
            name="texto"
            rows={4}
            required
            maxLength={MAX_CARACTERES}
            placeholder={t("placeholder")}
            autoFocus
          />
          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`erros.${estado.erro}` as "erros.vazio", { max: MAX_ABERTAS_POR_EMPRESA })}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={enviando}>
              {enviando ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="size-4 mr-1.5" />
              )}
              {t("enviar")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onPronto}>
              {t("cancelar")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("ajudaEnvio")}</p>
        </form>
      </CardContent>
    </Card>
  )
}

function Conversa({ duvida }: { duvida: DuvidaNaTela }) {
  const t = useTranslations("duvidas")
  const [respondendo, setRespondendo] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [estado, formAction, enviando] = useActionState<EstadoDuvida, FormData>(
    responderNaDuvida.bind(null, duvida.id),
    {}
  )

  const nova = temRespostaNova(
    new Date(duvida.lastMessageAt),
    duvida.lastMessageFrom,
    duvida.readByClientAt ? new Date(duvida.readByClientAt) : null
  )

  if (estado.ok && respondendo) setTimeout(() => setRespondendo(false), 0)

  return (
    <Card className={nova ? "border-primary/50" : undefined}>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t(`status.${duvida.status}` as "status.ABERTA")}
          </span>
          {nova && (
            <button
              type="button"
              className="text-xs font-medium text-primary underline underline-offset-2"
              onClick={() => iniciar(() => marcarDuvidaLida(duvida.id).then(() => undefined))}
            >
              {t("marcarLida")}
            </button>
          )}
        </div>

        <ul className="space-y-2">
          {duvida.mensagens.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${
                m.kind === "CLIENTE" ? "bg-muted" : "bg-primary/10"
              }`}
            >
              <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                {m.kind === "CLIENTE" ? m.authorName : t("suporte")}
              </p>
              {/* Texto puro. Nada de HTML vindo de campo de formulário. */}
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>

        {respondendo ? (
          <form action={formAction} className="space-y-2">
            <Textarea name="texto" rows={3} required maxLength={MAX_CARACTERES} autoFocus />
            {estado.erro && (
              <p className="text-sm text-destructive">
                {t(`erros.${estado.erro}` as "erros.vazio", { max: MAX_ABERTAS_POR_EMPRESA })}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={enviando}>
                {enviando && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                {t("enviar")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRespondendo(false)}>
                {t("cancelar")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setRespondendo(true)}>
              {duvida.status === "FECHADA" ? t("reabrir") : t("escrever")}
            </Button>
            {duvida.status !== "FECHADA" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pendente}
                onClick={() => iniciar(() => fecharMinhaDuvida(duvida.id).then(() => undefined))}
              >
                <CheckCircle2 className="size-4 mr-1.5" />
                {t("resolvido")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
