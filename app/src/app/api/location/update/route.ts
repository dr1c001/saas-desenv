import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { latitude, longitude, accuracy } = await req.json()
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 })
  }

  await prisma.userLocation.upsert({
    where: { userId: user.id },
    create: { userId: user.id, latitude, longitude, accuracy: accuracy ?? null },
    update: { latitude, longitude, accuracy: accuracy ?? null },
  })

  return NextResponse.json({ ok: true })
}
