export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { requireActiveSubscription } from "@/lib/auth"
import { gerarFatura } from "@/lib/fatura"

// A fatura da OS, para a empresa baixar.
//
// ─── Por que esta rota existe ────────────────────────────────────────────────
//
// A fatura foi construída para ir ANEXADA na cobrança automática. Se ficasse só
// nisso, o documento existiria apenas dentro de um e-mail que ninguém na
// empresa consegue abrir — e quando o cliente ligasse dizendo "não recebi",
// não haveria como reenviar nem conferir o que foi mandado.
//
// É o mesmo par de consumidores do contrato (lib/contrato.ts): o anexo e o
// botão de baixar. A montagem mora no lib; aqui só a autorização e a entrega.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true },
  })
  if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Bloqueio de assinatura é de página; esta rota é despachável direto via
  // HTTP, independente da tela que redireciona antes.
  await requireActiveSubscription(dbUser.tenantId)

  const { id } = await params
  // `gerarFatura` filtra pelo tenant: uma OS de outra empresa não vira PDF
  // aqui, com os dados do cliente dela dentro.
  const fatura = await gerarFatura(dbUser.tenantId, id)
  // `null` também quando não há parcela em aberto — não existe fatura de conta
  // já quitada, e devolver um PDF vazio seria pior que devolver nada.
  if (!fatura) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return new NextResponse(new Uint8Array(fatura.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fatura.nomeArquivo}"`,
    },
  })
}
