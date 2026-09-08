"use client"

import { useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  DollarSign,
  Check,
  MapPin,
} from "lucide-react"
import {
  emDinheiro,
  ordemDoDetalhe,
  painelDe,
  SEGMENTOS,
  totalDaOs,
  type Segmento,
  type StatusOs,
} from "@/lib/demo"

// A visita guiada. Quatro telas, trocáveis por aba, para UM ramo.
//
// ─── Por que cliente, e por que abas ─────────────────────────────────────────
//
// O objetivo é UMA coisa: o dono da empresa abre o link no WhatsApp e, em dez
// segundos, mexeu no sistema. Trocar de tela sem recarregar é o que dá a
// sensação de "estou usando", e não "estou vendo um folheto".
//
// Abas e não menu lateral: no celular o menu lateral vira gaveta, e gaveta é um
// passo a mais entre a pessoa e o produto.
//
// ─── Só o que o produto FAZ ──────────────────────────────────────────────────
//
// Cada tela espelha uma tela que existe. Demo que promete recurso inexistente
// cobra o preço na primeira semana de uso, quando o cliente procura o botão.

const COR_STATUS: Record<StatusOs, string> = {
  OPEN: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  IN_PROGRESS: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  INVOICED: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
}

type Aba = "painel" | "os" | "detalhe" | "financeiro"

export function VisitaGuiada({ segmento }: { segmento: Segmento }) {
  const t = useTranslations("demo")
  const tc = useTranslations("common")
  const locale = useLocale()
  const [aba, setAba] = useState<Aba>("painel")

  const dinheiro = (v: number) => emDinheiro(v, locale)

  const abas: { id: Aba; rotulo: string; icone: React.ElementType }[] = [
    { id: "painel", rotulo: t("abas.painel"), icone: LayoutDashboard },
    { id: "os", rotulo: t("abas.os"), icone: ClipboardList },
    { id: "detalhe", rotulo: t("abas.detalhe"), icone: CalendarDays },
    { id: "financeiro", rotulo: t("abas.financeiro"), icone: DollarSign },
  ]

  const status = (s: StatusOs) => (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_STATUS[s]}`}>
      {tc(`serviceOrderStatus.${s}` as "serviceOrderStatus.OPEN")}
    </span>
  )

  return (
    <div className="space-y-4">
      {/* Os RAMOS. Ficam acima das abas porque a primeira pergunta de quem
          chega é "isso serve para o meu tipo de serviço?", e não "que tela eu
          vejo primeiro". Links de verdade, e não botões: cada ramo tem o
          próprio endereço, que é o que se manda no WhatsApp. */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {SEGMENTOS.map((s) => (
          <Link
            key={s.slug}
            href={s.slug === SEGMENTOS[0].slug ? "/demo" : `/demo/${s.slug}`}
            aria-current={s.slug === segmento.slug}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              s.slug === segmento.slug
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t(`ramos.${s.slug}` as "ramos.desentupidora")}
          </Link>
        ))}
      </div>

      {/* As quatro abas dividem a largura por igual e NÃO rolam: numa barra
          rolante a quarta fica meio escondida, e ninguém rola uma barra que não
          parece rolável — a tela do Financeiro simplesmente não seria vista.
          Para caber em 375px, o ícone some no celular e sobra só o rótulo, que
          é o que carrega o significado. */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            aria-current={aba === a.id}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-2 py-2 text-xs font-medium transition sm:px-3 sm:text-sm ${
              aba === a.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <a.icone className="hidden size-4 shrink-0 sm:block" />
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
        <div className="flex h-9 items-center gap-2 border-b bg-muted px-4">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="mx-auto truncate font-mono text-[11px] text-muted-foreground">
            {segmento.empresa}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          {aba === "painel" && <Painel t={t} s={segmento} dinheiro={dinheiro} />}
          {aba === "os" && <ListaDeOs t={t} s={segmento} status={status} dinheiro={dinheiro} />}
          {aba === "detalhe" && (
            <DetalheDaOs t={t} s={segmento} status={status} dinheiro={dinheiro} />
          )}
          {aba === "financeiro" && <Financeiro t={t} s={segmento} dinheiro={dinheiro} />}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">{t("aviso")}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/register"
          className="rounded-md bg-primary px-5 py-3 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t("cta")}
        </Link>
        <Link
          href="/#planos"
          className="rounded-md border px-5 py-3 text-center text-sm font-medium hover:bg-muted"
        >
          {t("ctaPlanos")}
        </Link>
      </div>
    </div>
  )
}

type T = ReturnType<typeof useTranslations<"demo">>
type Props = { t: T; s: Segmento; dinheiro: (v: number) => string }

function Cartao({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tom ?? ""}`}>{valor}</p>
    </div>
  )
}

function Painel({ t, s, dinheiro }: Props) {
  const p = painelDe(s)
  const maior = Math.max(...s.faturamentoMeses.map((m) => m.valor))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo={t("painel.faturado")} valor={dinheiro(p.faturadoMes)} />
        <Cartao rotulo={t("painel.aReceber")} valor={dinheiro(p.aReceber)} />
        <Cartao
          rotulo={t("painel.vencido")}
          valor={dinheiro(p.vencido)}
          tom="text-red-600 dark:text-red-400"
        />
        <Cartao rotulo={t("painel.ticket")} valor={dinheiro(p.ticketMedio)} />
      </div>

      <div className="rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("painel.grafico")}
        </p>
        {/* Barras em CSS puro: um gráfico de verdade traria uma biblioteca
            inteira para uma página que precisa abrir rápido no 4G.

            Barras e rótulos em fileiras SEPARADAS de propósito: `height: X%` só
            resolve contra um pai de altura definida. Quando a barra e o rótulo
            dividiam a mesma coluna de altura automática, a porcentagem não
            resolvia e o gráfico saía VAZIO — compilava, passava no lint, e
            estava errado na tela. */}
        <div className="mt-4">
          <div className="flex h-28 items-end gap-2">
            {s.faturamentoMeses.map((m) => (
              <div
                key={m.mes}
                className="flex-1 rounded-t bg-primary/80"
                style={{ height: `${Math.round((m.valor / maior) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {s.faturamentoMeses.map((m) => (
              <span key={m.mes} className="flex-1 text-center text-[11px] text-muted-foreground">
                {m.mes}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cartao rotulo={t("painel.abertas")} valor={String(p.osAbertas)} />
        <Cartao rotulo={t("painel.concluidas")} valor={String(p.osConcluidasMes)} />
      </div>
    </div>
  )
}

function ListaDeOs({
  t,
  s,
  status,
  dinheiro,
}: Props & { status: (s: StatusOs) => React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("os.titulo")}
      </p>
      {s.ordens.map((os) => (
        <div key={os.numero} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">#{os.numero}</span>
                <span className="truncate font-medium">{os.titulo}</span>
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">{os.cliente}</p>
            </div>
            {status(os.status)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{os.tecnico}</span>
            <span>{os.quando}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {dinheiro(os.valor)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DetalheDaOs({
  t,
  s,
  status,
  dinheiro,
}: Props & { status: (s: StatusOs) => React.ReactNode }) {
  const os = s.osAberta
  // O cabeçalho vem da LISTA, e não de campos repetidos no detalhe: assim a
  // lista e o detalhe não têm como discordar sobre o mesmo serviço.
  const daLista = ordemDoDetalhe(s)
  const feitos = os.checklist.filter((c) => c.feito).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold">#{daLista.numero}</span>
        <span className="font-medium">{daLista.titulo}</span>
        {status(daLista.status)}
      </div>

      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p className="text-muted-foreground">
          {t("detalhe.cliente")} <span className="text-foreground">{daLista.cliente}</span>
        </p>
        <p className="text-muted-foreground">
          {t("detalhe.tecnico")} <span className="text-foreground">{daLista.tecnico}</span>
        </p>
        <p className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="text-foreground">{os.endereco}</span>
        </p>
        <p className="text-muted-foreground">
          {t("detalhe.agendada")} <span className="text-foreground">{daLista.quando}</span>
        </p>
      </div>

      <p className="rounded-lg bg-muted/50 p-3 text-sm">{os.descricao}</p>

      <div className="space-y-1.5 rounded-lg border p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("detalhe.checklist")} · {feitos}/{os.checklist.length}
        </p>
        {os.checklist.map((c) => (
          <p key={c.texto} className="flex items-center gap-2 text-sm">
            <span
              className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                c.feito
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-muted-foreground/40"
              }`}
            >
              {c.feito && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className={c.feito ? "text-muted-foreground line-through" : ""}>{c.texto}</span>
          </p>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2 font-semibold">{t("detalhe.item")}</th>
              <th className="p-2 text-right font-semibold">{t("detalhe.qtd")}</th>
              <th className="p-2 text-right font-semibold">{t("detalhe.valor")}</th>
            </tr>
          </thead>
          <tbody>
            {os.itens.map((i) => (
              <tr key={i.desc} className="border-t">
                <td className="p-2">{i.desc}</td>
                <td className="p-2 text-right tabular-nums">{i.qtd}</td>
                <td className="p-2 text-right tabular-nums">{dinheiro(i.qtd * i.unit)}</td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="p-2" colSpan={2}>
                {t("detalhe.total")}
              </td>
              <td className="p-2 text-right tabular-nums">{dinheiro(totalDaOs(os))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">{t("detalhe.rodape")}</p>
    </div>
  )
}

function Financeiro({ t, s, dinheiro }: Props) {
  const p = painelDe(s)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Cartao rotulo={t("financeiro.recebido")} valor={dinheiro(p.faturadoMes)} />
        <Cartao rotulo={t("financeiro.pendente")} valor={dinheiro(p.aReceber)} />
        <Cartao
          rotulo={t("financeiro.vencido")}
          valor={dinheiro(p.vencido)}
          tom="text-red-600 dark:text-red-400"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("financeiro.titulo")}
        </p>
        {s.receber.map((r) => (
          <div
            key={r.numero}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                #{r.numero} — {r.cliente}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("financeiro.vence")} {r.venc}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums">{dinheiro(r.valor)}</p>
              <p
                className={`text-[11px] font-medium ${
                  r.pago
                    ? "text-emerald-600 dark:text-emerald-400"
                    : r.vencida
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                }`}
              >
                {r.pago
                  ? t("financeiro.pago")
                  : r.vencida
                    ? t("financeiro.atrasado")
                    : t("financeiro.aVencer")}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{t("financeiro.rodape")}</p>

      {/* A agenda entra aqui embaixo: é a tela que mais impressiona quem
          controla serviço em papel, e não merecia uma aba só para si num
          celular onde cada aba a mais aperta as outras. */}
      <div className="rounded-lg border p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("agenda.titulo")}
        </p>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {s.agenda.map((dia, i) => (
            <div key={i} className="space-y-1">
              <p className="text-center text-[11px] font-medium text-muted-foreground">
                {t(`agenda.dias.${i}` as "agenda.dias.0")}
              </p>
              {dia.map((os) => (
                <div
                  key={os.numero}
                  className={`rounded p-1 text-[10px] leading-tight ${COR_STATUS[os.status]}`}
                >
                  <p className="font-medium">{os.hora}</p>
                  <p className="truncate opacity-80">{os.cliente}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
