"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  COOKIE_IMPERSONACAO,
  registrarAcaoAdmin,
  requireSuperAdmin,
  tenantImpersonado,
} from "@/lib/admin"
import { sendTeamInviteEmail } from "@/lib/resend"
import { ehRecurso, recursosDoPlano } from "@/lib/plan"
import type { PlatformRole } from "@/generated/prisma/client"
import { desligadasValidas } from "@/lib/funcoes"
import {
  porQueNaoApagar,
  type MotivoParaNaoApagar,
  type RetratoDaEmpresa,
} from "@/lib/descarte"

/** Áreas que podem ser atribuídas pela tela. DONO fica de fora de propósito:
 *  é o fundador, definido por variável de ambiente, e não algo que se concede
 *  por formulário. */
const PAPEIS_VALIDOS: PlatformRole[] = ["FINANCEIRO", "COMERCIAL", "LOGISTICO", "TI"]

// Estas são as ações mais poderosas do sistema: mexem no acesso e na cobrança
// de empresas clientes. TODAS começam por requireSuperAdmin() — a checagem do
// app/admin/layout.tsx não protege nenhuma delas, porque Server Action tem ID
// próprio e é despachável direto, sem passar por layout algum.

/**
 * Retrato de uma empresa, para decidir se ela pode ser apagada.
 *
 * Numeros, e nao registros: a pergunta e "tem alguma coisa aqui dentro?", e
 * trazer as listas so para contar seria caro a toa na tela do painel.
 */
export async function retratoParaDescarte(tenantId: string): Promise<RetratoDaEmpresa | null> {
  await requireSuperAdmin("apagarEmpresa")
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          clients: true,
          orders: true,
          revenues: true,
          quotes: true,
          subscriptions: true,
        },
      },
    },
  })
  if (!t) return null
  return {
    id: t.id,
    nome: t.name,
    situacao: t.subscriptionStatus,
    // Qualquer Subscription registrada significa que ela chegou a assinar em
    // algum momento — mesmo que tenha cancelado depois.
    jaAssinou: t._count.subscriptions > 0,
    criadaEm: t.createdAt,
    usuarios: t._count.users,
    clientes: t._count.clients,
    ordens: t._count.orders,
    receitas: t._count.revenues,
    orcamentos: t._count.quotes,
  }
}

/**
 * Apaga um cadastro que nunca virou nada.
 *
 * A operacao mais destrutiva do sistema. Por isso ela:
 *
 *  1. exige super admin, como toda action deste arquivo;
 *  2. RECONFERE a regra no servidor, com o retrato lido AGORA. A tela ja
 *     esconde o botao, mas Server Action tem ID proprio e e despachavel
 *     direto — e entre a tela carregar e o clique acontecer, a empresa pode
 *     ter assinado;
 *  3. apaga so o que a regra permite: uma empresa que passa esta praticamente
 *     vazia, entao sao os usuarios e o proprio tenant. NADA de apagar filho
 *     para contornar o RESTRICT — as dezessete tabelas com RESTRICT sao rede
 *     de seguranca, e contorna-las seria desfazer a protecao para usar a
 *     ferramenta que ela protege;
 *  4. registra no log do painel antes de sumir com o registro, porque depois
 *     nao ha de onde tirar o nome.
 */
export async function apagarEmpresaAbandonada(
  tenantId: string
): Promise<{ ok: true } | { erro: MotivoParaNaoApagar | "naoEncontrada" }> {
  const admin = await requireSuperAdmin("apagarEmpresa")

  const retrato = await retratoParaDescarte(tenantId)
  if (!retrato) return { erro: "naoEncontrada" }

  const motivo = porQueNaoApagar(retrato)
  if (motivo) return { erro: motivo }

  // Antes de apagar: depois nao ha de onde tirar o nome.
  await registrarAcaoAdmin(
    admin.email,
    "apagar_empresa",
    tenantId,
    `${retrato.nome}: ${retrato.situacao}, ${retrato.usuarios} usuário(s), criada em ${retrato.criadaEm.toISOString().slice(0, 10)}`
  )

  await prisma.$transaction([
    // UserAddress cai por cascata do User; as tabelas com CASCADE em Tenant
    // (permissoes, chaves de API, filiais, campos, certificado) caem com o
    // tenant. Se sobrar qualquer outra coisa, o RESTRICT recusa a transacao
    // inteira — que e exatamente o comportamento desejado.
    prisma.user.deleteMany({ where: { tenantId } }),
    prisma.tenant.delete({ where: { id: tenantId } }),
  ])

  revalidatePath("/admin")
  return { ok: true }
}

/**
 * Destrava uma empresa que pagou mas ficou presa em PENDING.
 *
 * Existe por causa de 07/08/2026: uma cliente pagou, o webhook da Asaas estava
 * apontando pro domínio antigo, e ela ficou um dia sem acesso. Resolver exigiu
 * eu mexer no banco à mão. Com isto, o dono resolve sozinho em 10 segundos.
 */
export async function liberarAcesso(tenantId: string) {
  const admin = await requireSuperAdmin("liberarAcesso")

  const antes = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, name: true },
  })
  if (!antes) throw new Error("Empresa não encontrada.")

  await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "ACTIVE" } })
  // A Subscription mais recente também vira ACTIVE: hasActiveSubscription lê o
  // Tenant, mas a carência de PAST_DUE e a tela de cobrança leem a Subscription
  // — deixar as duas discordando produz bug difícil de enxergar depois.
  const ultima = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (ultima) {
    await prisma.subscription.update({
      where: { id: ultima.id },
      // Zera os avisos de atraso pelo mesmo motivo do webhook: liberado à mão
      // hoje, se voltar a atrasar amanhã os avisos recomeçam do primeiro.
      data: { status: "ACTIVE", pastDueWarningsSent: 0 },
    })
  }

  await registrarAcaoAdmin(admin.email, "liberar_acesso", tenantId, `${antes.name}: ${antes.subscriptionStatus} → ACTIVE`)
  revalidatePath("/admin")
}

/** Encerra o acesso. Não cancela a cobrança na Asaas — isso continua sendo
 *  feito pelo cliente em /billing ou por você no painel da Asaas. Aqui é só o
 *  acesso ao sistema, e o texto na tela diz isso. */
export async function cancelarAcesso(tenantId: string) {
  const admin = await requireSuperAdmin("cancelarAcesso")

  const antes = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionStatus: true, name: true },
  })
  if (!antes) throw new Error("Empresa não encontrada.")

  await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: "CANCELLED" } })
  const ultima = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (ultima) {
    await prisma.subscription.update({
      where: { id: ultima.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
  }

  await registrarAcaoAdmin(admin.email, "cancelar", tenantId, `${antes.name}: ${antes.subscriptionStatus} → CANCELLED`)
  revalidatePath("/admin")
}

/** Troca o plano de uma empresa (ex.: negociou Enterprise por telefone).
 *  Reflete na hora no que ela tem liberado, pelas travas de lib/plan.ts. */
export async function trocarPlano(tenantId: string, planId: string) {
  const admin = await requireSuperAdmin("trocarPlano")

  const [tenant, plano] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, planId: true } }),
    prisma.plan.findUnique({ where: { id: planId }, select: { name: true } }),
  ])
  if (!tenant) throw new Error("Empresa não encontrada.")
  if (!plano) throw new Error("Plano não encontrado.")

  const anterior = tenant.planId
    ? (await prisma.plan.findUnique({ where: { id: tenant.planId }, select: { name: true } }))?.name
    : null

  await prisma.tenant.update({ where: { id: tenantId }, data: { planId } })
  const ultima = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (ultima) await prisma.subscription.update({ where: { id: ultima.id }, data: { planId } })

  await registrarAcaoAdmin(admin.email, "trocar_plano", tenantId, `${tenant.name}: ${anterior ?? "sem plano"} → ${plano.name}`)
  revalidatePath("/admin")
}

/** Entra na conta do cliente para dar suporte. */
/**
 * Concede ou tira recursos avulsos, por cima do que o plano dá.
 *
 * Existe porque isto já foi feito DUAS VEZES por edição direta no banco de
 * produção: a assinatura digital da primeira cliente pagante (10/08/2026) e o
 * Mapa GPS dela (18/08/2026). Cada uma dessas exigiu alguém com acesso ao
 * banco, e nenhuma ficou registrada em lugar nenhum — daqui a seis meses não
 * haveria como saber quem liberou o quê, nem por quê.
 *
 * `recursos` é a lista COMPLETA dos extras depois da mudança, não um
 * incremento: a tela manda o estado final, e o que sumiu da lista é removido.
 * Assim conceder e revogar são a mesma operação, e não existe caminho em que
 * a tela e o banco discordem sobre o que foi tirado.
 */
export async function alterarRecursosExtras(tenantId: string, recursos: string[]) {
  const admin = await requireSuperAdmin("concederRecurso")

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, extraFeatures: true, plan: { select: { slug: true } } },
  })
  if (!tenant) throw new Error("Empresa não encontrada.")

  // Só entra o que o código conhece. Sem esta peneira, um valor digitado
  // errado viraria uma string morta no banco: nunca libera nada e ninguém
  // descobre por que "o recurso foi concedido e não apareceu".
  const validos = [...new Set(recursos.filter(ehRecurso))]

  // O que o plano já dá não precisa estar nos extras. Guardar duplicado faria
  // a lista crescer sozinha a cada upgrade e mentiria sobre o que foi
  // concedido à mão — que é justamente o que este registro serve pra contar.
  const doPlano = new Set(recursosDoPlano(tenant.plan?.slug))
  const extras = validos.filter((r) => !doPlano.has(r))

  // Set<string> e não Set<Recurso>: extraFeatures é texto livre no banco, e um
  // valor que não é recurso conhecido (de uma edição manual antiga) precisa
  // aparecer aqui como removido, não travar a comparação.
  const antes = new Set<string>(tenant.extraFeatures)
  const depois = new Set<string>(extras)
  const ganhou = extras.filter((r) => !antes.has(r))
  const perdeu = tenant.extraFeatures.filter((r) => !depois.has(r))
  if (ganhou.length === 0 && perdeu.length === 0) return

  await prisma.tenant.update({ where: { id: tenantId }, data: { extraFeatures: extras } })

  const mudancas = [
    ...ganhou.map((r) => `+${r}`),
    ...perdeu.map((r) => `-${r}`),
  ].join(", ")
  await registrarAcaoAdmin(admin.email, "alterar_recursos", tenantId, `${tenant.name}: ${mudancas}`)
  revalidatePath("/admin")
}

/**
 * Ajusta os tetos e o preço de UMA empresa, por cima do plano dela.
 *
 * É o que torna possível o plano customizado: os planos são três e as empresas
 * não. Sempre aparece a que precisa de 12 usuários mas não quer o Enterprise.
 *
 * `null` herda do plano, `0` é sem limite — a diferença está em lib/limite.ts.
 * Aqui os valores chegam já normalizados pela tela; o que esta função faz é
 * conferir que são inteiros plausíveis antes de gravar, porque Server Action é
 * endereço HTTP e o corpo dela não é confiável.
 */
/**
 * Liga e desliga FUNÇÕES para uma empresa.
 *
 * Recebe o que fica DESLIGADO, não o que fica ligado — mesma forma do banco, e
 * pelo mesmo motivo: lista vazia significa "tudo funcionando". Se recebesse as
 * ligadas, um erro que enviasse lista vazia apagaria o sistema da empresa.
 */
export async function alterarFuncoesDaEmpresa(tenantId: string, desligadas: string[]) {
  const admin = await requireSuperAdmin("alterarLimites")

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, disabledFeatures: true },
  })
  if (!tenant) throw new Error("Empresa não encontrada.")

  // Só o que o código conhece. Sem esta peneira, um valor digitado errado
  // viraria uma string morta no banco: não desliga nada e ninguém descobre por
  // que "a função foi desligada e continua aparecendo".
  const validas = desligadasValidas(desligadas)

  const antes = new Set(tenant.disabledFeatures)
  const depois = new Set<string>(validas)
  const desligou = validas.filter((f) => !antes.has(f))
  const religou = tenant.disabledFeatures.filter((f) => !depois.has(f))
  if (desligou.length === 0 && religou.length === 0) return

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { disabledFeatures: validas },
  })

  const mudancas = [
    ...desligou.map((f) => `−${f}`),
    ...religou.map((f) => `+${f}`),
  ].join(", ")
  await registrarAcaoAdmin(admin.email, "alterar_funcoes", tenantId, `${tenant.name}: ${mudancas}`)
  revalidatePath("/admin")
}

export async function alterarLimitesDaEmpresa(
  tenantId: string,
  ajustes: {
    usuarios: number | null
    osMes: number | null
    nfseMes: number | null
    precoMensal: number | null
  }
) {
  const admin = await requireSuperAdmin("alterarLimites")

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true, maxUsersOverride: true, maxOrdersOverride: true,
      maxNfseOverride: true, customPriceMonthly: true,
    },
  })
  if (!tenant) throw new Error("Empresa não encontrada.")

  // Teto absurdo é digitação errada, não combinado: 100 mil usuários não
  // existe, e gravar isso equivale a "sem limite" sem dizer que é.
  const teto = (v: number | null, maximo: number): number | null => {
    if (v === null) return null
    if (!Number.isInteger(v) || v < 0 || v > maximo) return null
    return v
  }
  const preco = (v: number | null): number | null => {
    if (v === null) return null
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) return null
    return Math.round(v * 100) / 100
  }

  const data = {
    maxUsersOverride: teto(ajustes.usuarios, 10_000),
    maxOrdersOverride: teto(ajustes.osMes, 1_000_000),
    maxNfseOverride: teto(ajustes.nfseMes, 1_000_000),
    customPriceMonthly: preco(ajustes.precoMensal),
  }

  // O registro conta o que MUDOU, não o estado — quem lê a auditoria depois
  // quer saber o que foi combinado naquele dia, e um retrato completo a cada
  // salvamento afogaria isso.
  const antes = {
    maxUsersOverride: tenant.maxUsersOverride,
    maxOrdersOverride: tenant.maxOrdersOverride,
    maxNfseOverride: tenant.maxNfseOverride,
    customPriceMonthly: tenant.customPriceMonthly === null ? null : Number(tenant.customPriceMonthly),
  }
  const rotulo: Record<string, string> = {
    maxUsersOverride: "usuários",
    maxOrdersOverride: "OS/mês",
    maxNfseOverride: "NFS-e/mês",
    customPriceMonthly: "preço",
  }
  const comoTexto = (v: number | null) => (v === null ? "plano" : v === 0 ? "∞" : String(v))

  const mudancas = (Object.keys(data) as (keyof typeof data)[])
    .filter((k) => data[k] !== antes[k])
    .map((k) => `${rotulo[k]}: ${comoTexto(antes[k])} → ${comoTexto(data[k])}`)
  if (mudancas.length === 0) return

  await prisma.tenant.update({ where: { id: tenantId }, data })
  await registrarAcaoAdmin(
    admin.email,
    "alterar_limites",
    tenantId,
    `${tenant.name}: ${mudancas.join(", ")}`
  )
  revalidatePath("/admin")
}

export async function entrarNaConta(tenantId: string) {
  const admin = await requireSuperAdmin("entrarNaConta")

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  if (!tenant) throw new Error("Empresa não encontrada.")

  const jar = await cookies()
  jar.set(COOKIE_IMPERSONACAO, tenantId, {
    httpOnly: true, // fora do alcance de qualquer JavaScript da página
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Sessão de suporte é curta de propósito: esquecer que está "vendo como"
    // um cliente é o jeito mais fácil de fazer besteira na conta dele.
    maxAge: 60 * 60,
  })

  await registrarAcaoAdmin(admin.email, "entrar_na_conta", tenantId, tenant.name)
  redirect("/dashboard")
}

export async function sairDaConta() {
  const admin = await requireSuperAdmin("entrarNaConta")
  const alvo = await tenantImpersonado()

  const jar = await cookies()
  jar.delete(COOKIE_IMPERSONACAO)

  if (alvo) await registrarAcaoAdmin(admin.email, "sair_da_conta", alvo)
  redirect("/admin")
}

// ─── Equipe de administração da plataforma ───────────────────────────────────
//
// Só quem tem "gerenciarEquipe" (hoje, só o DONO) chega aqui. Todas as ações
// gravam no AdminAuditLog: mexer em quem pode mexer nos clientes é a ação mais
// sensível do painel, e precisa de rastro.

/** O log de auditoria é indexado por empresa; ações sobre a própria equipe não
 *  têm empresa alvo, então usam este marcador em vez de um id vazio. */
const ALVO_PLATAFORMA = "plataforma"

export type AdminFormState = { message?: string; success?: boolean }

export async function adicionarAdmin(
  _prev: AdminFormState,
  formData: FormData
): Promise<AdminFormState> {
  const dono = await requireSuperAdmin("gerenciarEquipe")

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const name = String(formData.get("name") ?? "").trim()
  const role = String(formData.get("role") ?? "") as PlatformRole
  const phone = String(formData.get("phone") ?? "").trim() || null
  const document = String(formData.get("document") ?? "").trim() || null

  if (!email.includes("@")) return { message: "Informe um e-mail válido." }
  if (name.length < 2) return { message: "Informe o nome da pessoa." }
  if (!PAPEIS_VALIDOS.includes(role)) return { message: "Escolha uma área." }

  const jaExiste = await prisma.platformAdmin.findUnique({ where: { email }, select: { id: true, active: true } })
  if (jaExiste?.active) return { message: "Esta pessoa já está na equipe." }

  // Reativa em vez de duplicar: e-mail é único, e quem saiu e voltou deve
  // manter o mesmo registro pra que o histórico de auditoria continue ligado.
  if (jaExiste) {
    await prisma.platformAdmin.update({ where: { email }, data: { name, role, phone, document, active: true, invitedBy: dono.email } })
  } else {
    await prisma.platformAdmin.create({ data: { email, name, role, phone, document, invitedBy: dono.email } })
  }

  // A pessoa precisa de uma conta no Supabase pra conseguir entrar. Se já
  // tiver, o convite falha e ela simplesmente entra pelo /login normal — daí
  // a mensagem diferente em vez de tratar como erro.
  const convidado = await enviarConviteAdmin(email, name)

  await registrarAcaoAdmin(dono.email, "adicionar_admin", ALVO_PLATAFORMA, `${name} <${email}> como ${role}`)
  revalidatePath("/admin")
  return {
    success: true,
    message: convidado
      ? `Convite enviado para ${email}.`
      : `${name} foi adicionado. Como já tem conta no sistema, é só entrar normalmente pelo login.`,
  }
}

export async function alterarPapelAdmin(id: string, role: PlatformRole) {
  const dono = await requireSuperAdmin("gerenciarEquipe")
  if (!PAPEIS_VALIDOS.includes(role)) throw new Error("Área inválida.")

  const antes = await prisma.platformAdmin.findUnique({ where: { id }, select: { email: true, name: true, role: true } })
  if (!antes) throw new Error("Pessoa não encontrada.")

  await prisma.platformAdmin.update({ where: { id }, data: { role } })
  await registrarAcaoAdmin(dono.email, "alterar_papel_admin", ALVO_PLATAFORMA, `${antes.name}: ${antes.role} → ${role}`)
  revalidatePath("/admin")
}

export async function desativarAdmin(id: string) {
  const dono = await requireSuperAdmin("gerenciarEquipe")

  const alvo = await prisma.platformAdmin.findUnique({ where: { id }, select: { email: true, name: true, active: true } })
  if (!alvo) throw new Error("Pessoa não encontrada.")

  // Desativa em vez de apagar: o AdminAuditLog guarda o e-mail de quem fez
  // cada ação, e remover a linha deixaria o histórico sem dono.
  await prisma.platformAdmin.update({ where: { id }, data: { active: !alvo.active } })
  await registrarAcaoAdmin(
    dono.email,
    "desativar_admin",
    ALVO_PLATAFORMA,
    `${alvo.name} ${alvo.active ? "desativado" : "reativado"}`
  )
  revalidatePath("/admin")
}

/**
 * Apaga o cadastro de vez — para quem não trabalha mais aqui.
 *
 * Diferente de desativar: desativar corta o acesso e mantém o registro pra
 * eventual retorno; remover tira a pessoa da lista. O histórico do que ela fez
 * NÃO se perde — o AdminAuditLog guarda o e-mail como texto, não como
 * referência, justamente pra sobreviver a isto.
 */
export async function removerAdmin(id: string) {
  const dono = await requireSuperAdmin("gerenciarEquipe")

  const alvo = await prisma.platformAdmin.findUnique({ where: { id }, select: { email: true, name: true, role: true } })
  if (!alvo) throw new Error("Pessoa não encontrada.")

  await prisma.platformAdmin.delete({ where: { id } })
  await registrarAcaoAdmin(
    dono.email,
    "remover_admin",
    ALVO_PLATAFORMA,
    `${alvo.name} <${alvo.email}> (${alvo.role}) removido da equipe`
  )
  revalidatePath("/admin")
}

/** Cria a conta no Supabase e manda o link. Devolve false se a pessoa já tinha
 *  conta (aí ela entra pelo login normal) ou se o envio falhou. */
async function enviarConviteAdmin(email: string, name: string): Promise<boolean> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) return false

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      // Sem tenantId no metadata: administrador de plataforma não pertence a
      // empresa nenhuma, e é justamente isso que o guarda em getTenant() usa
      // pra não criar uma empresa fantasma no nome dele.
      body: JSON.stringify({ type: "invite", email, data: { name, platformAdmin: true }, redirectTo: appUrl }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (!data.hashed_token) return false

    // O link leva direto pro painel, não pro dashboard: quem é da equipe de
    // administração não tem empresa pra ver no dashboard.
    const link = `${appUrl}/api/auth/confirm?token_hash=${data.hashed_token}&type=invite&next=/admin`
    await sendTeamInviteEmail(email, name, "ServiçoOS — Equipe de Administração", link, "pt")
    return true
  } catch (err) {
    console.error("[convite de admin] falhou:", err)
    return false
  }
}
