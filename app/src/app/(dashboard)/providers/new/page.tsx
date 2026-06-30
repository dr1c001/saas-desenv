import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { ProviderForm } from "@/components/providers/provider-form"
import { createProvider } from "@/actions/providers"

export default function NewProviderPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/providers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ChevronLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-bold">Novo Prestador</h1>
      </div>
      <ProviderForm action={createProvider} />
    </div>
  )
}
