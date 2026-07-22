"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription, ALL_TABS, DEFAULT_TECHNICIAN_TABS, type TabSlug } from "@/lib/auth"

export async function getPermissions() {
  const { tenantId } = await getTenant()
  await requireActiveSubscription(tenantId)
  const perms = await prisma.tabPermission.findMany({
    where: { tenantId, role: "TECHNICIAN" },
    select: { tab: true },
  })

  if (perms.length === 0) {
    // Return defaults
    return ALL_TABS.map((t) => ({
      tab: t.slug,
      label: t.label,
      allowed: DEFAULT_TECHNICIAN_TABS.includes(t.slug as TabSlug),
    }))
  }

  const allowed = new Set(perms.map((p) => p.tab))
  return ALL_TABS.map((t) => ({
    tab: t.slug,
    label: t.label,
    allowed: allowed.has(t.slug),
  }))
}

export async function savePermissions(allowedTabs: string[]) {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return

  // Delete all TECHNICIAN permissions for this tenant and recreate
  await prisma.tabPermission.deleteMany({ where: { tenantId, role: "TECHNICIAN" } })

  if (allowedTabs.length > 0) {
    await prisma.tabPermission.createMany({
      data: allowedTabs.map((tab) => ({ tenantId, role: "TECHNICIAN" as never, tab })),
    })
  }

  revalidatePath("/settings")
  revalidatePath("/")
}
