import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { Clock } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { diasRestantes } from "@/lib/teste-gratis"

// A contagem regressiva do teste grátis.
//
// ─── Por que ela precisa existir ────────────────────────────────────────────
//
// Quem está testando não sabe quanto falta. Sem essa linha, o fim do teste
// chega como uma porta fechada: a pessoa abre o sistema numa terça, encontra a
// tela de assinatura, e trata como defeito — não como "acabou o prazo".
//
// É o mesmo raciocínio do aviso de inadimplência, que existe porque "quem perde
// acesso sem aviso trata como defeito do sistema e cancela".
//
// ─── Por que fica discreta até o fim ────────────────────────────────────────
//
// Uma faixa vermelha no primeiro dia de teste é a pior forma de receber alguém
// que acabou de chegar. Ela só ganha urgência nos últimos três dias, que é
// quando a informação passa a ser acionável.

export async function AvisoDeTeste({
  status,
  trialEndsAt,
}: {
  status: string
  trialEndsAt: Date | null
}) {
  if (status !== "TRIAL") return null

  const dias = diasRestantes(trialEndsAt, new Date())
  if (dias <= 0) return null

  const t = await getTranslations("testeGratis")
  const urgente = dias <= 3

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm ${
        urgente
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Clock className="size-3.5" />
        {dias === 1 ? t("ultimoDia") : t("faltamDias", { n: dias })}
      </span>
      <Link href="/billing" className={buttonVariants({ size: "sm", variant: urgente ? "default" : "outline" })}>
        {t("assinar")}
      </Link>
    </div>
  )
}
