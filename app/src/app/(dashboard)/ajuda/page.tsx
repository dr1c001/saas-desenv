import { getLocale, getTranslations } from "next-intl/server"
import { MANUAL, pedacos, type Bloco, type Verbete } from "@/lib/manual"
import { AlertTriangle } from "lucide-react"
import { getMinhasDuvidas } from "@/actions/duvidas"
import { MinhasDuvidas } from "@/components/duvidas/minhas-duvidas"

// A tela de ajuda. O conteúdo mora em lib/manual.ts, e aqui só se desenha.
//
// SEM porta: nenhuma checagem de papel, de aba ou de plano. Ajuda que só
// aparece para quem já sabe usar o sistema não é ajuda — e o técnico em campo,
// que é quem tem menos abas liberadas, é justamente quem mais precisa dela.
//
// Cada verbete tem uma âncora vinda do código da tela (/ajuda#3-4), e é assim
// que o botão da barra lateral abre o manual já no ponto certo.

export default async function AjudaPage() {
  const t = await getTranslations("ajuda")
  const locale = await getLocale()
  const duvidas = await getMinhasDuvidas()

  return (
    <div className="max-w-3xl space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>

      {/* Antes do manual, e nao depois: quem abre esta tela com uma pergunta
          na cabeca nao quer rolar sete secoes ate achar onde perguntar. */}
      <MinhasDuvidas
        duvidas={duvidas.map((d) => ({
          id: d.id,
          status: d.status,
          lastMessageAt: d.lastMessageAt.toISOString(),
          lastMessageFrom: d.lastMessageFrom,
          readByClientAt: d.readByClientAt?.toISOString() ?? null,
          mensagens: d.messages.map((m) => ({
            id: m.id,
            kind: m.kind,
            body: m.body,
            authorName: m.authorName,
          })),
        }))}
      />

      {/* O conteúdo do manual só existe em português. Dizer isso é melhor que
          mostrar uma tela vazia — ou, pior, meia tradução. */}
      {locale !== "pt" && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          {t("soEmPortugues")}
        </p>
      )}

      <nav aria-label={t("indice")} className="rounded-lg border p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("indice")}
        </p>
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {MANUAL.flatMap((s) => s.verbetes).map((v) => (
            <li key={v.id}>
              <a
                href={`#${v.id}`}
                className="flex items-baseline gap-2 rounded py-0.5 text-sm hover:text-primary"
              >
                <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {v.codigo ?? "—"}
                </span>
                <span className="truncate">{v.titulo}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {MANUAL.map((secao) => (
        <section key={secao.titulo} className="space-y-8">
          <div className="flex items-baseline gap-3 border-b-2 border-foreground pb-2">
            <span className="font-mono text-3xl font-semibold leading-none text-primary tabular-nums">
              {secao.numero ?? "—"}
            </span>
            <h2 className="text-xl font-bold">{secao.titulo}</h2>
            <span className="ml-auto text-sm text-muted-foreground">{secao.descricao}</span>
          </div>

          {secao.verbetes.map((v) => (
            <VerbeteNaTela key={v.id} verbete={v} />
          ))}
        </section>
      ))}
    </div>
  )
}

function VerbeteNaTela({ verbete }: { verbete: Verbete }) {
  return (
    <article id={verbete.id} className="scroll-mt-6 space-y-3 border-b pb-8 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-2">
        {verbete.codigo && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-sm font-semibold tabular-nums text-primary">
            {verbete.codigo}
          </span>
        )}
        <h3 className="text-lg font-semibold">{verbete.titulo}</h3>
        {verbete.etiqueta && (
          <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {verbete.etiqueta}
          </span>
        )}
      </div>

      <p className="text-muted-foreground">
        <Texto texto={verbete.resumo} />
      </p>

      {verbete.blocos.map((b, i) => (
        <BlocoNaTela key={i} bloco={b} />
      ))}
    </article>
  )
}

function BlocoNaTela({ bloco }: { bloco: Bloco }) {
  switch (bloco.tipo) {
    case "p":
      return (
        <p>
          <Texto texto={bloco.texto} />
        </p>
      )

    case "lista":
      return (
        <div className="space-y-1.5">
          {bloco.titulo && <Rotulo>{bloco.titulo}</Rotulo>}
          <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
            {bloco.itens.map((it, i) => (
              <li key={i}>
                <Texto texto={it} />
              </li>
            ))}
          </ul>
        </div>
      )

    case "passos":
      return (
        <div className="space-y-1.5">
          {bloco.titulo && <Rotulo>{bloco.titulo}</Rotulo>}
          <ol className="space-y-2">
            {bloco.itens.map((it, i) => (
              <li key={i} className="grid grid-cols-[1.75rem_1fr] items-baseline gap-2">
                <span className="rounded bg-primary/10 text-center font-mono text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <Texto texto={it} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      )

    case "fluxo":
      return (
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {bloco.etapas.map((e, i) => (
            <span key={e} className="contents">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span
                className={`rounded border px-2 py-1 ${
                  i === bloco.etapas.length - 1 ? "border-primary text-primary" : ""
                }`}
              >
                {e}
              </span>
            </span>
          ))}
          {bloco.morto && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="rounded border border-dashed px-2 py-1 text-muted-foreground">
                {bloco.morto}
              </span>
            </>
          )}
        </div>
      )

    case "tabela":
      return (
        // A tabela rola dentro da própria caixa: sem isto, uma tabela larga
        // empurra a página inteira para o lado no celular.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr>
                {bloco.cabecalho.map((c) => (
                  <th
                    key={c}
                    className="border-b py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloco.linhas.map((linha, i) => (
                <tr key={i}>
                  {linha.map((celula, j) => (
                    <td key={j} className="border-b py-2 pr-4 align-top">
                      {j === 0 ? (
                        <span className="font-mono text-xs text-primary">{celula}</span>
                      ) : (
                        <Texto texto={celula} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case "atencao":
      return (
        <div className="flex gap-3 rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="space-y-1">
            <p className="font-semibold">{bloco.titulo}</p>
            <p>
              <Texto texto={bloco.texto} />
            </p>
          </div>
        </div>
      )
  }
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  )
}

/** Desenha o texto do manual, com `*assim*` virando negrito.
 *  Sem HTML no conteúdo — ver o porquê em lib/manual.ts. */
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {pedacos(texto).map((p, i) =>
        p.forte ? (
          <strong key={i} className="font-semibold">
            {p.texto}
          </strong>
        ) : (
          <span key={i}>{p.texto}</span>
        )
      )}
    </>
  )
}
