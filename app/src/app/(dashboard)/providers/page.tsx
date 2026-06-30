import Link from "next/link"
import { Suspense } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, HardHat } from "lucide-react"
import { getProviders } from "@/actions/providers"
import { SearchBar } from "@/components/shared/search-bar"
import { DeleteButton } from "@/components/shared/delete-button"
import { deleteProvider } from "@/actions/providers"

type SearchParams = Promise<{ q?: string }>

export default async function ProvidersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams
  const providers = await getProviders(q)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prestadores de Serviço</h1>
        <Link href="/providers/new" className={buttonVariants()}>
          <Plus className="size-4 mr-2" />
          Novo prestador
        </Link>
      </div>

      <Suspense>
        <SearchBar placeholder="Buscar por nome ou especialidade..." />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{providers.length} prestador{providers.length !== 1 ? "es" : ""}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {providers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <HardHat className="size-8" />
              <p className="text-sm">{q ? "Nenhum prestador encontrado." : "Nenhum prestador cadastrado ainda."}</p>
              {!q && (
                <Link href="/providers/new" className={buttonVariants({ variant: "outline" })}>
                  Cadastrar primeiro prestador
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.specialty ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.document ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/providers/${p.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Editar
                        </Link>
                        <DeleteButton action={deleteProvider.bind(null, p.id)} label="Excluir prestador" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
