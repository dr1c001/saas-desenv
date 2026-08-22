"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { KeyRound, Ban, ArrowLeftRight, LogIn, Loader2, Sparkles, SlidersHorizontal, ToggleLeft } from "lucide-react"
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
  alterarLimitesDaEmpresa,
  alterarFuncoesDaEmpresa,
} from "@/actions/admin"
import { FUNCOES, FUNCOES_COM_CUSTO, type Funcao } from "@/lib/funcoes"
import { ajusteEscolhido, modoDoLimite, type ModoDoLimite } from "@/lib/limite"
// De lib/recursos (puro), NUNCA de lib/plan: aquele importa o Prisma, e num
// componente de cliente isso arrasta o driver do Postgres pro navegador.
import { RECURSOS, RECURSOS_DE_ABA, type Recurso } from "@/lib/recursos"
import { ALL_TABS, abasVisiveis } from "@/lib/abas"

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
  /** Tetos do PLANO dela, para a tela mostrar o que "herdar" significa hoje. */
  limitesDoPlano: { usuarios: number | null; osMes: number | null; nfseMes: number | null }
  /** Funções DESLIGADAS para esta empresa. Vazio = tudo funcionando. */
  funcoesDesligadas: string[]
  /** Ajustes gravados para ESTA empresa. null = herda · 0 = sem limite. */
  ajustes: {
    usuarios: number | null
    osMes: number | null
    nfseMes: number | null
    precoMensal: number | null
  }
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
  limitesDoPlano,
  funcoesDesligadas,
  ajustes,
  permissoes,
}: Props) {
  const pode = (p: string) => permissoes.includes(p)
  const t = useTranslations("mapAdmin.admin.actions")
  const tNav = useTranslations("nav")
  const [pendente, startTransition] = useTransition()
  const [aberto, setAberto] = useState<
    null | "liberar" | "cancelar" | "plano" | "entrar" | "recursos" | "limites" | "funcoes"
  >(null)
  const [planoEscolhido, setPlanoEscolhido] = useState(planId ?? planos[0]?.id ?? "")
  const [extras, setExtras] = useState<Recurso[]>(recursosExtras)
  // Guarda as DESLIGADAS, igual ao banco: lista vazia é "tudo funcionando".
  // Guardar as ligadas faria um estado inicial vazio significar "apagar tudo".
  const [desligadas, setDesligadas] = useState<string[]>(funcoesDesligadas)

  // Cada teto guarda MODO e número separados. Juntar os dois num campo só faria
  // "herdar" e "sem limite" caírem no mesmo vazio — e são coisas diferentes:
  // herdar acompanha o plano quando ele mudar, sem limite não. (lib/limite.ts.)
  type Campo = { modo: ModoDoLimite; numero: string }
  const doAjuste = (v: number | null): Campo => ({
    modo: modoDoLimite(v),
    numero: v && v > 0 ? String(v) : "",
  })
  const [lim, setLim] = useState({
    usuarios: doAjuste(ajustes.usuarios),
    osMes: doAjuste(ajustes.osMes),
    nfseMes: doAjuste(ajustes.nfseMes),
  })
  const [preco, setPreco] = useState(
    ajustes.precoMensal === null ? "" : String(ajustes.precoMensal)
  )

  const paraGravar = (c: Campo) => {
    const n = c.numero.trim() === "" ? null : Number(c.numero)
    return ajusteEscolhido(c.modo, Number.isFinite(n) ? (n as number) : null)
  }

  const noPlano = new Set(recursosDoPlano)
  const alternar = (r: Recurso) =>
    setExtras((atual) => (atual.includes(r) ? atual.filter((x) => x !== r) : [...atual, r]))

  // Tudo que a empresa teria com o que está marcado agora — e, a partir daí,
  // as abas que ela enxergaria. Recalculado a cada clique de propósito: quem
  // marca "Mapa GPS" vê a aba Mapa acender na mesma hora, em vez de salvar e
  // adivinhar o efeito.
  const recursosAtuais = [...new Set([...recursosDoPlano, ...extras])]
  const abasLigadas = new Set<string>(abasVisiveis(recursosAtuais))
  const faltando = RECURSOS.filter((r) => !noPlano.has(r) && !extras.includes(r))

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

            {/* Liberar tudo de uma vez: o caso comum da negociação é "deixa
                tudo aberto pra ela", e marcar cinco caixas uma a uma é atrito
                sem propósito. */}
            {faltando.length > 0 && (
              <button
                type="button"
                onClick={() => setExtras([...extras, ...faltando])}
                disabled={pendente}
                className="self-start text-xs font-medium text-primary hover:underline"
              >
                {t("featuresAll", { count: faltando.length })}
              </button>
            )}

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

            {/* As abas que essa empresa enxerga. Informação, não controle: só
                Mapa e Fiscal dependem de recurso — as outras 15 já aparecem
                pra todo OWNER/ADMIN de qualquer empresa, e esconder qualquer
                uma delas hoje seria cosmético (a URL continua digitável). */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium mb-2">
                {t("tabsTitle", { visiveis: abasLigadas.size, total: ALL_TABS.length })}
              </p>
              <div className="flex flex-wrap gap-1">
                {ALL_TABS.map((aba) => {
                  const ligada = abasLigadas.has(aba.slug)
                  return (
                    <span
                      key={aba.slug}
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        ligada
                          ? "bg-green-500/15 text-green-700 dark:text-green-400"
                          : "bg-muted text-muted-foreground line-through"
                      }`}
                    >
                      {tNav(aba.navKey as "dashboard")}
                    </span>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">{t("tabsHint")}</p>
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

      {pode("alterarLimites") && (
        <Dialog open={aberto === "funcoes"} onOpenChange={(o) => setAberto(o ? "funcoes" : null)}>
          <DialogTrigger render={<Button size="sm" variant="ghost" className="gap-1" />}>
            <ToggleLeft className="size-3.5" />
            {t("functions")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("functionsTitle")}</DialogTitle>
              <DialogDescription>
                {t("functionsDescription", { company: tenantName })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              {FUNCOES.map((fn: Funcao) => {
                const ligada = !desligadas.includes(fn)
                const custa = FUNCOES_COM_CUSTO.includes(fn)
                return (
                  <label
                    key={fn}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={ligada}
                      disabled={pendente}
                      onChange={() =>
                        setDesligadas((d) =>
                          ligada ? [...d, fn] : d.filter((x) => x !== fn)
                        )
                      }
                      className="mt-0.5 size-4"
                    />
                    <span className="text-sm">
                      <span className="font-medium">
                        {t(`functionNames.${fn}` as "functionNames.osPdf")}
                      </span>
                      {custa && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                          {t("functionCosts")}
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {t(`functionHints.${fn}` as "functionHints.osPdf")}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>

            <p className="text-xs text-muted-foreground">{t("functionsHint")}</p>

            <DialogFooter>
              <Button variant="outline" onClick={fechar} disabled={pendente}>
                {t("back")}
              </Button>
              <Button
                onClick={() => executar(() => alterarFuncoesDaEmpresa(tenantId, desligadas))}
                disabled={pendente}
              >
                {pendente && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                {t("functionsConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {pode("alterarLimites") && (
        <Dialog open={aberto === "limites"} onOpenChange={(o) => setAberto(o ? "limites" : null)}>
          <DialogTrigger render={<Button size="sm" variant="ghost" className="gap-1" />}>
            <SlidersHorizontal className="size-3.5" />
            {t("limits")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("limitsTitle")}</DialogTitle>
              <DialogDescription>{t("limitsDescription", { company: tenantName })}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {([
                ["usuarios", t("limitUsers"), limitesDoPlano.usuarios],
                ["osMes", t("limitOrders"), limitesDoPlano.osMes],
                ["nfseMes", t("limitNfse"), limitesDoPlano.nfseMes],
              ] as const).map(([chave, rotulo, noPlanoValor]) => {
                const campo = lim[chave]
                return (
                  <div key={chave} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <label className="text-sm font-medium">{rotulo}</label>
                      <span className="text-xs text-muted-foreground">
                        {t("limitFromPlan", {
                          valor: noPlanoValor === null ? "∞" : String(noPlanoValor),
                        })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(["herdar", "semLimite", "proprio"] as ModoDoLimite[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={pendente}
                          onClick={() => setLim((x) => ({ ...x, [chave]: { ...x[chave], modo: m } }))}
                          className={`rounded-full border px-2.5 py-1 text-xs ${
                            campo.modo === m
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          }`}
                        >
                          {t(`limitMode.${m}` as "limitMode.herdar")}
                        </button>
                      ))}
                      {campo.modo === "proprio" && (
                        <input
                          type="number"
                          min={1}
                          value={campo.numero}
                          disabled={pendente}
                          onChange={(e) =>
                            setLim((x) => ({ ...x, [chave]: { ...x[chave], numero: e.target.value } }))
                          }
                          className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
                          placeholder={t("limitPlaceholder")}
                        />
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="space-y-1.5 border-t pt-3">
                <label className="text-sm font-medium">{t("limitPrice")}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={preco}
                  disabled={pendente}
                  onChange={(e) => setPreco(e.target.value)}
                  className="w-32 rounded-md border bg-background px-2 py-1 text-sm"
                  placeholder={t("limitPricePlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("limitPriceHint")}</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={fechar} disabled={pendente}>
                {t("back")}
              </Button>
              <Button
                onClick={() =>
                  executar(() =>
                    alterarLimitesDaEmpresa(tenantId, {
                      usuarios: paraGravar(lim.usuarios),
                      osMes: paraGravar(lim.osMes),
                      nfseMes: paraGravar(lim.nfseMes),
                      precoMensal: preco.trim() === "" ? null : Number(preco),
                    })
                  )
                }
                disabled={pendente}
              >
                {pendente && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                {t("limitsConfirm")}
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
