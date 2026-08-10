"use client"

import { useActionState, useState, useTransition } from "react"
import { UserPlus, Power, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  adicionarAdmin,
  alterarPapelAdmin,
  desativarAdmin,
  type AdminFormState,
} from "@/actions/admin"

type Papel = "DONO" | "FINANCEIRO" | "COMERCIAL" | "LOGISTICO" | "TI"

export type MembroEquipe = {
  id: string
  email: string
  name: string
  role: Papel
  active: boolean
  createdAt: Date
}

// Rótulos e a descrição do que cada área pode. Fica visível na tela de
// propósito: quem convida precisa saber o que está concedendo, e quem foi
// convidado precisa saber por que um botão não aparece pra ele.
const AREAS: { valor: Exclude<Papel, "DONO">; nome: string; pode: string }[] = [
  { valor: "FINANCEIRO", nome: "Financeiro", pode: "Vê faturamento e relatórios. Libera, cancela e troca plano. Não entra na conta de cliente." },
  { valor: "COMERCIAL", nome: "Comercial", pode: "Vê crescimento, faturamento e relatórios. Troca plano. Não mexe em acesso." },
  { valor: "LOGISTICO", nome: "Logística", pode: "Entra na conta do cliente para dar suporte. Não vê faturamento." },
  { valor: "TI", nome: "TI", pode: "Entra na conta e destrava cliente preso por falha técnica. Não vê faturamento." },
]

const NOME_AREA: Record<Papel, string> = {
  DONO: "Dono",
  FINANCEIRO: "Financeiro",
  COMERCIAL: "Comercial",
  LOGISTICO: "Logística",
  TI: "TI",
}

export function AdminTeam({ membros }: { membros: MembroEquipe[] }) {
  const [estado, formAction, enviando] = useActionState<AdminFormState, FormData>(adicionarAdmin, {})
  const [area, setArea] = useState<Exclude<Papel, "DONO">>("FINANCEIRO")
  const [pendente, startTransition] = useTransition()

  const descricao = AREAS.find((a) => a.valor === area)?.pode

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="size-4" />
          Equipe de administração
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              name="name" required placeholder="Nome"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              name="email" type="email" required placeholder="e-mail"
              className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2"
            />
            <select
              name="role" value={area}
              onChange={(e) => setArea(e.target.value as Exclude<Papel, "DONO">)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {AREAS.map((a) => (
                <option key={a.valor} value={a.valor}>{a.nome}</option>
              ))}
            </select>
          </div>

          {/* O que a área escolhida libera, antes de convidar — não depois. */}
          <p className="text-xs text-muted-foreground">{descricao}</p>

          {estado.message && (
            <p className={`text-sm ${estado.success ? "text-green-600" : "text-destructive"}`}>
              {estado.message}
            </p>
          )}

          <Button type="submit" size="sm" disabled={enviando}>
            {enviando && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            Convidar
          </Button>
        </form>

        {membros.length > 0 && (
          <div className="border-t pt-4 space-y-2">
            {membros.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className={m.active ? "" : "opacity-50"}>
                  <p className="font-medium">
                    {m.name}{" "}
                    <span className="font-normal text-muted-foreground">{m.email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    desde {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                    {!m.active && " · desativado"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    defaultValue={m.role}
                    disabled={pendente || !m.active}
                    onChange={(e) =>
                      startTransition(() => alterarPapelAdmin(m.id, e.target.value as Papel))
                    }
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    {AREAS.map((a) => (
                      <option key={a.valor} value={a.valor}>{a.nome}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant={m.active ? "outline" : "default"}
                    disabled={pendente}
                    onClick={() => startTransition(() => desativarAdmin(m.id))}
                  >
                    <Power className="size-3.5 mr-1" />
                    {m.active ? "Desativar" : "Reativar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t pt-3">
          Toda ação da equipe fica registrada com nome, data e hora. Desativar
          alguém corta o acesso no próximo carregamento de tela — o histórico
          dele continua no registro de auditoria.
        </p>
      </CardContent>
    </Card>
  )
}

export { NOME_AREA }
