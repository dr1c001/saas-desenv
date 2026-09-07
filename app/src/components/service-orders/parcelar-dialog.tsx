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
import { montarPlano, problemaNoPlano, PRAZOS_USUAIS, rotuloDaParcela } from "@/lib/plano-de-pagamento"
import { formatCurrency } from "@/lib/utils"

// "O cliente paga R$ 500 à vista e pede prazo para o resto."
//
// ─── Por que a prévia aparece antes de confirmar ─────────────────────────────
//
// O plano vira boleto na mão de um cliente. A pessoa precisa ver as datas e os
// valores exatos ANTES de gravar — inclusive o centavo que sobra, que vai para
// a primeira parcela e sempre gera a pergunta "por que esta é R$ 0,01 maior?".
//
// A prévia usa a MESMA função que o servidor usa para gravar. Duas contas
// diferentes fariam a tela prometer um valor e o boleto sair com outro.

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

  const dados = useMemo(() => {
    const e = lerDinheiro(entrada) ?? 0
    const n = Number(parcelas)
    const d = Number(prazo)
    const problema = problemaNoPlano({ total, entrada: e, parcelas: n, prazoDias: d })
    if (problema) return { problema, plano: [] as ReturnType<typeof montarPlano> }
    return {
      problema: null,
      plano: montarPlano({ total, entrada: e, parcelas: n, prazoDias: d }, new Date(execucao)),
    }
  }, [entrada, parcelas, prazo, total, execucao])

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

          {/* A prévia. É ela que a pessoa confere antes de o boleto existir. */}
          {dados.problema ? (
            <p className="text-sm text-destructive">
              {t(`erros.${dados.problema}` as "erros.totalInvalido")}
            </p>
          ) : (
            <ul className="space-y-1 rounded-lg border p-3 text-sm">
              {dados.plano.map((p) => (
                <li key={p.numero} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {p.entrada ? t("rotuloEntrada") : t("rotuloParcela", {
                      r: rotuloDaParcela(p, Number(parcelas)),
                    })}
                    {" · "}
                    {data(p.vencimento)}
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(p.valor)}</span>
                </li>
              ))}
            </ul>
          )}

          {erro && <p className="text-sm text-destructive">{t(`erros.${erro}` as "erros.semPermissao")}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={pendente || !!dados.problema}
            onClick={() =>
              iniciar(async () => {
                setErro(null)
                const r = await parcelarRecebimento(
                  orderId,
                  lerDinheiro(entrada) ?? 0,
                  Number(parcelas),
                  Number(prazo),
                  recebida
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
