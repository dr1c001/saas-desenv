import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTenant } from "@/lib/auth"
import { getFornecedor } from "@/actions/fornecedores"
import { FornecedorForm } from "@/components/fornecedores/fornecedor-form"

export default async function EditarFornecedorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/fornecedores")

  const { id } = await params
  const f = await getFornecedor(id)
  if (!f) notFound()

  const t = await getTranslations("fornecedores")

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("editar")}</h1>
        <p className="text-sm text-muted-foreground">{f.name}</p>
      </div>
      <FornecedorForm
        fornecedor={{
          id: f.id,
          name: f.name,
          legalName: f.legalName,
          document: f.document,
          stateRegistration: f.stateRegistration,
          cityRegistration: f.cityRegistration,
          category: f.category,
          email: f.email,
          phone: f.phone,
          contactName: f.contactName,
          contactPhone: f.contactPhone,
          website: f.website,
          zipCode: f.zipCode,
          street: f.street,
          number: f.number,
          complement: f.complement,
          district: f.district,
          city: f.city,
          state: f.state,
          paymentTerms: f.paymentTerms,
          leadTimeDays: f.leadTimeDays,
          pixKey: f.pixKey,
          bankName: f.bankName,
          bankAgency: f.bankAgency,
          bankAccount: f.bankAccount,
          notes: f.notes,
        }}
      />
    </div>
  )
}
