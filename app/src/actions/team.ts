"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { requireVagaDeUsuario } from "@/lib/plan"
import { sendTeamInviteEmail } from "@/lib/resend"
import { getTranslator } from "@/lib/i18n"
import { getTranslations } from "next-intl/server"
import { translateFieldErrors } from "@/lib/validation"
import { CARGOS_ATRIBUIVEIS } from "@/lib/cargos"
import type { Idioma } from "@/lib/mensagens"

const inviteSchema = z.object({
  name: z.string().min(2, "nameRequired"),
  email: z.string().email("invalidEmail"),
  // Todos os cargos atribuíveis. OWNER fora: é quem criou a conta, e não um
  // cargo que se distribui.
  role: z.enum(CARGOS_ATRIBUIVEIS as unknown as [string, ...string[]]),
  document: z.string().optional(),
  phone: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
})

// Editar é o mesmo cadastro SEM o e-mail: ele é a identidade da conta no
// Supabase, e não um campo do formulário. Ver `atualizarIntegrante`.
//
// E com o cargo OPCIONAL. `CARGOS_ATRIBUIVEIS` não inclui OWNER de propósito —
// ninguém distribui "dono". Com o cargo obrigatório, a tela de edição do
// PROPRIETÁRIO mandava role="OWNER" (o Select fica desligado e não submete; o
// hidden compensava), o zod recusava o formulário INTEIRO, e corrigir o
// telefone do dono não gravava nada e não dizia nada. Ausente significa
// "mantenha o que está lá".
// (Achado na revisão pré-deploy de 23/09/2026.)
const editSchema = inviteSchema.omit({ email: true }).extend({
  role: inviteSchema.shape.role.optional(),
})

export type TeamFormState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
}

/**
 * Para onde o link do convite leva: a pessoa CRIA A PRÓPRIA SENHA.
 *
 * Antes ia direto para /dashboard. O convidado entrava pelo link e nunca
 * definia senha — então, na vez seguinte, não tinha com o que entrar: voltava
 * ao e-mail e clicava no link de novo. Só que os links do Supabase são de uso
 * único e expiram; quando expirava, a pessoa ficava de fora da empresa que
 * paga, e o dono tinha de convidar tudo outra vez.
 *
 * Com /criar-senha o link é usado UMA vez, para uma coisa só: escolher a senha.
 * Daí em diante a pessoa entra por e-mail e senha como qualquer um.
 * (Relatado pelo dono da plataforma em 23/09/2026.)
 */
const DESTINO_DO_CONVITE = "/criar-senha"

/**
 * `erro` é uma CHAVE nossa de tradução; `motivo` é o texto cru do Supabase.
 *
 * Os dois separados de propósito: passar a mensagem do GoTrue para o
 * `getTranslations` a trataria como chave, e a tela mostraria
 * "errors.Signups not allowed for this instance" para o dono.
 */
type LinkDeConvite = {
  id?: string
  token?: string
  erro?: "inviteFailed" | "missingServiceKey"
  motivo?: string
}

/**
 * O que o dono lê quando o link nao sai.
 *
 * A chave traduzida primeiro, e o texto cru do Supabase entre parenteses
 * quando existir: "Erro ao enviar convite" sozinho manda o dono adivinhar,
 * e o motivo costuma ser acionavel (instancia sem cadastro liberado, e-mail
 * recusado pelo provedor).
 */
function mensagemDoLink(
  tt: (chave: "errors.inviteFailed" | "errors.missingServiceKey") => string,
  link: LinkDeConvite
): string {
  const base = tt(`errors.${link.erro ?? "inviteFailed"}` as "errors.inviteFailed")
  return link.motivo ? `${base} (${link.motivo})` : base
}

/**
 * Pede ao Supabase um link novo.
 *
 * `tipo` importa: "invite" só funciona para quem ainda NÃO confirmou o e-mail;
 * para quem já entrou alguma vez, o GoTrue recusa com "User already
 * registered", e o equivalente é "recovery". Os dois chegam em /api/auth/confirm
 * e terminam na mesma tela de criar senha.
 */
/**
 * O texto útil de um corpo de erro do GoTrue, que ora vem JSON, ora texto puro.
 * Curto de propósito: vai para a tela do dono, entre parênteses.
 */
function motivoDoCorpo(corpo: string): string | undefined {
  if (!corpo) return undefined
  try {
    const j = JSON.parse(corpo)
    const m = j.msg ?? j.message ?? j.error_description ?? j.error
    if (typeof m === "string" && m) return m.slice(0, 200)
  } catch {
    // não era JSON: o texto puro já é a mensagem.
  }
  return corpo.slice(0, 200)
}

async function gerarLink(
  tipo: "invite" | "recovery",
  email: string,
  dados?: Record<string, unknown>
): Promise<LinkDeConvite> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) return { erro: "missingServiceKey" }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"
  // /admin/invite foi descontinuado nesta versao do GoTrue (retorna 404 texto puro).
  // /admin/generate_link com type "invite" e o equivalente atual — mesmo formato
  // de resposta (id + action_link no nivel raiz). redirectTo aqui so precisa ser
  // uma URL valida pra API aceitar a chamada — nao usamos o action_link que ela
  // geraria (ver comentario em enviarConvite sobre hashed_token).
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify({
      type: tipo,
      email,
      ...(dados ? { data: dados } : {}),
      redirectTo: appUrl,
    }),
  })

  if (!res.ok) {
    // O corpo vai junto, e não só para o console: é neste caminho que o GoTrue
    // põe quase todos os erros ("User already registered", "Signups not allowed
    // for this instance"), e sem ele o dono lê "erro ao enviar convite" e fica
    // sem saber o que fazer. (Achado na revisão pré-deploy de 23/09/2026.)
    const corpo = await res.text().catch(() => "")
    console.error("Supabase generate_link error:", tipo, res.status, corpo)
    return { erro: "inviteFailed", motivo: motivoDoCorpo(corpo) }
  }
  const data = await res.json()
  if (!data.id && !data.hashed_token) {
    // Acontece: 200 com um erro no corpo. Sem esta conferência o `upsert` de
    // quem chama receberia `id: undefined`.
    console.error("Supabase generate_link sem id nem token:", JSON.stringify(data))
    return { erro: "inviteFailed", motivo: data.msg ?? data.message }
  }
  // `id` sem `token` continua valendo: a conta no Supabase existe, e quem
  // chama ainda grava a pessoa na equipe. O que ela não recebe é o e-mail — e
  // a mensagem de `inviteEmailFailed` manda usar "Esqueci minha senha", que é
  // o caminho que sobra. Recusar tudo aqui deixaria a conta criada lá e nenhum
  // registro dela aqui.
  return { id: data.id, token: data.hashed_token }
}

/**
 * Manda o e-mail do convite.
 *
 * Usamos hashed_token direto (nao data.action_link): o action_link aponta pro
 * /auth/v1/verify hospedado pelo Supabase, que entrega a sessao via fragmento
 * de URL (#access_token=...) — fragmento nunca chega no servidor, entao
 * /api/auth/callback (que so entende ?code=) nunca conseguiria processar isso.
 * /api/auth/confirm recebe o hashed_token bruto por query string e chama
 * verifyOtp() no servidor, que estabelece a sessao via cookie de verdade.
 * (Achado testando o convite de equipe de ponta a ponta, 21/07/2026.)
 *
 * generate_link so cria o link, nao envia e-mail — o Resend e o unico envio,
 * entao uma falha aqui precisa aparecer pro usuario (nao ha fallback do Supabase).
 */
async function enviarConvite(opcoes: {
  email: string
  name: string
  tenantId: string
  locale: Idioma
  tipo: "invite" | "recovery"
  token: string
}): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servicoos.com.br"
  const link =
    `${appUrl}/api/auth/confirm?token_hash=${opcoes.token}` +
    `&type=${opcoes.tipo}&next=${DESTINO_DO_CONVITE}`

  const tenant = await prisma.tenant.findUnique({
    where: { id: opcoes.tenantId },
    select: { name: true, vocabulary: true },
  })
  // O convite sai no idioma da empresa (Tenant.locale, já resolvido por quem
  // chama) — inclusive o nome genérico de fallback, que também aparece no
  // corpo do e-mail. (i18n, item 1.)
  const empresa = { locale: opcoes.locale, vocabulary: tenant?.vocabulary ?? null }
  const t = getTranslator(opcoes.locale, "emails", empresa.vocabulary)
  return sendTeamInviteEmail(
    opcoes.email,
    opcoes.name,
    tenant?.name ?? t("teamInvite.fallbackCompany"),
    link,
    empresa
  )
    .then(() => true)
    .catch((err) => {
      console.error("Resend invite email error:", err)
      return false
    })
}

export async function inviteTeamMember(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const { tenantId, role: requesterRole, locale } = await getTenant()
  await requireActiveSubscription(tenantId)
  const tt = await getTranslations("team")
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
    return { message: (await getTranslations("common"))("noPermission") }
  }

  // "Até 3 usuários" (Starter) e "Até 10" (Pro) eram promessa de vitrine que
  // ninguém verificava — dava pra convidar equipe sem limite em qualquer
  // plano. Erro vira mensagem no formulário em vez de exceção: quem esbarra
  // no limite precisa saber o que fazer, não ver uma tela de erro.
  try {
    await requireVagaDeUsuario(tenantId)
  } catch (e) {
    return { message: (e as Error).message }
  }

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }

  const { name, email, role, document, phone, street, number, complement, district, city, state, zipCode } = parsed.data

  // Limite por IP (probing de vários e-mails) e por e-mail alvo (spam de
  // convite pra mesma caixa de entrada, ou reenvio repetido do mesmo link).
  // (Achado em revisão de segurança 2026-07-21.)
  const ip = await clientIp()
  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`invite:ip:${ip}`, 20, 15),
    checkRateLimit(`invite:email:${email.toLowerCase()}`, 5, 60),
  ])
  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { message: (await getTranslations("errors"))("tooManyAttempts") }
  }

  // Checagem GLOBAL (não só deste tenant): o generate_link abaixo, pra um
  // e-mail que já tem auth.users em outro tenant (ou convite pendente lá),
  // reaproveita o mesmo id — e o upsert por id mais abaixo reatribuiria
  // esse usuário (tenantId/role) pra este tenant, sequestrando a conta dele.
  // (Achado em revisão de segurança 2026-07-21.)
  // `mode: "insensitive"`: o Supabase normaliza e-mail para minúsculas, então
  // "Rita@X.com" e "rita@x.com" são a MESMA conta lá — e o `generate_link`
  // devolve o id que já existe. Com a comparação sensível a caixa que havia
  // aqui, a checagem não achava nada, o upsert logo abaixo (cujo `where` é só
  // o id) executava `update: { tenantId, role }`, e a pessoa era ARRANCADA da
  // empresa dela para a de quem convidou — junto com o vínculo das OS e do
  // histórico. (Achado na revisão pré-deploy de 23/09/2026; é a mesma classe do
  // sequestro de conta registrado em 21/07/2026, por outra porta.)
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  })
  if (existing) {
    return {
      message:
        existing.tenantId === tenantId
          ? tt("errors.emailInYourTeam")
          : tt("errors.emailInUse"),
    }
  }

  const link = await gerarLink("invite", email, { name, tenantId, role })
  if (link.erro || !link.id) {
    return { message: mensagemDoLink(tt, link) }
  }

  // Cinto E suspensório: mesmo com a checagem por e-mail acima, o `upsert`
  // abaixo tem `where: { id }` SEM tenant — se o Supabase devolver o id de uma
  // conta que já existe em outra empresa, o `update` a traria para cá. A
  // checagem por e-mail é o cinto; esta, pelo id que o Supabase acabou de
  // devolver, é o suspensório.
  const jaEDeOutraEmpresa = await prisma.user.findUnique({
    where: { id: link.id },
    select: { tenantId: true },
  })
  if (jaEDeOutraEmpresa && jaEDeOutraEmpresa.tenantId !== tenantId) {
    return { message: tt("errors.emailInUse") }
  }

  await prisma.user.upsert({
    where: { id: link.id },
    // `as never` na fronteira do Prisma: o zod já validou contra
    // CARGOS_ATRIBUIVEIS, e o teste em lib/__tests__/cargos.test.ts
    // garante que aquele catálogo e o enum do banco não divergem. Sem
    // esse teste, o cast seria uma promessa vazia.
    create: { id: link.id, name, email, role: role as never, tenantId, document: document || null, phone: phone || null },
    update: { name, role: role as never, tenantId, document: document || null, phone: phone || null },
  })
  const hasAddress = street || number || city || state || zipCode || complement || district
  if (hasAddress) {
    await prisma.userAddress.upsert({
      where: { userId: link.id },
      create: { userId: link.id, street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
      update: { street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
    })
  }

  // Sem token não há link — a pessoa já está na equipe, mas entra pelo
  // "Esqueci minha senha", que é o que a mensagem abaixo diz.
  const enviado = link.token
    ? await enviarConvite({ email, name, tenantId, locale, tipo: "invite", token: link.token })
    : false

  revalidatePath("/team")
  if (!enviado) return { message: tt("errors.inviteEmailFailed", { email }) }
  return { success: true, message: tt("errors.inviteSent", { email }) }
}

/**
 * Manda o convite de novo — porque o primeiro expirou, ou sumiu na caixa.
 *
 * Sem isto, o único caminho para quem perdeu o link era remover a pessoa da
 * equipe e convidá-la outra vez: o `findFirst` por e-mail lá em cima recusa
 * convidar quem já está na equipe, então "convidar de novo" não era uma opção.
 * Remover e reconvidar apaga a linha de User — e com ela o vínculo das OS, do
 * histórico e da localização.
 *
 * Quem NUNCA confirmou o e-mail recebe um "invite" novo; quem já entrou alguma
 * vez recebe um "recovery", porque o GoTrue recusa convidar duas vezes a mesma
 * conta confirmada. Nos dois casos o link termina na mesma tela de criar senha:
 * do ponto de vista do dono, o botão faz uma coisa só.
 * (Pedido do dono da plataforma em 23/09/2026.)
 */
export async function reenviarConvite(memberId: string): Promise<TeamFormState> {
  const { tenantId, role: requesterRole, locale } = await getTenant()
  await requireActiveSubscription(tenantId)
  const tt = await getTranslations("team")
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
    return { message: (await getTranslations("common"))("noPermission") }
  }

  const alvo = await prisma.user.findUnique({
    where: { id: memberId, tenantId },
    select: { email: true, name: true, role: true },
  })
  if (!alvo) return { message: tt("errors.memberNotFound") }

  // O DONO não é alvo deste botão.
  //
  // As duas Actions irmãs recusam quando `alvo.role === "OWNER"`; esta lia o
  // cargo e não olhava. Um ADMIN disparava, até cinco vezes por hora, um e-mail
  // oficial de "crie sua senha" na caixa de quem paga — que chega lá
  // indistinguível de golpe. O link vai para o e-mail do dono e não para o de
  // quem clicou (o e-mail não é editável, e é por isso que não é), mas provocar
  // esse e-mail não é do administrador.
  // (Achado na revisão pré-deploy de 23/09/2026.)
  if (alvo.role === "OWNER") {
    return { message: (await getTranslations("common"))("noPermission") }
  }

  // Os DOIS baldes do convite original: por IP (alguém varrendo a equipe,
  // disparando e-mail atrás de e-mail) e por e-mail alvo (spam na mesma caixa).
  // Esta é uma segunda porta para o mesmo Supabase e o mesmo Resend; reestabelecer
  // só um dos dois deixaria a porta nova mais larga que a velha.
  // (Achado em revisão de segurança 2026-07-21; o balde por IP voltou na revisão
  // pré-deploy de 23/09/2026.)
  const ip = await clientIp()
  const [porIp, porEmail] = await Promise.all([
    checkRateLimit(`invite:ip:${ip}`, 20, 15),
    checkRateLimit(`invite:email:${alvo.email.toLowerCase()}`, 5, 60),
  ])
  if (!porIp.allowed || !porEmail.allowed) {
    return { message: (await getTranslations("errors"))("tooManyAttempts") }
  }

  // `jaConfirmou` escolhe o tipo certo; a segunda tentativa existe porque essa
  // escolha depende de um campo do GoTrue, e errá-la deixaria o dono com um
  // botão que só sabe falhar — exatamente o defeito que este botão veio
  // resolver. Os dois tipos terminam na mesma tela, então tentar o outro não
  // muda nada para quem recebe.
  const dados = { name: alvo.name, tenantId, role: alvo.role }
  let tipo: "invite" | "recovery" = (await jaConfirmou(memberId)) ? "recovery" : "invite"
  let link = await gerarLink(tipo, alvo.email, dados)
  if (link.erro || !link.token) {
    tipo = tipo === "invite" ? "recovery" : "invite"
    link = await gerarLink(tipo, alvo.email, dados)
  }
  if (link.erro || !link.token) {
    return { message: mensagemDoLink(tt, link) }
  }

  const enviado = await enviarConvite({
    email: alvo.email,
    name: alvo.name,
    tenantId,
    locale,
    tipo,
    token: link.token,
  })
  // Chave própria: `inviteEmailFailed` começa com "Membro adicionado, mas..." —
  // e neste caminho ninguém foi adicionado, a pessoa já estava na equipe.
  if (!enviado) return { message: tt("errors.resendEmailFailed", { email: alvo.email }) }
  return { success: true, message: tt("errors.inviteResent", { email: alvo.email }) }
}

/** Se a conta no Supabase já teve o e-mail confirmado alguma vez. */
async function jaConfirmou(userId: string): Promise<boolean> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) return false
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  }).catch(() => null)
  if (!res?.ok) return false
  const u = await res.json().catch(() => null)
  return Boolean(u?.email_confirmed_at ?? u?.confirmed_at)
}

/**
 * Editar o cadastro de quem já está na equipe.
 *
 * O e-mail fica de fora por duas razões. A primeira: ele é a identidade da
 * conta no Supabase, e trocá-lo aqui deixaria o login apontando para um
 * endereço e o cadastro para outro. A segunda é de segurança — com o e-mail
 * editável, um ADMIN trocaria o endereço do PROPRIETÁRIO pelo próprio, clicaria
 * em "Reenviar convite" e receberia na caixa dele um link para definir a senha
 * do dono. A trava de cargo sozinha não fecharia esse caminho.
 *
 * Para mudar de e-mail, a pessoa sai da equipe e é convidada no endereço novo.
 * (Pedido do dono da plataforma em 23/09/2026.)
 */
export async function atualizarIntegrante(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const { tenantId, userId, role: requesterRole } = await getTenant()
  await requireActiveSubscription(tenantId)
  const tt = await getTranslations("team")
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") {
    return { message: (await getTranslations("common"))("noPermission") }
  }

  const memberId = String(formData.get("memberId") ?? "")
  const parsed = editSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    return { errors: await translateFieldErrors(parsed.error.flatten().fieldErrors) }
  }
  const { name, role, document, phone, street, number, complement, district, city, state, zipCode } = parsed.data

  const alvo = await prisma.user.findUnique({
    where: { id: memberId, tenantId },
    select: { role: true },
  })
  if (!alvo) return { message: tt("errors.memberNotFound") }

  // As mesmas duas travas de `updateTeamMemberRole`: ninguém rebaixa o dono, e
  // ninguém muda o próprio cargo (um ADMIN se promoveria a OWNER). O resto do
  // cadastro — nome, documento, telefone, endereço — cada um pode no seu.
  // Cargo ausente = mantenha o atual. É o que a tela manda quando o campo está
  // desligado (dono, ou a própria linha de quem edita).
  const mexeNoCargo = role !== undefined && role !== alvo.role
  if (mexeNoCargo && (alvo.role === "OWNER" || memberId === userId)) {
    return { message: (await getTranslations("common"))("noPermission") }
  }

  await prisma.user.update({
    where: { id: memberId, tenantId },
    data: {
      name,
      ...(mexeNoCargo ? { role: role as never } : {}),
      document: document || null,
      phone: phone || null,
    },
  })
  await prisma.userAddress.upsert({
    where: { userId: memberId },
    create: { userId: memberId, street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
    update: { street: street || null, number: number || null, complement: complement || null, district: district || null, city: city || null, state: state || null, zipCode: zipCode || null },
  })

  revalidatePath("/team")
  return { success: true, message: tt("errors.memberUpdated") }
}

/**
 * Um integrante com o cadastro inteiro, para a tela de edição.
 *
 * TRAVA DE CARGO AQUI, e não só na página.
 *
 * Esta função devolve CPF/CNPJ, telefone e endereço RESIDENCIAL. Nasceu com
 * tenant e assinatura por única defesa, como as outras leituras deste arquivo —
 * e Server Action é endereço HTTP próprio: um TECHNICIAN despachava
 * `getTeamMember(<id do dono>)` e recebia tudo. A página /team/[id]/edit barra
 * por cargo, mas a página não é a porta.
 *
 * É a MESMA porta que a auditoria de 13/09/2026 fechou em `getTeamMembers`
 * (o comentário sobre latitude/longitude, mais abaixo) — reaberta pela tela
 * nova, com dado mais sensível. Lá a correção foi parar de ENVIAR o que ninguém
 * usa; aqui os campos são o ponto da tela, então a correção é a trava.
 *
 * Cada um lê o próprio cadastro: quem edita o próprio telefone precisa
 * carregá-lo primeiro. (Achado na revisão pré-deploy de 23/09/2026.)
 */
export async function getTeamMember(memberId: string) {
  const { tenantId, userId, role: requesterRole } = await getTenant()
  await requireActiveSubscription(tenantId)
  const ehAdministrativo = requesterRole === "OWNER" || requesterRole === "ADMIN"
  if (!ehAdministrativo && memberId !== userId) return null
  return prisma.user.findUnique({
    where: { id: memberId, tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      document: true,
      phone: true,
      userAddress: {
        select: {
          street: true, number: true, complement: true,
          district: true, city: true, state: true, zipCode: true,
        },
      },
    },
  })
}

export async function updateTeamMemberRole(memberId: string, role: string) {
  const { tenantId, userId, role: requesterRole } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") return

  // "ADMIN" | "TECHNICIAN" no parâmetro é só o tipo do TypeScript — apagado em
  // runtime, então sem essa validação um ADMIN podia chamar isso com role
  // "OWNER" e se auto-promover. Também bloqueia mexer no próprio papel ou no
  // de um OWNER. (Achado em revisão de segurança 2026-07-19.)
  const parsed = z.enum(CARGOS_ATRIBUIVEIS as unknown as [string, ...string[]]).safeParse(role)
  if (!parsed.success) return
  if (memberId === userId) return

  const target = await prisma.user.findUnique({ where: { id: memberId, tenantId }, select: { role: true } })
  if (!target || target.role === "OWNER") return

  await prisma.user.update({
    where: { id: memberId, tenantId },
    data: { role: parsed.data as never },
  })
  revalidatePath("/team")
}

export async function removeTeamMember(memberId: string) {
  const { tenantId, userId, role: requesterRole } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (requesterRole !== "OWNER" && requesterRole !== "ADMIN") return
  if (memberId === userId) return // can't remove yourself

  // O DONO não se remove.
  //
  // A função irmã logo acima já recusava mexer no papel de um OWNER; esta
  // apagava a linha dele sem olhar o alvo. Um ADMIN — papel que outro ADMIN
  // distribui por convite — podia apagar o dono da empresa.
  //
  // O estrago não era perder um usuário. No login seguinte o dono cai em
  // `getTenant()` sem linha de User, não é super admin, e o código CRIA UMA
  // EMPRESA NOVA E VAZIA no nome dele: ele perde a empresa que paga, os
  // clientes, as OS e o financeiro, e fica olhando um tenant em branco. Do
  // outro lado, a empresa original fica sem OWNER — `subscribeToPlan` passa a
  // recusar com "ownerNotFound" e o e-mail de pagamento confirmado deixa de ter
  // destinatário —, enquanto quem apagou segue com acesso total.
  // (Achado na auditoria de 13/09/2026.)
  const alvo = await prisma.user.findUnique({
    where: { id: memberId, tenantId },
    select: { role: true },
  })
  if (!alvo || alvo.role === "OWNER") return

  await prisma.user.delete({ where: { id: memberId, tenantId } })

  // Defesa em profundidade: limpa tenantId/role do user_metadata no Supabase.
  // getTenant() nunca mais confia nesses campos para atribuir tenant/papel,
  // mas isso evita deixar dado stale (apontando pro tenant antigo) na conta
  // da pessoa removida.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (serviceRoleKey && supabaseUrl) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${memberId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ user_metadata: { tenantId: null, role: null } }),
    }).catch(() => null)
  }

  revalidatePath("/team")
}

export async function getTeamMembers(filtros?: { q?: string }) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const q = filtros?.q?.trim()
  return prisma.user.findMany({
    where: {
      tenantId,
      // Mesma convenção das outras listas (clientes, fornecedores): a busca é
      // do BANCO, e não um filtro no navegador — a tela não pode depender de
      // ter trazido a equipe inteira para achar alguém nela.
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      // SÓ a data da última posição — nunca as coordenadas.
      //
      // Esta consulta trazia `latitude` e `longitude` de todo mundo, e as duas
      // únicas defesas da função são tenant e assinatura: nenhum papel, nenhum
      // recurso. Ou seja, qualquer usuário autenticado — um TECHNICIAN, um
      // ATENDIMENTO, alguém cujo dono desmarcou a aba Equipe — despachava esta
      // Server Action e recebia a localização atual de todos os colegas.
      //
      // O projeto já tinha decidido que isso não pode: `/api/location/list`
      // ganhou trava de papel em 19/07/2026, com o comentário dizendo
      // exatamente isso, mais a checagem do recurso `gpsMap`; e `/map` repetia
      // a trava. (Desde 15/09/2026 as duas seguem a aba "Mapa" — a porta
      // continua fechada, só mudou quem tem a chave.) Foram trancadas duas
      // portas para a mesma coluna do mesmo modelo — esta terceira ficou
      // aberta.
      //
      // A correção não é acrescentar uma quarta checagem de papel: é PARAR DE
      // ENVIAR o que ninguém usa. A tela de Equipe imprime apenas
      // `formatDate(m.location.updatedAt)`; as coordenadas nunca foram lidas
      // por nenhuma tela. Quem precisa delas de verdade é o mapa, que tem a sua
      // própria rota, guardada. (Achado na auditoria de 13/09/2026.)
      location: { select: { updatedAt: true } },
    },
    orderBy: { createdAt: "asc" },
  })
}
