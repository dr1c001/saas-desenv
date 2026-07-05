import { NextResponse } from "next/server"
import { asaas } from "@/lib/asaas"

export async function GET() {
  try {
    const customer = await asaas.createCustomer({
      name: "Teste Checkout Redirect",
      email: "teste-checkout-redirect@example.com",
      cpfCnpj: "24971563792",
    })

    const sub = await asaas.createSubscription({
      customer: customer.id,
      billingType: "UNDEFINED",
      value: 97,
      nextDueDate: new Date().toISOString().split("T")[0],
      cycle: "MONTHLY",
      description: "Teste checkout redirect",
    })

    const invoiceUrl = await asaas.getFirstInvoiceUrl(sub.id)

    return NextResponse.json({ ok: true, customerId: customer.id, subscriptionId: sub.id, invoiceUrl })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
