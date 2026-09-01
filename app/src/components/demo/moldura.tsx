import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { Segmento } from "@/lib/demo"
import { VisitaGuiada } from "@/components/demo/visita"

// A moldura das duas rotas da demo (/demo e /demo/[ramo]).
//
// Existe para as duas páginas não duplicarem cabeçalho, título e aviso — que é
// exatamente o tipo de coisa que se atualiza num lugar e esquece no outro.
//
// Fora do grupo (dashboard) de propósito: não usa o layout autenticado, não
// chama getTenant, não toca o Prisma. Uma rota pública dentro do aplicativo que
// guarda a carteira de clientes de terceiros só é segura se não tiver caminho
// nenhum até o banco — e a forma de garantir isso é não ter o import.

export async function Moldura({ segmento }: { segmento: Segmento }) {
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

        <VisitaGuiada segmento={segmento} />
      </main>
    </div>
  )
}
