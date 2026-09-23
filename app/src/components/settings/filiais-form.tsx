"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Building2, Plus, Power } from "lucide-react"
import {
  alternarFilial,
  criarFilial,
  vincularPessoa,
  type FilialNaTela,
} from "@/actions/filiais"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Pessoa = { id: string; name: string; email: string; role: string; branchId: string | null }

export function FiliaisForm({ filiais, equipe }: { filiais: FilialNaTela[]; equipe: Pessoa[] }) {
  const t = useTranslations("filiais")
  const tc = useTranslations("common")
  const [nome, setNome] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const ativas = filiais.filter((f) => f.active)

  function criar() {
    setErro(null)
    iniciar(async () => {
      const r = await criarFilial(nome)
      if (r.erro) setErro(t(`erro.${r.erro}` as "erro.semPermissao"))
      else setNome("")
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 space-y-1">
            <label htmlFor="nome-filial" className="text-sm font-medium">
              {t("nomeLabel")}
            </label>
            <Input
              id="nome-filial"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t("nomePlaceholder")}
              maxLength={80}
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
            {filiais.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-muted-foreground">
                <Building2 className="size-7" />
                <p className="text-sm">{t("vazio")}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {filiais.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", !f.active && "line-through opacity-60")}>
                        {f.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("contagem", { pessoas: f.pessoas, clientes: f.clientes })}
                      </p>
                    </div>
                    {!f.active && <Badge variant="secondary">{t("inativa")}</Badge>}
                    <Alternar id={f.id} ativa={f.active} rotulo={f.active ? t("desativar") : t("reativar")} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Desativar em vez de apagar não é detalhe: apagar levaria junto o
            vínculo de todo cliente, OS e receita da unidade, e o faturamento
            por filial do ano inteiro sumiria por causa de um clique de
            organização. */}
        <p className="text-xs text-muted-foreground">{t("desativarNota")}</p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("equipe.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("equipe.subtitle")}</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {equipe.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Vincular pessoa={p} ativas={ativas} rotuloTodas={t("equipe.todas")} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">{t("equipe.nota")}</p>
      </section>
    </div>
  )
}

function Alternar({ id, ativa, rotulo }: { id: string; ativa: boolean; rotulo: string }) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pendente}
      onClick={() => iniciar(async () => void (await alternarFilial(id)))}
    >
      <Power className={cn("size-3.5 mr-1", ativa && "text-destructive")} />
      {rotulo}
    </Button>
  )
}

function Vincular({
  pessoa,
  ativas,
  rotuloTodas,
}: {
  pessoa: Pessoa
  ativas: FilialNaTela[]
  rotuloTodas: string
}) {
  const [pendente, iniciar] = useTransition()
  return (
    <select
      aria-label={pessoa.name}
      className="h-9 rounded-md border bg-background px-2 text-sm"
      value={pessoa.branchId ?? ""}
      disabled={pendente}
      onChange={(e) =>
        iniciar(async () => void (await vincularPessoa(pessoa.id, e.target.value || null)))
      }
    >
      {/* "" = sem filial = vê tudo. Não é falta de configuração: é como a
          matriz e o dono trabalham. */}
      <option value="">{rotuloTodas}</option>
      {ativas.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  )
}
