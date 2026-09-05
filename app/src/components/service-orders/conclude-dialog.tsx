"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Trash2, CheckCircle, Package } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { completeServiceOrder } from "@/actions/service-orders"
import { enfileirar, semRede } from "@/lib/usar-fila-offline"

/**
 * `partId` liga o item a uma PEÇA do estoque.
 *
 * ─── O que estava construído e inalcançável ──────────────────────────────────
 *
 * O caminho inteiro já existia: `completeServiceOrder` aceita `partId`, grava em
 * `ServiceItem`, e `baixarPecasDaOs` dá a baixa no fecho — tirando da van de
 * quem executou, não do almoxarifado. Só que NENHUMA tela oferecia escolher a
 * peça, então o campo era sempre nulo e a baixa nunca disparava.
 *
 * Nulo continua sendo o caminho normal: mão de obra, taxa, deslocamento e peça
 * comprada avulsa não saem do estoque de ninguém.
 */
type Item = { description: string; quantity: number; unitPrice: number; partId?: string | null }

/** Uma peça do catálogo, para escolher na hora de fechar. */
export type PecaDisponivel = {
  id: string
  name: string
  sku: string | null
  unit: string
  /** Preço sugerido ao cliente. Continua editável na linha. */
  salePrice: number | null
  /** Saldo de hoje. Mostrado para o técnico não prometer o que não tem. */
  stock: number
}

type Props = {
  orderId: string
  orderTitle: string
  currentStatus: string
  initialConclusionNote?: string | null
  initialItems?: Item[]
  /** Vazio quando a empresa não tem o recurso de estoque. */
  pecas?: PecaDisponivel[]
  /** A porcentagem de comissão já gravada nesta OS. Nulo = não comissiona. */
  initialCommissionPct?: number | null
  /** Há responsável? Sem alguém a quem pagar, comissão não faz sentido. */
  temResponsavel?: boolean
}

export function ConcluirDialog({
  orderId,
  orderTitle,
  currentStatus,
  initialConclusionNote,
  initialItems,
  pecas = [],
  initialCommissionPct = null,
  temResponsavel = false,
}: Props) {
  const t = useTranslations("serviceOrdersComponents")
  const tc = useTranslations("common")
  const isConcluded = currentStatus === "DONE" || currentStatus === "INVOICED" || currentStatus === "CANCELLED"
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [conclusionNote, setConclusionNote] = useState(initialConclusionNote ?? "")
  const [items, setItems] = useState<Item[]>(
    initialItems && initialItems.length > 0 ? initialItems : [{ description: "", quantity: 1, unitPrice: 0 }]
  )
  const [error, setError] = useState<string | null>(null)
  const [commissionPct, setCommissionPct] = useState(
    initialCommissionPct === null ? "" : String(initialCommissionPct)
  )

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

  // A comissão, calculada ao vivo enquanto a pessoa digita.
  //
  // Aparece ANTES de concluir de propósito: quem lança a base é o próprio
  // técnico (ele digita quantidade e preço item a item), e ver
  // "R$ 1.200,00 → 10% → R$ 120,00" na mesma tela é a conferência que evita a
  // descoberta desagradável no dia do pagamento.
  //
  // O imposto NÃO entra nesta prévia: aqui ainda não há nota, e mostrar um
  // desconto que talvez nunca aconteça seria pior do que não mostrar nada.
  const pctNumero = commissionPct.trim() === "" ? null : Number(commissionPct.replace(",", "."))
  const comissao =
    pctNumero !== null && Number.isFinite(pctNumero) && pctNumero > 0 && pctNumero <= 100 && total > 0
      ? Math.round((Math.round(total * 100) * pctNumero) / 100) / 100
      : null

  function addItem() { setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]) }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof Item, val: string | number) {
    setItems((p) => p.map((item, idx) =>
      idx === i ? { ...item, [field]: field === "description" ? val : Number(val) } : item
    ))
  }

  /**
   * Acrescenta uma peça do estoque.
   *
   * Nome e preço vêm do catálogo, mas ficam EDITÁVEIS: o técnico às vezes cobra
   * diferente do preço de tabela, e travar aqui faria ele desistir da peça e
   * digitar à mão — perdendo justamente o vínculo que baixa o estoque.
   *
   * A linha em branco que o diálogo abre por padrão é aproveitada em vez de
   * empurrada para baixo: fechar uma OS com "1 peça e 1 linha vazia" é o tipo
   * de coisa que faz a pessoa achar que errou.
   */
  function addPeca(peca: PecaDisponivel) {
    const nova: Item = {
      description: peca.sku ? `${peca.name} (${peca.sku})` : peca.name,
      quantity: 1,
      unitPrice: peca.salePrice ?? 0,
      partId: peca.id,
    }
    setItems((p) => {
      const vazia = p.findIndex((i) => !i.description.trim() && !i.partId)
      if (vazia === -1) return [...p, nova]
      return p.map((i, idx) => (idx === vazia ? nova : i))
    })
  }

  function handleConclude(invoice: boolean) {
    setError(null)
    startTransition(async () => {
      // Sem rede, guarda pra enviar depois em vez de falhar. O tecnico esta
      // no subsolo e o servico ACONTECEU — recusar aqui faria o trabalho
      // virar bilhete no bolso, que na pratica vira nunca.
      //
      // Com rede, nada muda: vai direto, como sempre foi, e o erro real chega
      // ao tecnico. Trocar um caminho testado por um caminho novo em 99% dos
      // casos nao traria ganho nenhum.
      if (semRede()) {
        await enfileirar("CONCLUIR_OS", orderId, {
          conclusionNote,
          items,
          invoiceImmediately: invoice,
        })
        setOpen(false)
        return
      }

      try {
        await completeServiceOrder(
          orderId,
          conclusionNote,
          items,
          invoice,
          // String vazia vira null: apagar o campo é como se desliga a comissão
          // desta OS, e o reconciliador apaga a conta a pagar junto.
          commissionPct.trim() === "" ? null : Number(commissionPct.replace(",", "."))
        )
        setOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : t("concludeDialog.concludeError"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50" />
        }
      >
        <CheckCircle className="size-3.5" />
        {isConcluded ? t("concludeDialog.editTrigger") : t("concludeDialog.trigger")}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("concludeDialog.title")}</DialogTitle>
          <DialogDescription>{orderTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Descrição do serviço realizado */}
          <div className="space-y-1.5">
            <Label htmlFor="conclusionNote">{t("concludeDialog.notesLabel")}</Label>
            <Textarea
              id="conclusionNote"
              rows={3}
              placeholder={t("concludeDialog.notesPlaceholder")}
              value={conclusionNote}
              onChange={(e) => setConclusionNote(e.target.value)}
            />
          </div>

          {/* Itens cobrados */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t("concludeDialog.itemsLabel")}</Label>
              <div className="flex items-center gap-2">
                {/* Só aparece para quem controla estoque. Sem o recurso, a
                    lista chega vazia e o botão some — em vez de oferecer algo
                    que abre um menu sem nada dentro. */}
                {pecas.length > 0 && (
                  <select
                    aria-label={t("concludeDialog.pecaDoEstoque")}
                    className="h-8 max-w-52 rounded-md border bg-transparent px-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const p = pecas.find((x) => x.id === e.target.value)
                      if (p) addPeca(p)
                      // Volta ao vazio: o select é um GATILHO, não um campo com
                      // valor. Deixá-lo marcado faria parecer que a peça está
                      // selecionada, quando ela já virou uma linha da lista.
                      e.target.value = ""
                    }}
                  >
                    <option value="">{t("concludeDialog.pecaDoEstoque")}</option>
                    {pecas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.stock} {p.unit}
                      </option>
                    ))}
                  </select>
                )}
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="size-3.5 mr-1" />
                  {t("items.addButton")}
                </Button>
              </div>
            </div>

            {items.map((item, i) => (
              <div key={i} className="grid gap-2 grid-cols-[1fr_70px_110px_28px] items-end">
                <div>
                  {i === 0 && <p className="text-xs text-muted-foreground mb-1">{t("items.descriptionLabel")}</p>}
                  <Input
                    placeholder={t("concludeDialog.itemDescriptionPlaceholder")}
                    value={item.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)}
                  />
                  {/* A linha que SAI DO ESTOQUE precisa dizer isso.
                      Fechar a OS baixa a peça de verdade, e uma linha que
                      parece igual às outras faz o técnico descobrir o efeito
                      só quando o saldo mudar. */}
                  {item.partId && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Package className="size-3" />
                      {t("concludeDialog.saiDoEstoque")}
                      {(() => {
                        const p = pecas.find((x) => x.id === item.partId)
                        if (!p) return null
                        // Saldo insuficiente NÃO impede concluir: o serviço
                        // aconteceu no mundo real, e recusar aqui faria o
                        // técnico digitar à mão e perder a baixa. Avisa, e o
                        // saldo fica negativo — que é a pendência honesta.
                        const falta = item.quantity > p.stock
                        return (
                          <span className={falta ? "text-amber-600 dark:text-amber-400" : ""}>
                            · {t("concludeDialog.saldo", { saldo: p.stock, unidade: p.unit })}
                          </span>
                        )
                      })()}
                    </p>
                  )}
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-muted-foreground mb-1">{t("items.quantityLabel")}</p>}
                  <Input
                    type="number" min="0.001" step="0.001"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", e.target.value)}
                  />
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-muted-foreground mb-1">{t("concludeDialog.itemUnitPriceLabel")}</p>}
                  <Input
                    type="number" min="0" step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                  />
                </div>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="text-destructive hover:text-destructive self-end"
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}

            <div className="flex justify-end pt-2 border-t">
              <p className="font-semibold text-sm">{t("items.totalLabel")} <span className="text-base">{formatCurrency(total)}</span></p>
            </div>
          </div>

          {/* A comissão desta OS.
              Só aparece quando há responsável: sem alguém a quem pagar, o
              campo seria uma pergunta sem resposta possível. */}
          {temResponsavel && (
            <div className="space-y-1.5 rounded-lg border p-3">
              <Label htmlFor="commissionPct" className="text-xs">
                {t("comissao.rotulo")}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commissionPct"
                  inputMode="decimal"
                  className="w-24"
                  placeholder="0"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">%</span>
                {comissao !== null && (
                  <span className="ml-auto text-sm">
                    <span className="text-muted-foreground">{formatCurrency(total)} → </span>
                    <span className="font-semibold">{formatCurrency(comissao)}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("comissao.ajuda")}</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Ações */}
          <div className="flex gap-3 pt-2 border-t">
            <Button
              className="flex-1"
              variant="outline"
              disabled={isPending}
              onClick={() => handleConclude(false)}
            >
              {isPending ? tc("saving") : isConcluded ? t("concludeDialog.saveNoInvoice") : t("concludeDialog.concludeNoInvoice")}
            </Button>
            <Button
              className="flex-1"
              disabled={isPending}
              onClick={() => handleConclude(true)}
            >
              {isPending ? tc("saving") : isConcluded ? t("concludeDialog.saveAndInvoice") : t("concludeDialog.concludeAndInvoice")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
