import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function FinancePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <Button>
          <Plus className="size-4 mr-2" />
          Nova despesa
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas a Receber</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Nenhum recebimento pendente.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Nenhuma despesa pendente.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
