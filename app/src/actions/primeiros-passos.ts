"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { primeirosPassos, type PrimeirosPassos } from "@/lib/primeiros-passos"

/**
 * O retrato da empresa numa consulta só.
 *
 * Isto roda em TODO carregamento do dashboard — a tela mais aberta do sistema.
 * Por isso os contadores vêm por `_count` na mesma consulta do tenant, e não
 * como `count()` separados: a diferença entre uma ida ao banco e três aparece
 * em cada abertura de tela, todos os dias, pra sempre.
 */
export async function getPrimeirosPassos(): Promise<PrimeirosPassos> {
  const { tenantId } = await getTenant()

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      phone: true,
      document: true,
      logoUrl: true,
      pixKey: true,
      orderTerms: true,
      quoteTerms: true,
      onboardingDismissedAt: true,
      _count: { select: { clients: true, orders: true } },
    },
  })

  const preenchido = (v: string | null | undefined) => Boolean(v && v.trim())

  return primeirosPassos({
    temTelefone: preenchido(t?.phone),
    temDocumento: preenchido(t?.document),
    temLogo: preenchido(t?.logoUrl),
    clientes: t?._count.clients ?? 0,
    ordens: t?._count.orders ?? 0,
    temPix: preenchido(t?.pixKey),
    // Um dos dois já conta: quem só faz orçamento não tem por que escrever
    // termos de OS, e vice-versa. Exigir os dois deixaria o passo pendente
    // pra sempre em metade das empresas.
    temTermos: preenchido(t?.orderTerms) || preenchido(t?.quoteTerms),
    dispensado: t?.onboardingDismissedAt !== null && t?.onboardingDismissedAt !== undefined,
  })
}

/** Fecha o painel antes de concluir tudo. */
export async function dispensarPrimeirosPassos() {
  const { tenantId, role } = await getTenant()
  // Sem requireActiveSubscription: fechar um aviso não é usar o produto, e
  // quem está com pagamento pendente nem chega no dashboard.
  if (role !== "OWNER" && role !== "ADMIN") return

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingDismissedAt: new Date() },
  })
  revalidatePath("/dashboard")
}
