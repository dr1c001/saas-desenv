"use client"

import { useMemo, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { CalendarClock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { parcelarRecebimento } from "@/actions/parcelamento"
import { lerDinheiro, paraCampo } from "@/lib/dinheiro"
import {
  faltaParaFechar,
  montarPlano,
  PRAZOS_USUAIS,
  problemaNasParcelas,
  problemaNoPlano,
} from "@/lib/plano-de-pagamento"
import { formatCurrency } from "@/lib/utils"

// "O cliente paga R$ 500 à vista e pede prazo para o resto."
//
// ─── Por que a prévia aparece antes de confirmar ─────────────────────────────
//
// O plano vira boleto na mão de um cliente. A pessoa precisa ver as datas e os
// valores exatos ANTES de gravar — inclusive o centavo que sobra, que vai para
// a primeira parcela e sempre gera a pergunta "por que esta é R$ 0,01 maior?".
//
// ─── Por que as linhas são EDITÁVEIS ────────────────────────────────────────
//
// "A empresa combina qualquer data para o pagamento." Entrada mais parcelas
// iguais espaçadas por um prazo resolve 7, 15, 30, 60 e 90 — e não resolve o
// cliente que paga R$ 800 no dia 15 e R$ 700 no dia 3 do mês seguinte.
//
// Então o gerador vira ATALHO: ele monta as linhas em dois cliques, e a pessoa
// ajusta data e valor onde o combinado foi outro. O total tem de fechar com o
// serviço, e a tela diz quanto falta enquanto não fecha.

export function ParcelarDialog({
  orderId,
  total,
  execucao,
  jaTemRecebimento,
}: {
  orderId: string
  total: number
  /** A data da execução: é dela que os prazos são contados. */
  execucao: string
  /** Alguma parcela já foi recebida? Aí o plano não pode ser refeito. */
  jaTemRecebimento: boolean
}) {
  const t = useTranslations("parcelamento")
  const [aberto, setAberto] = useState(false)
  const [entrada, setEntrada] = useState("")
  const [parcelas, setParcelas] = useState("1")
  const [prazo, setPrazo] = useState("7")
  const [recebida, setRecebida] = useState(true)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  type Linha = { valor: string; vencimento: string; recebida: boolean }
  const [linhas, setLinhas] = useState<Linha[]>([])

  const paraCampoData = (d: Date) => d.toISOString().slice(0, 10)

  /** Gera as linhas a partir do atalho. A pessoa ajusta depois. */
  function gerar() {
    const e = lerDinheiro(entrada) ?? 0
    const n = Number(parcelas)
    const d = Number(prazo)
    if (problemaNoPlano({ total, entrada: e, parcelas: n, prazoDias: d })) return
    setLinhas(
      montarPlano({ total, entrada: e, parcelas: n, prazoDias: d }, new Date(execucao)).map((p) => ({
        valor: paraCampo(p.valor),
        vencimento: paraCampoData(p.vencimento),
        recebida: p.entrada && recebida,
      }))
    )
  }

  const comoLista = useMemo(
    () =>
      linhas.map((l) => ({
        valor: lerDinheiro(l.valor) ?? 0,
        vencimento: new Date(`${l.vencimento}T12:00:00`),
        recebida: l.recebida,
      })),
    [linhas]
  )

  // A MESMA validação que o servidor roda. Duas regras diferentes fariam a tela
  // aceitar um plano que o servidor recusa depois — ou pior, o contrário.
  const problema = useMemo(
    () => (linhas.length === 0 ? null : problemaNasParcelas(comoLista, total, new Date(execucao))),
    [comoLista, total, execucao, linhas.length]
  )
  const falta = faltaParaFechar(comoLista, total)

  const data = (d: Date) =>
    d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" disabled={jaTemRecebimento}>
            <CalendarClock className="size-4 mr-2" />
            {t("botao")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("titulo")}</DialogTitle>
          <DialogDescription>
            {t("subtitulo", { total: formatCurrency(total), data: data(new Date(execucao)) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entrada">{t("entrada")}</Label>
              <Input
                id="entrada"
                inputMode="decimal"
                placeholder="0,00"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onBlur={() => setEntrada(paraCampo(lerDinheiro(entrada)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parcelas">{t("parcelas")}</Label>
              <Input
                id="parcelas"
                type="number"
                min={1}
                max={24}
                value={parcelas}
                onChange={(e) => setParcelas(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prazo">{t("prazo")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {/* Os três prazos usuais como atalho, e o campo aberto ao lado:
                  7, 15 e 30 cobrem quase tudo, mas cliente que pede 45 existe. */}
              {PRAZOS_USUAIS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={prazo === String(d) ? "default" : "outline"}
                  onClick={() => setPrazo(String(d))}
                >
                  {t("dias", { n: d })}
                </Button>
              ))}
              <Input
                id="prazo"
                type="number"
                min={1}
                max={365}
                className="w-24"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
              />
            </div>
          </div>

          {Number(lerDinheiro(entrada) ?? 0) > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recebida}
                onChange={(e) => setRecebida(e.target.checked)}
              />
              {t("entradaRecebida")}
            </label>
          )}

          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <Button type="button" size="sm" variant="secondary" onClick={gerar}>
              {t("gerar")}
            </Button>
            {linhas.length > 0 && (
              <span className={`text-xs ${falta === 0 ? "text-muted-foreground" : "text-amber-600"}`}>
                {falta === 0
                  ? t("fecha", { total: formatCurrency(total) })
                  : t("falta", { valor: formatCurrency(Math.abs(falta)), sinal: falta > 0 ? "+" : "-" })}
              </span>
            )}
          </div>

          {/* As linhas COMBINADAS. Editáveis: o gerador acima resolve o caso
              comum, e aqui a pessoa ajusta a data e o valor onde o cliente
              combinou outra coisa. */}
          {linhas.length > 0 && (
            <ul className="space-y-2">
              {linhas.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="w-10 text-xs text-muted-foreground">{i + 1}/{linhas.length}</span>
                  <Input
                    type="date"
                    className="w-40"
                    value={l.vencimento}
                    onChange={(e) =>
                      setLinhas((ls) => ls.map((x, k) => (k === i ? { ...x, vencimento: e.target.value } : x)))
                    }
                  />
                  <Input
                    inputMode="decimal"
                    className="w-28"
                    value={l.valor}
                    onChange={(e) =>
                      setLinhas((ls) => ls.map((x, k) => (k === i ? { ...x, valor: e.target.value } : x)))
                    }
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={l.recebida}
                      onChange={(e) =>
                        setLinhas((ls) => ls.map((x, k) => (k === i ? { ...x, recebida: e.target.checked } : x)))
                      }
                    />
                    {t("jaRecebida")}
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={linhas.length === 1}
                    onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}
                  >
                    {t("remover")}
                  </Button>
                </li>
              ))}
              <li>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setLinhas((ls) => [
                      ...ls,
                      { valor: "", vencimento: ls[ls.length - 1]?.vencimento ?? "", recebida: false },
                    ])
                  }
                >
                  {t("adicionar")}
                </Button>
              </li>
            </ul>
          )}

          {problema && (
            <p className="text-sm text-destructive">
              {t(`erros.${problema}` as "erros.somaNaoBate")}
            </p>
          )}

          {erro && <p className="text-sm text-destructive">{t(`erros.${erro}` as "erros.semPermissao")}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={pendente || !!problema || linhas.length === 0}
            onClick={() =>
              iniciar(async () => {
                setErro(null)
                const r = await parcelarRecebimento(
                  orderId,
                  comoLista.map((l) => ({
                    valor: l.valor,
                    vencimento: l.vencimento.toISOString(),
                    recebida: l.recebida,
                  }))
                )
                if (r?.erro) setErro(r.erro)
                else setAberto(false)
              })
            }
          >
            {pendente && <Loader2 className="size-4 mr-2 animate-spin" />}
            {t("confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
