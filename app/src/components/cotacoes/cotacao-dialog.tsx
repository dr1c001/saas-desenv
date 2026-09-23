"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { criarCotacao, type EstadoCotacao } from "@/actions/cotacao"

type Peca = { id: string; name: string; unit: string }
type Forn = { id: string; name: string }

// Criar uma cotação: o que se está cotando, e a quem perguntar.
//
// As duas listas são escolhas MÚLTIPLAS de propósito — cotação com um
// fornecedor só não compara nada, e é o erro mais fácil de cometer numa tela
// que aceita um por vez.

export function CotacaoDialog({ pecas, fornecedores }: { pecas: Peca[]; fornecedores: Forn[] }) {
  const t = useTranslations("cotacoes")
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState<{ partId: string; quantidade: string }[]>([
    { partId: "", quantidade: "1" },
  ])
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [estado, formAction, salvando] = useActionState<EstadoCotacao, FormData>(criarCotacao, {})

  if (estado.ok && estado.id && aberto) {
    setTimeout(() => {
      setAberto(false)
      router.push(`/cotacoes/${estado.id}`)
    }, 0)
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4 mr-1.5" />
            {t("nova")}
          </Button>
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("nova")}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("tituloDaCotacao")}</Label>
            <Input id="title" name="title" required maxLength={160} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deadline">{t("prazo")}</Label>
              <Input id="deadline" name="deadline" type="date" />
            </div>
          </div>

          {/* ─── Itens ─────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>{t("itens")}</Label>
            {itens.map((linha, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  name="partId"
                  required
                  value={linha.partId}
                  onChange={(e) => {
                    const novo = [...itens]
                    novo[i] = { ...novo[i], partId: e.target.value }
                    setItens(novo)
                  }}
                  className="h-9 flex-1 rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">{t("peca")}</option>
                  {pecas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
                <Input
                  name="quantidade"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={linha.quantidade}
                  onChange={(e) => {
                    const novo = [...itens]
                    novo[i] = { ...novo[i], quantidade: e.target.value }
                    setItens(novo)
                  }}
                  className="w-28"
                />
                {itens.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setItens(itens.filter((_, x) => x !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setItens([...itens, { partId: "", quantidade: "1" }])}
            >
              <Plus className="size-3.5 mr-1.5" />
              {t("adicionar")}
            </Button>
          </div>

          {/* ─── Fornecedores ──────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>{t("fornecedores")}</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {fornecedores.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="supplierId"
                    value={f.id}
                    checked={escolhidos.includes(f.id)}
                    onChange={(e) =>
                      setEscolhidos(
                        e.target.checked
                          ? [...escolhidos, f.id]
                          : escolhidos.filter((x) => x !== f.id)
                      )
                    }
                    className="size-4 rounded border"
                  />
                  {f.name}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("observacoes")}</Label>
            <Input id="notes" name="notes" maxLength={2000} />
          </div>

          {estado.erro && (
            <p className="text-sm text-destructive">
              {t(`erros.${estado.erro}` as "erros.semItens")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              {t("cancelar")}
            </Button>
            <Button type="submit" disabled={salvando || escolhidos.length === 0}>
              {salvando && <Loader2 className="size-4 mr-2 animate-spin" />}
              {t("salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
