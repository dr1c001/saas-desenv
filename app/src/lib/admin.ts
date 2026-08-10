import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "./prisma"

// Quem é o dono da plataforma. Isto NÃO é um segredo — quem prova a identidade
// é a sessão do Supabase, não este valor. Fica em variável de ambiente só pra
// poder mudar sem alterar código; o padrão embutido mantém o comportamento de
// antes, quando o e-mail estava fixo em app/admin/layout.tsx.
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL ?? "adrielwellington02@gmail.com")
  .trim()
  .toLowerCase()

export const COOKIE_IMPERSONACAO = "admin_ver_como"

/**
 * E-mail do dono da plataforma, se for ele que está logado agora. Senão null.
 *
 * Usa getUser(), que valida o token junto ao Supabase, e não getSession(), que
 * apenas lê o cookie. Para o resto do sistema o cookie basta; para a conta que
 * pode entrar na conta dos outros, não.
 */
export const superAdminEmail = cache(async function superAdminEmail(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = user?.email?.trim().toLowerCase()
  // Comparação só depois de confirmar que há e-mail: sem esta guarda, um
  // SUPER_ADMIN_EMAIL vazio por engano na Vercel casaria com qualquer sessão
  // sem e-mail.
  if (!email || !SUPER_ADMIN_EMAIL || email !== SUPER_ADMIN_EMAIL) return null
  return email
})

export async function isSuperAdmin(): Promise<boolean> {
  return (await superAdminEmail()) !== null
}

/**
 * Obrigatório em TODA Server Action e rota do /admin.
 *
 * A checagem do layout não protege nada disso: Server Action tem ID próprio e
 * é despachável direto, sem passar por layout nenhum. É a mesma lição que já
 * custou caro neste projeto (seções 7.1 e 7.2 do plano de engenharia) — só que
 * aqui o estrago seria total, não parcial.
 */
export async function requireSuperAdmin(): Promise<string> {
  const email = await superAdminEmail()
  if (!email) throw new Error("Acesso restrito ao administrador da plataforma.")
  return email
}

export type AcaoAdmin =
  | "liberar_acesso"
  | "cancelar"
  | "reativar"
  | "trocar_plano"
  | "entrar_na_conta"
  | "sair_da_conta"

export async function registrarAcaoAdmin(
  adminEmail: string,
  action: AcaoAdmin,
  tenantId: string,
  detail?: string
) {
  // Falha de log não pode derrubar a ação em si, mas precisa aparecer.
  await prisma.adminAuditLog
    .create({ data: { adminEmail, action, tenantId, detail: detail ?? null } })
    .catch((err) => console.error("Falha ao gravar log de auditoria do admin:", err))
}

/**
 * Empresa que o dono da plataforma está "vendo como" agora, ou null.
 *
 * Ordem importa: sem cookie, retorna antes de qualquer verificação — o caminho
 * normal (99,99% das requisições) não paga nada por esta funcionalidade. Só
 * quando existe cookie é que se valida a sessão, e o cookie sozinho não
 * concede nada: quem decide é a sessão real, verificada no Supabase.
 */
export async function tenantImpersonado(): Promise<string | null> {
  const alvo = (await cookies()).get(COOKIE_IMPERSONACAO)?.value
  if (!alvo) return null
  if (!(await isSuperAdmin())) return null
  return alvo
}
