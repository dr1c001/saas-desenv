"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription, ALL_TABS, DEFAULT_TECHNICIAN_TABS, type TabSlug } from "@/lib/auth"
import { ACOES, acoesValendo, ehAcao } from "@/lib/acoes"
import { getTranslations } from "next-intl/server"

export async function getPermissions() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Rótulo das abas vem de `nav` (mesma fonte da sidebar) — ALL_TABS guarda só
  // slug + navKey, sem texto. (i18n, 07/08/2026.)
  const tNav = await getTranslations("nav")
  const [perms, tenant] = await Promise.all([
    prisma.tabPermission.findMany({
      where: { tenantId, role: "TECHNICIAN" },
      select: { tab: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { tabsConfigured: true } }),
  ])

  // Mesma regra de getAllowedTabs: só cai no padrão quem NUNCA configurou.
  // Ler diferente aqui faria a tela mostrar um estado e o sistema aplicar outro.
  if (!tenant?.tabsConfigured && perms.length === 0) {
    return ALL_TABS.map((t) => ({
      tab: t.slug,
      label: tNav(t.navKey),
      allowed: DEFAULT_TECHNICIAN_TABS.includes(t.slug as TabSlug),
    }))
  }

  const allowed = new Set(perms.map((p) => p.tab))
  return ALL_TABS.map((t) => ({
    tab: t.slug,
    label: tNav(t.navKey),
    allowed: allowed.has(t.slug),
  }))
}

export async function savePermissions(allowedTabs: string[]) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return

  // Só slugs que existem: a lista vem do navegador, e gravar lixo criaria
  // permissão para uma aba inventada — inofensivo hoje, e uma surpresa no dia
  // em que um slug novo coincidisse.
  const validas = allowedTabs.filter((t): t is TabSlug =>
    ALL_TABS.some((a) => a.slug === t)
  )

  await prisma.$transaction([
    prisma.tabPermission.deleteMany({ where: { tenantId, role: "TECHNICIAN" } }),
    ...(validas.length > 0
      ? [
          prisma.tabPermission.createMany({
            data: validas.map((tab) => ({ tenantId, role: "TECHNICIAN" as never, tab })),
          }),
        ]
      : []),
    // O sinal que separa "nunca mexeram" de "mexeram e não liberaram nada".
    // Sem ele, desmarcar TODAS as abas gravava zero linhas, que a leitura
    // entendia como "usar o padrão" e devolvia 3 abas. A tela prometia acesso
    // nenhum e o sistema concedia três.
    prisma.tenant.update({ where: { id: tenantId }, data: { tabsConfigured: true } }),
  ])

  revalidatePath("/settings")
  revalidatePath("/")
}

// ─── Permissão por ação ──────────────────────────────────────────────────────

export async function getAcoes() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)

  const [perms, tenant] = await Promise.all([
    prisma.actionPermission.findMany({
      where: { tenantId, role: "TECHNICIAN" },
      select: { action: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { actionsConfigured: true } }),
  ])

  const valendo = new Set(
    acoesValendo(tenant?.actionsConfigured ?? false, perms.map((p) => p.action).filter(ehAcao))
  )
  return ACOES.map((acao) => ({ acao, allowed: valendo.has(acao) }))
}

export async function saveAcoes(permitidas: string[]) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return

  const validas = permitidas.filter(ehAcao)

  await prisma.$transaction([
    prisma.actionPermission.deleteMany({ where: { tenantId, role: "TECHNICIAN" } }),
    ...(validas.length > 0
      ? [
          prisma.actionPermission.createMany({
            data: validas.map((action) => ({ tenantId, role: "TECHNICIAN" as never, action })),
          }),
        ]
      : []),
    prisma.tenant.update({ where: { id: tenantId }, data: { actionsConfigured: true } }),
  ])

  revalidatePath("/settings")
  revalidatePath("/")
}
