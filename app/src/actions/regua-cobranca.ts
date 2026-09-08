"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { requireRecurso, temRecurso } from "@/lib/plan"
import { lerRegua, type ConfigRegua } from "@/lib/regua-cobranca"

export type EstadoRegua = { erro?: string; ok?: boolean }

export async function getReguaCobranca(): Promise<{
  config: ConfigRegua
  whatsappConfigurado: boolean
  /** O plano inclui? A tela mostra o bloco travado quando não. */
  liberado: boolean
}> {
  const { tenantId } = await getTenant()
  const [t, liberado] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { dunningConfig: true, zapiInstance: true, zapiToken: true },
    }),
    temRecurso(tenantId, "reguaCobranca"),
  ])
  return {
    config: lerRegua(t?.dunningConfig),
    whatsappConfigurado: Boolean(t?.zapiInstance && t?.zapiToken),
    liberado,
  }
}

export async function salvarReguaCobranca(
  _prev: EstadoRegua,
  formData: FormData
): Promise<EstadoRegua> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Ligar a régua é decidir mandar cobrança, em nome da empresa, para o
  // celular dos clientes dela. Quem responde por isso é o dono — não quem
  // está em campo, nem quem só lança as contas.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }
  // A trava do PLANO. Esconder o bloco na tela não protege nada: toda export
  // de um arquivo "use server" é um endereço HTTP que o cliente do Starter
  // pode chamar direto. Esta linha é a que vale.
  await requireRecurso(tenantId, "reguaCobranca")

  const marcado = (nome: string) => formData.get(nome) === "on"

  // `lerRegua` faz a higiene do valor mínimo (texto vazio, letra, negativo →
  // zero) num lugar só, que é o mesmo lugar que lê o que já está gravado.
  // Validar aqui de novo criaria duas regras para o mesmo campo.
  const config = lerRegua({
    ativo: marcado("ativo"),
    lembrarAntes: marcado("lembrarAntes"),
    cobrarDepois: marcado("cobrarDepois"),
    porWhatsapp: marcado("porWhatsapp"),
    porEmail: marcado("porEmail"),
    valorMinimo: formData.get("valorMinimo"),
  })

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { dunningConfig: config },
  })

  revalidatePath("/settings")
  return { ok: true }
}
