"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { KeyRound, Ban, ArrowLeftRight, LogIn, Loader2 } from "lucide-react"
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
import { liberarAcesso, cancelarAcesso, trocarPlano, entrarNaConta } from "@/actions/admin"

type Plano = { id: string; name: string }

type Props = {
  tenantId: string
  tenantName: string
  status: string
  planId: string | null
  planos: Plano[]
  /** Permissões da área de quem está olhando. Esconder o botão é só cortesia:
   *  cada Server Action confere por conta própria, porque tem ID próprio e é
   *  despachável sem passar por esta tela. */
  permissoes: string[]
}

// Toda ação daqui mexe no acesso ou na cobrança de uma empresa real. Nenhuma
// dispara em um clique só: sempre confirma dizendo o nome da empresa e o que
// vai acontecer. Erro aqui é caro e visível pro cliente.
export function TenantActions({ tenantId, tenantName, status, planId, planos, permissoes }: Props) {
  const pode = (p: string) => permissoes.includes(p)
  const t = useTranslations("mapAdmin.admin.actions")
  const [pendente, startTransition] = useTransition()
  const [aberto, setAberto] = useState<null | "liberar" | "cancelar" | "plano" | "entrar">(null)
  const [planoEscolhido, setPlanoEscolhido] = useState(planId ?? planos[0]?.id ?? "")

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
