import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { autenticarApi, erroApi } from "@/lib/api-auth"
import { ordemApi } from "@/lib/api-formato"
import { CAMPOS } from "../route"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await autenticarApi(req)
  if (!r.ok) return r.resposta

  const { id } = await params
  // findFirst com tenantId, e não findUnique por id: com findUnique, um id de
  // outra empresa devolveria a OS dela inteira. É o IDOR clássico, e já foi
  // achado de verdade neste projeto antes (revisão de 19/07/2026).
  const os = await prisma.serviceOrder.findFirst({
    where: { id, tenantId: r.auth.tenantId },
    select: CAMPOS,
  })

  // 404 e não 403: dizer "existe, mas não é sua" já conta que o id é válido em
  // algum lugar do sistema.
  if (!os) return erroApi(404, "not_found", "Service order not found.")

  return NextResponse.json(ordemApi(os))
}
