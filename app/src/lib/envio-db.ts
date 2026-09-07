import { prisma } from "@/lib/prisma"

// Os pedaços do envio que precisam do banco ou do ambiente.
//
// Vive fora de actions/ de propósito: um arquivo "use server" transforma toda
// export em endereço HTTP, e `emailDaEmpresa(tenantId)` como endpoint devolveria
// o e-mail do dono de qualquer empresa a quem soubesse um id.

/**
 * A URL pública do sistema.
 *
 * Existia como literal copiado em onze lugares — `process.env.NEXT_PUBLIC_APP_URL
 * ?? "https://servicoos.com.br"`. Onze cópias do mesmo fallback é onde a décima
 * segunda nasce apontando para outro domínio; e o fallback ser o domínio de
 * PRODUÇÃO significa que, num ambiente sem a variável, o link dentro do e-mail
 * leva o cliente para o sistema de verdade.
 *
 * Esta função não conserta as onze — conserta o caminho novo, e dá para onde
 * apontar quando alguém for unificar.
 */
export function urlPublica(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"
}

/**
 * Para onde vai a RESPOSTA do cliente.
 *
 * O e-mail do dono da empresa. Não existe coluna de e-mail em `Tenant`, e o
 * dono é a única pessoa que sempre existe e sempre é a certa para receber uma
 * resposta comercial.
 *
 * `null` quando não há dono (situação que só existe em base quebrada) — e aí o
 * envio segue com o reply-to padrão, porque perder o e-mail é pior do que a
 * resposta cair no lugar errado.
 */
export async function emailDaEmpresa(tenantId: string): Promise<string | null> {
  const dono = await prisma.user.findFirst({
    where: { tenantId, role: "OWNER" },
    select: { email: true },
    // O mais antigo: numa empresa com dois donos, quem criou a conta é quem
    // responde pelo comercial.
    orderBy: { createdAt: "asc" },
  })
  return dono?.email?.trim() || null
}

/**
 * O número do orçamento como o cliente o vê: ORC20260012.
 *
 * O formato é o mesmo da tela, do PDF e da página pública. Ele estava copiado
 * inline em cada um desses lugares; uma quarta cópia no e-mail faria o número
 * do documento divergir do número no assunto da mensagem que o carrega.
 */
export function numeroDoOrcamento(numero: number, criadoEm: Date | string): string {
  const ano = new Date(criadoEm).getFullYear()
  return `ORC${ano}${String(numero).padStart(4, "0")}`
}
