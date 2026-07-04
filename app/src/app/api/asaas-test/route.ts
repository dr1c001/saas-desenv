import { NextResponse } from "next/server"
import { asaas } from "@/lib/asaas"

export async function GET() {
  try {
    // Simula: cliente novo, com CPF/CNPJ
    const customer = await asaas.createCustomer({
      name: "Teste Subscription Fix",
      email: "teste-subscription-fix@example.com",
      cpfCnpj: "24971563792",
    })

    // Simula: cliente ja existente sendo atualizado (caso real do usuario)
    await asaas.updateCustomer(customer.id, { cpfCnpj: "24971563792" })

    const sub = await asaas.createSubscription({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: 97,
      nextDueDate: new Date().toISOString().split("T")[0],
      cycle: "MONTHLY",
      description: "Teste fix billingType",
    })

    return NextResponse.json({ ok: true, customerId: customer.id, subscriptionId: sub.id })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
