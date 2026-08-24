"use client"

import { useTranslations } from "next-intl"
import { Moon, Sun } from "lucide-react"
import { definirTema, useTemaEscuro } from "@/lib/tema"

/**
 * Trocar claro/escuro na landing.
 *
 * O tema já funcionava aqui — o script do layout raiz lê a preferência salva e
 * cai no `prefers-color-scheme` de quem nunca visitou. O que faltava era o
 * CONTROLE: quem chega pela landing ainda não tem conta, e o único botão de
 * tema do sistema morava dentro do painel.
 */
export function BotaoTema() {
  const t = useTranslations("nav")
  const escuro = useTemaEscuro()
  const rotulo = escuro ? t("lightMode") : t("darkMode")

  return (
    <button
      type="button"
      onClick={() => definirTema(!escuro)}
      aria-label={rotulo}
      title={rotulo}
      className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
