"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

// Idioma nas páginas públicas (sem tenant ainda) — cookie simples, lido em
// src/i18n/request.ts. Nas páginas autenticadas o idioma vem do Tenant
// (ver actions/settings.ts updateLocale), que tem prioridade sobre o cookie.
export async function setPublicLocale(locale: "pt" | "en") {
  if (locale !== "pt" && locale !== "en") return
  const cookieStore = await cookies()
  cookieStore.set("locale", locale, { maxAge: 60 * 60 * 24 * 365, path: "/" })
  revalidatePath("/", "layout")
}
