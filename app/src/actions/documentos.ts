"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { MAX_DIAS_GARANTIA } from "@/lib/garantia"

export type EstadoDocumentos = { erro?: string; ok?: boolean }

export async function getDocumentos() {
  const { tenantId } = await getTenant()
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { orderTerms: true, quoteTerms: true, warrantyDays: true },
  })
  return {
    orderTerms: t?.orderTerms ?? null,
    quoteTerms: t?.quoteTerms ?? null,
    warrantyDays: t?.warrantyDays ?? null,
  }
}

export async function salvarDocumentos(
  _prev: EstadoDocumentos,
  formData: FormData
): Promise<EstadoDocumentos> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Texto que sai impresso no documento entregue ao cliente final e prazo de
  // garantia que a empresa passa a dever — decisão do dono, não de campo.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const bruto = String(formData.get("warrantyDays") ?? "").trim()
  // Vazio significa "sem padrão definido", que é diferente de zero ("sem
  // garantia"). Os dois precisam ser guardáveis.
  let dias: number | null = null
  if (bruto !== "") {
    const n = Number(bruto)
    if (!Number.isInteger(n) || n < 0 || n > MAX_DIAS_GARANTIA) return { erro: "prazoInvalido" }
    dias = n
  }

  const texto = (nome: string) => {
    const v = String(formData.get(nome) ?? "").trim()
    return v === "" ? null : v.slice(0, 4000)
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      warrantyDays: dias,
      orderTerms: texto("orderTerms"),
      quoteTerms: texto("quoteTerms"),
    },
  })

  revalidatePath("/settings")
  return { ok: true }
}
