export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { requireActiveSubscription } from "@/lib/auth"
import { arquivoDaNota } from "@/lib/arquivo-da-nota"

// Baixar a nota fiscal emitida — o PDF ou o XML.
//
// ─── Por que uma rota nossa, e não o link do emissor ────────────────────────
//
// O link do emissor continua existindo e continua na tela. Mas ele é do
// servidor de um fornecedor: expira, muda, e some no dia em que a empresa
// trocar de emissor. Quando o cliente ligar pedindo a nota de novo — que é o
// caso que o dono descreveu —, quem tem de responder é o sistema dela.
//
// Esta rota serve o arquivo GUARDADO, e arquiva na primeira vez quando a nota é
// antiga. Ver lib/arquivo-da-nota.ts.

export async function GET(
  request: NextRequest,
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
  // Rota despachável direto por HTTP, independente da tela que redireciona
  // antes.
  await requireActiveSubscription(dbUser.tenantId)

  // XML só quando pedido de propósito: o que a pessoa quer ver é o PDF, e o
  // XML é o que ela manda para a contabilidade.
  const tipo = request.nextUrl.searchParams.get("tipo") === "xml" ? "xml" : "pdf"

  const { id } = await params
  const arquivo = await arquivoDaNota(dbUser.tenantId, id, tipo)
  if (!arquivo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return new NextResponse(new Uint8Array(arquivo.conteudo), {
    headers: {
      "Content-Type": tipo === "pdf" ? "application/pdf" : "application/xml",
      // PDF abre no navegador; XML baixa — ninguém lê XML na tela, ele vai
      // para a contabilidade.
      "Content-Disposition": `${tipo === "pdf" ? "inline" : "attachment"}; filename="${arquivo.nomeArquivo}"`,
    },
  })
}
