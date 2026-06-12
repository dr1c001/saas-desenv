import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

export async function getSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return user
}

export async function getTenant() {
  const user = await getSession()

  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true },
  })

  // Fallback: create tenant+user if webhook missed (e.g. local dev)
  if (!dbUser) {
    const name = user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Usuário"
    const companyName = user.user_metadata?.company_name ?? `Empresa de ${name}`

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: companyName } })
      const created = await tx.user.create({
        data: { id: user.id, name, email: user.email!, role: "OWNER", tenantId: tenant.id },
        select: { tenantId: true },
      })
      return created
    })
    dbUser = result
  }

  return { userId: user.id, tenantId: dbUser.tenantId }
}
