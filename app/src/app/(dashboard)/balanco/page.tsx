import { redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { getBalanco } from "@/actions/balanco"
import { ehGrupoDoAtivo, type GrupoDoBalanco } from "@/lib/balanco"
import { veredito as vereditoDe, type Gravidade } from "@/lib/contador-agente"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { BasesForm } from "@/components/balanco/bases-form"
import { ExportarBalanco } from "@/components/balanco/exportar-balanco"
import {
  LinhaManualAcoes,
  LinhaManualDialog,
} from "@/components/balanco/linha-manual-dialog"

// O BALANÇO PATRIMONIAL.
//
// A ordem da tela é a ordem da conversa que ela quer ter: primeiro os três
// números que respondem "como está a empresa", depois o CONFERENTE — que diz o
// que confiar e o que corrigir —, e só então o balanço linha a linha.
//
// O conferente vem antes do balanço de propósito. Quem abre esta tela quer o
// número; mostrar o número antes da ressalva é entregar uma conclusão sem o
// aviso de que ela pode estar errada.

const CORES: Record<Gravidade, { caixa: string; icone: string }> = {
  impede: {
    caixa: "border-destructive/40 bg-destructive/5",
    icone: "text-destructive",
  },
  atencao: {
    caixa: "border-amber-500/40 bg-amber-500/5",
    icone: "text-amber-600 dark:text-amber-400",
  },
  informa: {
    caixa: "border-blue-500/30 bg-blue-500/5",
    icone: "text-blue-600 dark:text-blue-400",
  },
}

const ICONE: Record<Gravidade, typeof Info> = {
  impede: AlertTriangle,
  atencao: TriangleAlert,
  informa: Info,
}

export default async function BalancoPage() {
  const { tenantId, role } = await getTenant()
  // Menu escondido não é proteção — a URL continua digitável. A Action se
  // defende sozinha também (requireRecurso), e isto aqui só evita a tela de
  // erro para quem chegou aqui por engano.
  if (!(await temRecurso(tenantId, "balanco"))) redirect("/dashboard")

  const t = await getTranslations("balanco")
  const isAdmin = role === "OWNER" || role === "ADMIN"
  const { balanco, achados, caixaInicial, capitalSocial } = await getBalanco()

  // O veredito mora no conferente, e não aqui: recalculá-lo na tela deixaria
  // duas regras de "quando isto está grave" para divergirem com o tempo.
  const veredito = vereditoDe(achados)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("titulo")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitulo")}</p>
        </div>
        {isAdmin && <ExportarBalanco />}
      </div>

      {/* ─── Os três números ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Numero rotulo={t("totais.ativo")} valor={balanco.ativo} />
        <Numero rotulo={t("totais.passivo")} valor={balanco.passivo} />
        <Numero
          rotulo={t("totais.pl")}
          valor={balanco.patrimonioLiquido}
          destaque
          alerta={balanco.patrimonioLiquido < 0}
        />
      </div>

      {/* ─── O conferente, ANTES do balanço ─────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t("conferente.titulo")}</h2>
          <p className="text-sm text-muted-foreground">{t("conferente.subtitulo")}</p>
        </div>

        {achados.length === 0 ? (
          <Card className="border-emerald-500/40 bg-emerald-500/5">
            <CardContent className="flex items-start gap-2 py-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>{t("conferente.ok")}</span>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm font-medium">
              {veredito === "impede" ? t("conferente.impede") : veredito === "atencao" ? t("conferente.atencao") : t("conferente.ok")}
            </p>
            <div className="space-y-2">
              {achados.map((a) => {
                const Icone = ICONE[a.gravidade]
                const cor = CORES[a.gravidade]
                return (
                  <Card key={a.chave} className={cor.caixa}>
                    <CardContent className="flex items-start gap-2 py-3 text-sm">
                      <Icone className={`mt-0.5 size-4 shrink-0 ${cor.icone}`} />
                      <div className="min-w-0 flex-1">
                        <span className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t(`conferente.gravidades.${a.gravidade}` as "conferente.gravidades.impede")}
                        </span>
                        <span>
                          {t(
                            `conferente.achados.${a.chave}` as "conferente.achados.naoFecha",
                            dinheirizar(a.dados)
                          )}
                        </span>
                      </div>
                      {a.ir && (
                        <Link
                          href={a.ir}
                          className="shrink-0 text-xs font-medium underline underline-offset-2"
                        >
                          {t("conferente.resolver")}
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* ─── O que só a empresa sabe ────────────────────────────────────── */}
      {isAdmin && <BasesForm caixaInicial={caixaInicial} capitalSocial={capitalSocial} />}

      {/* ─── O balanço, linha a linha ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Grupo balanco={balanco} grupo="ATIVO_CIRCULANTE" isAdmin={isAdmin} />
          <Grupo balanco={balanco} grupo="ATIVO_NAO_CIRCULANTE" isAdmin={isAdmin} />
        </div>
        <div className="space-y-4">
          <Grupo balanco={balanco} grupo="PASSIVO_CIRCULANTE" isAdmin={isAdmin} />
          <Grupo balanco={balanco} grupo="PASSIVO_NAO_CIRCULANTE" isAdmin={isAdmin} />
          <Grupo balanco={balanco} grupo="PATRIMONIO_LIQUIDO" isAdmin={isAdmin} />
        </div>
      </div>

      {isAdmin && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-semibold">{t("manual.titulo")}</p>
              <p className="max-w-2xl text-xs text-muted-foreground">{t("manual.ajuda")}</p>
            </div>
            <LinhaManualDialog />
          </CardContent>
        </Card>
      )}

      {/* O limite honesto, dito na tela e não só na documentação. */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="flex items-start gap-2 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <span>{t("avisoContador")}</span>
        </CardContent>
      </Card>
    </div>
  )
}

/** Os números que a mensagem interpola, já formatados como dinheiro ou contagem. */
function dinheirizar(dados?: Record<string, number>) {
  if (!dados) return {}
  const emDinheiro = new Set(["caixa", "pl", "passivo", "ativo", "valor", "depreciacao"])
  const saida: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(dados)) {
    saida[k] = emDinheiro.has(k) ? formatCurrency(v) : v
  }
  return saida
}

function Numero({
  rotulo,
  valor,
  destaque,
  alerta,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${
            alerta
              ? "text-destructive"
              : destaque
                ? "text-emerald-600 dark:text-emerald-400"
                : ""
          }`}
        >
          {formatCurrency(valor)}
        </p>
      </CardContent>
    </Card>
  )
}

async function Grupo({
  balanco,
  grupo,
  isAdmin,
}: {
  balanco: Awaited<ReturnType<typeof getBalanco>>["balanco"]
  grupo: GrupoDoBalanco
  isAdmin: boolean
}) {
  const t = await getTranslations("balanco")
  const g = balanco.grupos.find((x) => x.grupo === grupo)!

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-baseline justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{t(`grupos.${grupo}` as "grupos.ATIVO_CIRCULANTE")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t(`gruposAjuda.${grupo}` as "gruposAjuda.ATIVO_CIRCULANTE")}
            </p>
          </div>
          <p
            className={`text-sm font-bold tabular-nums ${
              !ehGrupoDoAtivo(grupo) && g.total > 0 ? "text-muted-foreground" : ""
            }`}
          >
            {formatCurrency(g.total)}
          </p>
        </div>

        {g.linhas.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">{t("manual.vazio")}</p>
        ) : (
          <ul className="divide-y">
            {g.linhas.map((l) => (
              <li
                key={l.id ?? l.chave}
                className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {/* A tela TRADUZ a chave das automáticas e mostra o texto das
                      manuais como foi digitado: traduzir "Financiamento da van"
                      devolveria a chave crua na tela. */}
                  {l.automatica ? t(`linhas.${l.chave}` as "linhas.caixa") : l.chave}
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(l.valor)}</span>
                {isAdmin && !l.automatica && l.id && (
                  <LinhaManualAcoes
                    linha={{ id: l.id, grupo, descricao: l.chave, valor: l.valor }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
