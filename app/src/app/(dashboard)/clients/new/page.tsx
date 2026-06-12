import { ClientForm } from "@/components/clients/client-form"

export default function NewClientPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Novo cliente</h1>
      <ClientForm />
    </div>
  )
}
