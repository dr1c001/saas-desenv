"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Check, Copy, Plus, Trash2 } from "lucide-react"
import { criarChave, revogarChave, type ChaveNaTela } from "@/actions/api-chaves"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function ApiKeysForm({ chaves }: { chaves: ChaveNaTela[] }) {
  const t = useTranslations("apiKeys")
  const tc = useTranslations("common")
  const [nome, setNome] = useState("")
  /** A chave recém-criada. Vive só aqui, na memória desta tela. */
  const [nova, setNova] = useState<string | null>(null)
  const [copiada, setCopiada] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function criar() {
    setErro(null)
    iniciar(async () => {
      const r = await criarChave(nome)
      if ("erro" in r) {
        setErro(t(`erro.${r.erro}` as "erro.semPermissao"))
        return
      }
      setNova(r.chave)
      setNome("")
      setCopiada(false)
    })
  }

  async function copiar() {
    if (!nova) return
    try {
      await navigator.clipboard.writeText(nova)
      setCopiada(true)
    } catch {
      // Área de transferência bloqueada (http sem TLS, permissão negada). O
      // texto está à mostra e dá para selecionar à mão — não vale travar a tela.
      setCopiada(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* A chave recém-criada. Não é um "sucesso" discreto: é a única
          oportunidade de copiar, e a tela precisa dizer isso com todas as
          letras antes que a pessoa navegue para longe. */}
      {nova && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm font-medium">{t("apareceUmaVez")}</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded border bg-background px-2 py-1.5 font-mono text-xs">
                {nova}
              </code>
              <Button size="sm" variant="outline" onClick={copiar} className="shrink-0">
                {copiada ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span className="ml-1">{copiada ? t("copiada") : t("copiar")}</span>
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNova(null)}>
              {t("jaGuardei")}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1 space-y-1">
          <label htmlFor="nome-da-chave" className="text-sm font-medium">
            {t("nomeLabel")}
          </label>
          <Input
            id="nome-da-chave"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t("nomePlaceholder")}
            maxLength={60}
          />
        </div>
        <Button onClick={criar} disabled={pendente || !nome.trim()}>
          <Plus className="size-4 mr-1" />
          {pendente ? tc("saving") : t("criarBotao")}
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Card>
        <CardContent className="p-0">
          {chaves.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("vazio")}</p>
          ) : (
            <ul className="divide-y">
              {chaves.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", c.revogadaEm && "line-through opacity-60")}>
                      {c.name}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{c.mascarada}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.ultimoUso
                        ? t("ultimoUso", { data: new Date(c.ultimoUso).toLocaleDateString() })
                        : t("nuncaUsada")}
                    </p>
                  </div>
                  {c.revogadaEm ? (
                    <Badge variant="secondary">{t("revogada")}</Badge>
                  ) : (
                    <Revogar id={c.id} rotulo={t("revogar")} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("rodape")}</p>
    </div>
  )
}

function Revogar({ id, rotulo }: { id: string; rotulo: string }) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pendente}
      onClick={() => iniciar(async () => void (await revogarChave(id)))}
    >
      <Trash2 className="size-3.5 mr-1" />
      {rotulo}
    </Button>
  )
}
