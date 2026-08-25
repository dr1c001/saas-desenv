import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "./prisma"
import type { PlatformRole } from "@/generated/prisma/client"

// E-mail do fundador. Vale como DONO SEMPRE, mesmo que a tabela PlatformAdmin
// esteja vazia ou que alguém se remova por engano — é a chave reserva que
// impede o painel de ficar trancado sem ninguém dentro. Não é segredo: quem
// prova a identidade é a sessão do Supabase, não este valor.
const EMAIL_FUNDADOR = (process.env.SUPER_ADMIN_EMAIL ?? "adrielwellington02@gmail.com")
  .trim()
  .toLowerCase()

export const COOKIE_IMPERSONACAO = "admin_ver_como"

// ─── Permissões ──────────────────────────────────────────────────────────────
//
// A matriz inteira num lugar só, legível de cima a baixo. Mudar quem pode o
// quê é mudar uma linha aqui — não caçar checagem espalhada por dez arquivos.
//
// O raciocínio de cada área:
//   FINANCEIRO cuida de cobrança: libera quem pagou, corta quem não pagou, vê
//     MRR e relatório. NÃO entra na conta de cliente — não precisa dos dados
//     dele pra fazer o trabalho, e todo acesso a mais é exposição a mais.
//   COMERCIAL vende: vê crescimento e conversão, negocia e troca plano. Não
//     mexe em acesso nem entra em conta.
//   LOGISTICO dá suporte de uso: entra na conta pra ajudar o cliente. Não vê
//     financeiro nem mexe em cobrança.
//   TI investiga problema técnico: entra na conta e destrava cliente preso por
//     falha do sistema (foi o caso do webhook em 07/08). Não vê financeiro.
//   DONO faz tudo, e é o único que administra a própria equipe.

export type Permissao =
  | "verPainel"
  | "verFinanceiro"
  | "gerarRelatorio"
  | "liberarAcesso"
  | "cancelarAcesso"
  | "trocarPlano"
  // Conceder recurso avulso (Mapa GPS, NFS-e...) por cima do plano. Vai junto
  // de trocarPlano porque é estritamente MENOS poderoso: trocar pro Pro libera
  // tudo de uma vez; isto libera um item só.
  | "concederRecurso"
  // Ajustar os TETOS e o preço de uma empresa por cima do plano. Fica junto de
  // trocarPlano pelo mesmo motivo do concederRecurso — é menos poderoso que
  // mudar o plano inteiro. O preço é o que amarra: quem pode mexer no valor
  // cobrado é quem já podia trocar o plano e mudar o valor por essa via.
  | "alterarLimites"
  | "entrarNaConta"
  | "gerenciarEquipe"
  // Apagar um cadastro abandonado. SO DO DONO, e de proposito: e a unica acao
  // do painel que destroi dado em vez de mexer em acesso, nao tem desfazer, e
  // nao ha motivo operacional para financeiro ou comercial precisarem dela.
  | "apagarEmpresa"

const PERMISSOES: Record<PlatformRole, Permissao[]> = {
  DONO: [
    "verPainel", "verFinanceiro", "gerarRelatorio", "liberarAcesso",
    "cancelarAcesso", "trocarPlano", "concederRecurso", "alterarLimites",
    "entrarNaConta", "gerenciarEquipe", "apagarEmpresa",
  ],
  FINANCEIRO: ["verPainel", "verFinanceiro", "gerarRelatorio", "liberarAcesso", "cancelarAcesso", "trocarPlano", "concederRecurso", "alterarLimites"],
  COMERCIAL: ["verPainel", "verFinanceiro", "gerarRelatorio", "trocarPlano", "concederRecurso", "alterarLimites"],
  LOGISTICO: ["verPainel", "entrarNaConta"],
  TI: ["verPainel", "liberarAcesso", "entrarNaConta"],
}

export function papelPode(role: PlatformRole, permissao: Permissao): boolean {
  return PERMISSOES[role]?.includes(permissao) ?? false
}

export function permissoesDe(role: PlatformRole): Permissao[] {
  return PERMISSOES[role] ?? []
}

// ─── Quem está logado ────────────────────────────────────────────────────────

export type AdminLogado = { email: string; name: string; role: PlatformRole }

/**
 * O administrador de plataforma logado agora, ou null.
 *
 * Usa getUser(), que valida o token junto ao Supabase, e não getSession(), que
 * apenas lê o cookie. Para o resto do sistema o cookie basta; para as contas
 * que podem entrar na conta dos outros, não.
 */
export const adminLogado = cache(async function adminLogado(): Promise<AdminLogado | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = user?.email?.trim().toLowerCase()
  // Só compara depois de confirmar que há e-mail: sem esta guarda, um
  // EMAIL_FUNDADOR vazio por engano casaria com qualquer sessão sem e-mail.
  if (!email) return null

  if (EMAIL_FUNDADOR && email === EMAIL_FUNDADOR) {
    // A linha do fundador na tabela é opcional — o papel DONO é garantido no
    // código pra que remover a si mesmo por engano não tranque o painel.
    const registro = await prisma.platformAdmin.findUnique({ where: { email }, select: { name: true } })
    return { email, name: registro?.name ?? "Dono", role: "DONO" }
  }

  const membro = await prisma.platformAdmin.findUnique({
    where: { email },
    select: { email: true, name: true, role: true, active: true, acceptedAt: true },
  })
  if (!membro?.active) return null

  // Registra que a pessoa de fato entrou. acceptedAt prova que o convite foi
  // aceito (em vez de o cadastro ficar pendurado sem ninguém), e lastSeenAt
  // mostra quem anda usando o painel — útil na hora de revisar quem ainda
  // precisa de acesso. Melhor esforço: falhar aqui não pode barrar o login.
  // try/catch além do .catch(): o .catch() só pega promessa rejeitada, e um
  // erro SÍNCRONO aqui derrubaria o login inteiro — justamente o oposto de
  // "melhor esforço". (Descoberto por um teste que quebrou, 10/08/2026.)
  try {
    void prisma.platformAdmin
      .update({
        where: { email },
        data: { lastSeenAt: new Date(), ...(membro.acceptedAt ? {} : { acceptedAt: new Date() }) },
      })
      .catch(() => null)
  } catch {
    // registrar acesso é conveniência; entrar no painel não pode depender disso
  }

  return { email: membro.email, name: membro.name, role: membro.role }
})

export async function isSuperAdmin(): Promise<boolean> {
  return (await adminLogado()) !== null
}

/**
 * Obrigatório em TODA Server Action e rota do painel.
 *
 * A checagem do layout não protege nada disso: Server Action tem ID próprio e
 * é despachável direto, sem passar por layout nenhum. É a mesma lição que já
 * custou caro neste projeto (seções 7.1 e 7.2) — só que aqui o estrago seria
 * total, não parcial.
 *
 * Passe a permissão exigida sempre que a ação for além de "ver o painel".
 */
export async function requireSuperAdmin(permissao: Permissao = "verPainel"): Promise<AdminLogado> {
  const admin = await adminLogado()
  if (!admin) throw new Error("Acesso restrito à equipe de administração.")
  if (!papelPode(admin.role, permissao)) {
    throw new Error("Seu perfil não tem permissão para esta ação.")
  }
  return admin
}

// ─── Auditoria ───────────────────────────────────────────────────────────────

export type AcaoAdmin =
  | "liberar_acesso"
  | "cancelar"
  | "reativar"
  | "trocar_plano"
  | "alterar_recursos"
  | "alterar_limites"
  | "alterar_funcoes"
  | "entrar_na_conta"
  | "sair_da_conta"
  | "adicionar_admin"
  // O registro fica DEPOIS de o tenant sumir, entao o detalhe guarda o nome e
  // os numeros — e a unica memoria que resta de que aquela empresa existiu.
  | "apagar_empresa"
  | "alterar_papel_admin"
  | "desativar_admin"
  | "remover_admin"

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

// ─── Entrar na conta do cliente ──────────────────────────────────────────────

/**
 * Empresa que a pessoa está "vendo como" agora, ou null.
 *
 * Ordem importa: sem cookie, retorna antes de qualquer verificação — o caminho
 * normal (99,99% das requisições do sistema) não paga nada por esta
 * funcionalidade. Só quando existe cookie é que se valida a sessão, e o cookie
 * sozinho não concede nada: quem decide é a sessão real, verificada no
 * Supabase, e o papel precisa ter a permissão.
 */
export async function tenantImpersonado(): Promise<string | null> {
  const alvo = (await cookies()).get(COOKIE_IMPERSONACAO)?.value
  if (!alvo) return null

  const admin = await adminLogado()
  if (!admin || !papelPode(admin.role, "entrarNaConta")) return null
  return alvo
}
