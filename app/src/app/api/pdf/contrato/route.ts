export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import { gerarContrato } from "@/lib/contrato"

// O contrato é anexado ao e-mail de confirmação de pagamento, mas e-mail se
// perde. Aqui o cliente baixa de novo quando quiser, pela tela de Assinatura.
export async function GET() {
  const { tenantId, role } = await getTenant()
  // Contrato traz CNPJ, endereço e valores da empresa — é documento do dono,
  // não de qualquer usuário da equipe dela.
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await requireActiveSubscription(tenantId)

  const contrato = await gerarContrato(tenantId)
  if (!contrato) {
    return NextResponse.json({ error: "Sem assinatura para gerar contrato." }, { status: 404 })
  }

  return new NextResponse(contrato.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${contrato.nomeArquivo}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
