import { getTranslations } from "next-intl/server"

// As telas do sistema, na landing.
//
// ─── Por que maquete e nao print ─────────────────────────────────────────────
//
// Um PNG de captura seria mais rapido de produzir e pior em tudo o que importa
// aqui:
//
//   - print tem UM tema. Esta pagina acompanha claro/escuro do visitante, e um
//     print claro sobre fundo escuro fica um retangulo branco gritando no meio
//     da pagina;
//   - print tem UMA resolucao. Em tela de alta densidade ele borra, e a
//     primeira impressao do produto passa a ser "imagem borrada";
//   - print pesa centenas de KB. Isto pesa alguns, e a landing e a pagina que
//     mais precisa carregar rapido;
//   - print CONGELA. Quando a tela real mudar, ele vira propaganda enganosa
//     silenciosa — ninguem lembra de refazer captura;
//   - print sai de uma conta de verdade, com dados de cliente de verdade.
//
// ─── Por que os textos vem das traducoes do sistema ──────────────────────────
//
// "Cliente", "Responsavel", "Concluida" sao lidos das MESMAS chaves que as
// telas de verdade usam. Duas consequencias: a maquete fala portugues ou ingles
// junto com o resto da pagina, e se o vocabulario do produto mudar, a vitrine
// muda junto em vez de mentir.
//
// Os DADOS sao ficticios e ficam aqui no codigo, seguindo o padrao que a
// landing ja usava para os numeros do preview. Nomes de empresa inventados, de
// proposito: nenhum print de conta real, nenhum dado de cliente de verdade.

type Status = "IN_PROGRESS" | "DONE" | "OPEN"

const COR_STATUS: Record<Status, string> = {
  IN_PROGRESS: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  OPEN: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
}

/** O quadro de janela usado nas tres maquetes. */
function Janela({ endereco, children }: { endereco: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xl">
      <div className="flex h-9 items-center gap-2 border-b bg-muted px-4">
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        <span className="mx-auto font-mono text-[11px] text-muted-foreground">{endereco}</span>
      </div>
      {children}
    </div>
  )
}

function Etiqueta({ status, texto }: { status: Status; texto: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_STATUS[status]}`}>
      {texto}
    </span>
  )
}

export async function TelasDoSistema() {
  const t = await getTranslations("landing.telas")
  const tc = await getTranslations("common")
  const tOs = await getTranslations("serviceOrdersPages.detail")
  const tFin = await getTranslations("finance")
  const tSched = await getTranslations("schedule.calendar")

  const semana = tSched.raw("weekdays") as string[]

  // ─── Dados ficticios ─────────────────────────────────────────────────────
  const itens = [
    { desc: "Compressor 1/3 HP", qtd: "1", unit: "890,00", total: "890,00" },
    { desc: "Filtro secador", qtd: "1", unit: "78,00", total: "78,00" },
    { desc: "Mão de obra técnica", qtd: "2", unit: "120,00", total: "240,00" },
  ]
  const checklist = [
    { texto: "Isolar o circuito", feito: true },
    { texto: "Substituir o compressor", feito: true },
    { texto: "Testar pressão da linha", feito: false },
    { texto: "Registrar leitura final", feito: false },
  ]
  const agenda = [
    [{ n: "0248", cliente: "Padaria Estrela", s: "OPEN" as Status }],
    [
      { n: "0247", cliente: "Mercado São Jorge", s: "IN_PROGRESS" as Status },
      { n: "0251", cliente: "Ana Beatriz M.", s: "OPEN" as Status },
    ],
    [{ n: "0244", cliente: "Cond. Vila Nova", s: "DONE" as Status }],
    [
      { n: "0252", cliente: "Rest. Dona Nena", s: "OPEN" as Status },
      { n: "0253", cliente: "Auto Peças K2", s: "OPEN" as Status },
    ],
    [{ n: "0255", cliente: "Padaria Estrela", s: "OPEN" as Status }],
  ]
  const receber = [
    { desc: "OS #0244 — Cond. Vila Nova", valor: "1.480,00", pago: true },
    { desc: "OS #0239 — Mercado São Jorge", valor: "2.310,00", pago: true },
    { desc: "OS #0247 — Padaria Estrela", valor: "1.208,00", pago: false },
  ]

  return (
    <section className="mx-auto max-w-6xl space-y-20 px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold">{t("title")}</h2>
        <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* ── 1. A ordem de serviço ───────────────────────────────────────── */}
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-2xl font-semibold">{t("os.title")}</h3>
          <p className="text-muted-foreground">{t("os.desc")}</p>
        </div>

        <Janela endereco="servicoos.com.br/service-orders/247">
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-semibold">#0247</span>
              <span className="font-medium">Troca de compressor</span>
              <Etiqueta status="IN_PROGRESS" texto={tc("serviceOrderStatus.IN_PROGRESS")} />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <p className="text-muted-foreground">
                {tOs("clientLabel")} <span className="text-foreground">Padaria Estrela</span>
              </p>
              <p className="text-muted-foreground">
                {tOs("responsibleLabel")} <span className="text-foreground">Carlos Menezes</span>
              </p>
              <p className="text-muted-foreground">
                {tOs("scheduledLabel")} <span className="text-foreground">24/08 às 14:00</span>
              </p>
              <p className="text-muted-foreground">
                {tOs("createdLabel")} <span className="text-foreground">22/08</span>
              </p>
            </div>

            <div className="space-y-1.5 rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tOs("checklistTitle")} · 2/4
              </p>
              {checklist.map((c) => (
                <p
                  key={c.texto}
                  className={`text-sm ${c.feito ? "text-muted-foreground line-through" : ""}`}
                >
                  <span className={c.feito ? "text-emerald-600 dark:text-emerald-400" : ""}>
                    {c.feito ? "✓" : "○"}
                  </span>{" "}
                  {c.texto}
                </p>
              ))}
            </div>

            <div className="overflow-x-auto">
              {/* Sem min-width: a coluna de quantidade some no celular e a
                  tabela cabe inteira. Rolagem lateral DENTRO de uma maquete
                  de venda parece defeito, mesmo estando contida. */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-1 text-left font-medium">{tOs("itemColumns.description")}</th>
                    <th className="hidden pb-1 text-right font-medium sm:table-cell">{tOs("itemColumns.quantity")}</th>
                    <th className="pb-1 text-right font-medium">{tOs("itemColumns.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.desc} className="border-t">
                      <td className="py-1.5">{i.desc}</td>
                      <td className="hidden py-1.5 text-right tabular-nums text-muted-foreground sm:table-cell">{i.qtd}</td>
                      <td className="py-1.5 text-right tabular-nums">R$ {i.total}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-semibold">
                    <td className="py-1.5" colSpan={1}>
                      {tOs("itemColumns.total")}
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="py-1.5 text-right tabular-nums">R$ 1.208,00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Janela>
      </div>

      {/* ── 2. A agenda ─────────────────────────────────────────────────── */}
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Janela endereco="servicoos.com.br/schedule">
          <div className="p-5">
            {/* Tres dias no celular, cinco a partir de sm. Com cinco colunas
                em 375px cada uma fica com 60px, e o chip cai para 10px de
                fonte — ilegivel, e isto aqui e vitrine. */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {agenda.map((dia, i) => (
                <div key={i} className={`space-y-1.5 ${i > 2 ? "hidden sm:block" : ""}`}>
                  <p className="text-center text-[11px] font-semibold uppercase text-muted-foreground">
                    {semana[i + 1]}
                  </p>
                  <p className="text-center text-lg font-semibold tabular-nums">{24 + i}</p>
                  {dia.map((os) => (
                    <div key={os.n} className={`rounded p-1.5 text-[11px] leading-tight ${COR_STATUS[os.s]}`}>
                      <p className="font-mono font-semibold">#{os.n}</p>
                      <p className="truncate opacity-80">{os.cliente}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Janela>

        <div className="space-y-3 lg:order-first">
          <h3 className="text-2xl font-semibold">{t("agenda.title")}</h3>
          <p className="text-muted-foreground">{t("agenda.desc")}</p>
        </div>
      </div>

      {/* ── 3. O financeiro ─────────────────────────────────────────────── */}
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-2xl font-semibold">{t("financeiro.title")}</h3>
          <p className="text-muted-foreground">{t("financeiro.desc")}</p>
        </div>

        <Janela endereco="servicoos.com.br/finance">
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { rotulo: tFin("kpis.monthlyRevenue.title"), valor: "R$ 24.900" },
                { rotulo: tFin("kpis.receivable.title"), valor: "R$ 8.420" },
                { rotulo: tFin("kpis.payable.title"), valor: "R$ 3.180" },
              ].map((k) => (
                <div key={k.rotulo} className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground">{k.rotulo}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{k.valor}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tFin("receivables.title")}
              </p>
              <div className="space-y-1">
                {receber.map((r) => (
                  <div
                    key={r.desc}
                    className="flex items-center justify-between border-b py-1.5 text-sm last:border-b-0"
                  >
                    <span className="truncate">{r.desc}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums">R$ {r.valor}</span>
                      <Etiqueta
                        status={r.pago ? "DONE" : "OPEN"}
                        texto={tc(r.pago ? "paymentStatus.PAID" : "paymentStatus.PENDING")}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Janela>
      </div>

      <p className="text-center text-xs text-muted-foreground">{t("aviso")}</p>
    </section>
  )
}
