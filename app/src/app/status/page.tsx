export const dynamic = "force-dynamic"

import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CheckCircle2, AlertTriangle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { diagnosticar } from "@/lib/saude"
import { resumo, ultimosDias } from "@/lib/status"

export const metadata: Metadata = {
  title: "Status — ServiçoOS",
  description: "Estado atual do sistema e histórico das tarefas automáticas.",
  // Página de status não deve competir com a landing na busca.
  robots: { index: false },
}

/**
 * Status público.
 *
 * O que esta página NÃO consegue fazer, e por isso está escrito nela: reportar
 * a própria queda. Ela roda na mesma infraestrutura que descreve — se tudo
 * cair, ela cai junto e ninguém lê nada aqui. Quem cobre esse caso é o monitor
 * externo consultando /api/health.
 *
 * O que ela cobre é o caso mais comum e mais traiçoeiro: o sistema NO AR com
 * alguma coisa quebrada por dentro. É o que o cliente não consegue enxergar
 * sozinho.
 */
export default async function StatusPage() {
  const t = await getTranslations("status")
  const agora = new Date()

  let bancoRespondeu = false
  let ultimoCronOk: Date | null = null
  let primeiroRegistroEm: Date | null = null
  let execucoes: { startedAt: Date; ok: boolean }[] = []

  try {
    const desde = new Date(agora.getTime() - 30 * 86_400_000)
    const [todas, marco] = await Promise.all([
      prisma.cronRun.findMany({
        where: { name: "daily", startedAt: { gte: desde } },
        select: { startedAt: true, ok: true },
        orderBy: { startedAt: "asc" },
      }),
      prisma.$queryRaw<{ finished_at: Date | null }[]>`
        select finished_at from _prisma_migrations
        where migration_name = '20260819000001_add_cron_run' limit 1
      `,
    ])
    bancoRespondeu = true
    execucoes = todas
    ultimoCronOk = [...todas].reverse().find((e) => e.ok)?.startedAt ?? null
    primeiroRegistroEm = marco?.[0]?.finished_at ?? null
  } catch (err) {
    console.error("[status] banco não respondeu:", err)
  }

  const d = diagnosticar({ bancoRespondeu, ultimoCronOk, primeiroRegistroEm, agora })
  const dias = ultimosDias(execucoes, agora, 30)
  const r = resumo(dias)
  const saudavel = d.estado === "saudavel"

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <Link href="/" className="font-bold text-primary">ServiçoOS</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 space-y-8">
        <div
          className={`rounded-xl border p-6 ${
            saudavel
              ? "border-green-500/30 bg-green-500/5"
              : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <div className="flex items-center gap-3">
            {saudavel ? (
              <CheckCircle2 className="size-7 text-green-600 shrink-0" />
            ) : (
              <AlertTriangle className="size-7 text-amber-600 shrink-0" />
            )}
            <div>
              <h1 className="text-xl font-bold">
                {saudavel ? t("tudoBem") : t("comProblema")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("verificadoEm", { hora: agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) })}
              </p>
            </div>
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("componentes")}</h2>
          <Linha nome={t("banco")} ok={d.checagens.banco === "saudavel"} />
          <Linha
            nome={t("tarefas")}
            ok={d.checagens.cron === "saudavel"}
            detalhe={
              d.horasDesdeOCron === null
                ? t("semExecucao")
                : t("ultimaExecucao", { horas: d.horasDesdeOCron })
            }
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t("historico")}</h2>
          {/* Um quadradinho por dia. Cinza = sem registro, que é diferente de
              falha: antes de 19/08/2026 nada era registrado, e pintar isso de
              vermelho seria inventar um passado ruim que ninguém observou. */}
          <div className="flex flex-wrap gap-1">
            {dias.map((dia) => (
              <span
                key={dia.data}
                title={`${dia.data} — ${t(`dia.${dia.estado}` as "dia.ok")}`}
                className={`h-7 w-2.5 rounded-sm ${
                  dia.estado === "ok"
                    ? "bg-green-500"
                    : dia.estado === "falhou"
                      ? "bg-destructive"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {r.observados === 0
              ? t("semHistorico")
              : t("resumoDias", { bons: r.bons, total: r.observados })}
          </p>
        </section>

        {/* O limite, escrito na própria página. Página de status que se
            apresenta como onisciente engana o cliente exatamente no momento em
            que ele mais precisa de informação. */}
        <section className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <h2 className="text-sm font-medium">{t("limite.titulo")}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("limite.texto")}</p>
        </section>

        <p className="text-xs text-muted-foreground">
          {t("contato")}{" "}
          <a href="mailto:suporte@servicoos.com.br" className="underline hover:text-foreground">
            suporte@servicoos.com.br
          </a>
        </p>
      </main>
    </div>
  )
}

function Linha({ nome, ok, detalhe }: { nome: string; ok: boolean; detalhe?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{nome}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          ok
            ? "bg-green-500/15 text-green-700 dark:text-green-400"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-500"
        }`}
      >
        {ok ? "OK" : "!"}
      </span>
    </div>
  )
}
