import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { VisitaGuiada } from "@/components/demo/visita"

// A demonstração pública.
//
// Existe por um motivo comercial concreto: até 31/08/2026 não havia forma de
// ver o sistema por dentro sem criar conta E assinar. Para uma marca que o dono
// da desentupidora nunca ouviu falar, pedir R$ 97 antes de mostrar qualquer
// coisa é o pedido mais difícil que existe — e o funil mostrava isso (quatro
// cadastros em três meses).
//
// ─── Fora do (dashboard) de propósito ────────────────────────────────────────
//
// Não usa o layout autenticado, não chama getTenant, não toca o Prisma. Os
// dados vêm todos de lib/demo.ts, que é literal. Uma rota pública dentro do
// aplicativo que guarda a carteira de clientes de terceiros só é segura se ela
// não tiver caminho nenhum até o banco — e a forma de garantir isso é não ter
// o import, não é lembrar de filtrar.
//
// Precisa estar em `isPublicRoute` em proxy.ts, senão o middleware manda para
// /login e o link não serve para nada.

export const metadata: Metadata = {
  title: "ServiçoOS — Demonstração",
  description:
    "Veja o ServiçoOS funcionando, com dados de exemplo. Sem cadastro e sem cartão.",
}

export default async function DemoPage() {
  const t = await getTranslations("demo")

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-bold">
            ServiçoOS
          </Link>
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            {t("selo")}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("titulo")}</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">{t("subtitulo")}</p>
        </div>

        <VisitaGuiada />
      </main>
    </div>
  )
}
