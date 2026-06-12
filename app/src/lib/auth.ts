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
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true },
  })
  if (!dbUser) redirect("/login")
  return { userId: user.id, tenantId: dbUser.tenantId }
}
