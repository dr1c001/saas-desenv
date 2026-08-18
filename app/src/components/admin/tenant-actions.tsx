"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { KeyRound, Ban, ArrowLeftRight, LogIn, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  liberarAcesso,
  cancelarAcesso,
  trocarPlano,
  entrarNaConta,
  alterarRecursosExtras,
} from "@/actions/admin"
// De lib/recursos (puro), NUNCA de lib/plan: aquele importa o Prisma, e num
// componente de cliente isso arrasta o driver do Postgres pro navegador.
import { RECURSOS, RECURSOS_DE_ABA, type Recurso } from "@/lib/recursos"

type Plano = { id: string; name: string }

type Props = {
  tenantId: string
  tenantName: string
  status: string
  planId: string | null
  planos: Plano[]
  /** O que o plano dela já libera — vem marcado e travado na tela. */
  recursosDoPlano: Recurso[]
  /** Concedidos à mão, por cima do plano. */
  recursosExtras: Recurso[]
  /** Permissões da área de quem está olhando. Esconder o botão é só cortesia:
   *  cada Server Action confere por conta própria, porque tem ID próprio e é
   *  despachável sem passar por esta tela. */
  permissoes: string[]
}

// Toda ação daqui mexe no acesso ou na cobrança de uma empresa real. Nenhuma
// dispara em um clique só: sempre confirma dizendo o nome da empresa e o que
// vai acontecer. Erro aqui é caro e visível pro cliente.
export function TenantActions({
  tenantId,
  tenantName,
  status,
  planId,
  planos,
  recursosDoPlano,
  recursosExtras,
  permissoes,
}: Props) {
  const pode = (p: string) => permissoes.includes(p)
  const t = useTranslations("mapAdmin.admin.actions")
  const [pendente, startTransition] = useTransition()
  const [aberto, setAberto] = useState<
    null | "liberar" | "cancelar" | "plano" | "entrar" | "recursos"
  >(null)
  const [planoEscolhido, setPlanoEscolhido] = useState(planId ?? planos[0]?.id ?? "")
  const [extras, setExtras] = useState<Recurso[]>(recursosExtras)

  const noPlano = new Set(recursosDoPlano)
  const alternar = (r: Recurso) =>
    setExtras((atual) => (atual.includes(r) ? atual.filter((x) => x !== r) : [...atual, r]))

  const fechar = () => setAberto(null)
  const executar = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn()
      fechar()
    })

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status !== "ACTIVE" && pode("liberarAcesso") && (
        <Confirmacao
          aberto={aberto === "liberar"}
          onOpenChange={(o) => setAberto(o ? "liberar" : null)}
          botao={<Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50" />}
          rotulo={<><KeyRound className="size-3.5" />{t("release")}</>}
          titulo={t("releaseTitle")}
          descricao={t("releaseDescription", { company: tenantName })}
          confirmar={t("releaseConfirm")}
          pendente={pendente}
          onConfirmar={() => executar(() => liberarAcesso(tenantId))}
        />
      )}

      {status === "ACTIVE" && pode("cancelarAcesso") && (
        <Confirmacao
          aberto={aberto === "cancelar"}
          onOpenChange={(o) => setAberto(o ? "cancelar" : null)}
          botao={<Button size="sm" variant="outline" className="gap-1 text-red-700 border-red-300 hover:bg-red-50" />}
          rotulo={<><Ban className="size-3.5" />{t("cancel")}</>}
          titulo={t("cancelTitle")}
          descricao={t("cancelDescription", { company: tenantName })}
          confirmar={t("cancelConfirm")}
          pendente={pendente}
          onConfirmar={() => executar(() => cancelarAcesso(tenantId))}
        />
      )}

      {/* Trocar plano */}
      {pode("trocarPlano") && (
      <Dialog open={aberto === "plano"} onOpenChange={(o) => setAberto(o ? "plano" : null)}>
        <DialogTrigger render={<Button size="sm" variant="ghost" className="gap-1" />}>
          <ArrowLeftRight className="size-3.5" />
          {t("changePlan")}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("changePlanTitle")}</DialogTitle>
            <DialogDescription>{t("changePlanDescription", { company: tenantName })}</DialogDescription>
          </DialogHeader>
          <select
            value={planoEscolhido}
            onChange={(e) => setPlanoEscolhido(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={pendente}>
              {t("back")}
            </Button>
            <Button
              onClick={() => executar(() => trocarPlano(tenantId, planoEscolhido))}
              disabled={pendente || !planoEscolhido || planoEscolhido === planId}
            >
              {pendente && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {t("changePlanConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {/* Recursos avulsos, por cima do plano. Existe porque isto já foi feito
          duas vezes editando o banco de produção à mão — e nenhuma das duas
          ficou registrada em lugar nenhum. */}
      {pode("concederRecurso") && (
        <Dialog
          open={aberto === "recursos"}
          onOpenChange={(o) => {
            // Fechar sem salvar tem que desfazer o que foi marcado, senão o
            // próximo abrir mostraria escolhas que nunca foram gravadas.
            if (!o) setExtras(recursosExtras)
            setAberto(o ? "recursos" : null)
          }}
        >
          <DialogTrigger render={<Button size="sm" variant="ghost" className="gap-1" />}>
            <Sparkles className="size-3.5" />
            {t("features")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("featuresTitle")}</DialogTitle>
              <DialogDescription>{t("featuresDescription", { company: tenantName })}</DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              {RECURSOS.map((r) => {
                const doPlano = noPlano.has(r)
                const marcado = doPlano || extras.includes(r)
                return (
                  <label
                    key={r}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      doPlano ? "opacity-60" : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      // O que o plano já dá não se desmarca por aqui: pra tirar,
                      // troca-se o plano. Deixar clicável sugeriria um poder que
                      // a ação não tem — ela só mexe nos extras.
                      disabled={doPlano || pendente}
                      onChange={() => alternar(r)}
                      className="mt-0.5 size-4"
                    />
                    <span className="text-sm">
                      <span className="font-medium">
                        {t(`featureNames.${r}` as "featureNames.gpsMap")}
                      </span>
                      {RECURSOS_DE_ABA.includes(r) && (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          {t("featureIsTab")}
                        </span>
                      )}
                      {doPlano && (
                        <span className="block text-xs text-muted-foreground">{t("featureFromPlan")}</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={fechar} disabled={pendente}>
                {t("back")}
              </Button>
              <Button
                onClick={() =>
                  executar(() => alterarRecursosExtras(tenantId, [...extras]))
                }
                disabled={pendente}
              >
                {pendente && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                {t("featuresConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {pode("entrarNaConta") && (
      <Confirmacao
        aberto={aberto === "entrar"}
        onOpenChange={(o) => setAberto(o ? "entrar" : null)}
        botao={<Button size="sm" variant="ghost" className="gap-1" />}
        rotulo={<><LogIn className="size-3.5" />{t("impersonate")}</>}
        titulo={t("impersonateTitle")}
        descricao={t("impersonateDescription", { company: tenantName })}
        confirmar={t("impersonateConfirm")}
        pendente={pendente}
        onConfirmar={() => executar(() => entrarNaConta(tenantId))}
      />
      )}
    </div>
  )
}

function Confirmacao({
  aberto,
  onOpenChange,
  botao,
  rotulo,
  titulo,
  descricao,
  confirmar,
  pendente,
  onConfirmar,
}: {
  aberto: boolean
  onOpenChange: (o: boolean) => void
  botao: React.ReactElement
  rotulo: React.ReactNode
  titulo: string
  descricao: string
  confirmar: string
  pendente: boolean
  onConfirmar: () => void
}) {
  const t = useTranslations("mapAdmin.admin.actions")
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogTrigger render={botao}>{rotulo}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pendente}>
            {t("back")}
          </Button>
          <Button onClick={onConfirmar} disabled={pendente}>
            {pendente && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
