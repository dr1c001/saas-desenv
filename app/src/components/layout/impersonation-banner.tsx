import { ShieldAlert } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { tenantImpersonado } from "@/lib/admin"
import { sairDaConta } from "@/actions/admin"

// Faixa vermelha, no topo de tudo, enquanto o dono da plataforma estiver vendo
// o sistema como uma empresa cliente. Não é enfeite: esquecer que se está na
// conta de outra pessoa é o jeito mais fácil de fazer besteira nos dados dela.
// Por isso é vermelho, fica sempre visível e a saída é um clique.
export async function ImpersonationBanner() {
  const alvo = await tenantImpersonado()
  if (!alvo) return null

  const [tenant, t] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: alvo }, select: { name: true } }),
    getTranslations("mapAdmin.admin.impersonation"),
  ])

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-red-600 px-4 py-2 text-sm text-white">
      <span className="flex items-center gap-2 font-medium">
        <ShieldAlert className="size-4 shrink-0" />
        {t("banner", { company: tenant?.name ?? "—" })}
      </span>
      <form action={sairDaConta}>
        <button
          type="submit"
          className="rounded border border-white/40 px-2.5 py-1 text-xs font-medium hover:bg-white/15"
        >
          {t("exit")}
        </button>
      </form>
    </div>
  )
}
