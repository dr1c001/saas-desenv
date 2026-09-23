"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription, ALL_TABS, type TabSlug } from "@/lib/auth"
import { ACOES, acoesValendo, ehAcao } from "@/lib/acoes"
import { abasPadraoDe, CARGOS_CONFIGURAVEIS, ehCargo, type Cargo } from "@/lib/cargos"
import { getTranslations } from "next-intl/server"

// Permissao POR CARGO.
//
// Antes tudo aqui era fixo em "TECHNICIAN", porque tecnico era o unico cargo
// configuravel que existia. As tabelas ja tinham chave (tenantId, role, ...) —
// so faltava a tela e estas funcoes deixarem de assumir um cargo so.

/**
 * O cargo pedido, ou nada.
 *
 * Recusa em vez de cair num padrao: o cargo vem do navegador, e escolher
 * "TECHNICIAN" quando chega lixo faria a tela gravar em cima do cargo errado
 * sem ninguem perceber. Administrativo tambem e recusado — nao ha o que
 * configurar em quem ja pode tudo, e aceitar gravaria linhas que nada le.
 */
function cargoValido(valor: string): Cargo | null {
  if (!ehCargo(valor)) return null
  return (CARGOS_CONFIGURAVEIS as readonly string[]).includes(valor) ? valor : null
}

export async function getPermissions(cargo: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const alvo = cargoValido(cargo)
  if (!alvo) return []

  // Rótulo das abas vem de `nav` (mesma fonte da sidebar) — ALL_TABS guarda só
  // slug + navKey, sem texto. (i18n, 07/08/2026.)
  const tNav = await getTranslations("nav")
  const [perms, tenant] = await Promise.all([
    prisma.tabPermission.findMany({
      where: { tenantId, role: alvo as never },
      select: { tab: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tabsConfiguredRoles: true },
    }),
  ])

  // Mesma regra de getAllowedTabs: só cai no padrão quem NUNCA configurou ESTE
  // cargo. Ler diferente aqui faria a tela mostrar um estado e o sistema
  // aplicar outro.
  const nuncaConfigurou =
    !(tenant?.tabsConfiguredRoles ?? []).includes(alvo) && perms.length === 0

  const padrao = new Set<string>(abasPadraoDe(alvo))
  const allowed = new Set(perms.map((p) => p.tab))
  return ALL_TABS.map((t) => ({
    tab: t.slug,
    label: tNav(t.navKey),
    allowed: nuncaConfigurou ? padrao.has(t.slug) : allowed.has(t.slug),
  }))
}

export async function savePermissions(cargo: string, allowedTabs: string[]) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  const alvo = cargoValido(cargo)
  if (!alvo) return

  // Só slugs que existem: a lista vem do navegador, e gravar lixo criaria
  // permissão para uma aba inventada — inofensivo hoje, e uma surpresa no dia
  // em que um slug novo coincidisse.
  const validas = allowedTabs.filter((t): t is TabSlug =>
    ALL_TABS.some((a) => a.slug === t)
  )

  const atual = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { tabsConfiguredRoles: true },
  })
  const configurados = [...new Set([...(atual?.tabsConfiguredRoles ?? []), alvo])]

  await prisma.$transaction([
    prisma.tabPermission.deleteMany({ where: { tenantId, role: alvo as never } }),
    ...(validas.length > 0
      ? [
          prisma.tabPermission.createMany({
            data: validas.map((tab) => ({ tenantId, role: alvo as never, tab })),
          }),
        ]
      : []),
    // O sinal que separa "nunca mexeram" de "mexeram e não liberaram nada".
    // Sem ele, desmarcar TODAS as abas gravava zero linhas, que a leitura
    // entendia como "usar o padrão" e devolvia 3 abas. A tela prometia acesso
    // nenhum e o sistema concedia três.
    //
    // Guardado por CARGO: um marcador único da empresa faria configurar o
    // técnico deixar o financeiro com menu vazio.
    prisma.tenant.update({
      where: { id: tenantId },
      data: { tabsConfigured: true, tabsConfiguredRoles: configurados },
    }),
  ])

  revalidatePath("/settings")
  revalidatePath("/")
}

// ─── Permissão por ação ──────────────────────────────────────────────────────

export async function getAcoes(cargo: string) {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const alvo = cargoValido(cargo)
  if (!alvo) return []

  const [perms, tenant] = await Promise.all([
    prisma.actionPermission.findMany({
      where: { tenantId, role: alvo as never },
      select: { action: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { actionsConfiguredRoles: true },
    }),
  ])

  const valendo = new Set(
    acoesValendo(
      (tenant?.actionsConfiguredRoles ?? []).includes(alvo),
      perms.map((p) => p.action).filter(ehAcao)
    )
  )
  return ACOES.map((acao) => ({ acao, allowed: valendo.has(acao) }))
}

export async function saveAcoes(cargo: string, permitidas: string[]) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return
  const alvo = cargoValido(cargo)
  if (!alvo) return

  const validas = permitidas.filter(ehAcao)

  const atual = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { actionsConfiguredRoles: true },
  })
  const configurados = [...new Set([...(atual?.actionsConfiguredRoles ?? []), alvo])]

  await prisma.$transaction([
    prisma.actionPermission.deleteMany({ where: { tenantId, role: alvo as never } }),
    ...(validas.length > 0
      ? [
          prisma.actionPermission.createMany({
            data: validas.map((action) => ({ tenantId, role: alvo as never, action })),
          }),
        ]
      : []),
    prisma.tenant.update({
      where: { id: tenantId },
      data: { actionsConfigured: true, actionsConfiguredRoles: configurados },
    }),
  ])

  revalidatePath("/settings")
  revalidatePath("/")
}
