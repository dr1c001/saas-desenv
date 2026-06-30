import { notFound } from "next/navigation"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { ProviderForm } from "@/components/providers/provider-form"
import { getProvider, updateProvider } from "@/actions/providers"

export default async function EditProviderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const provider = await getProvider(id)
  if (!provider) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/providers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ChevronLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-bold">Editar Prestador</h1>
      </div>
      <ProviderForm provider={provider} action={updateProvider.bind(null, id)} />
    </div>
  )
}
