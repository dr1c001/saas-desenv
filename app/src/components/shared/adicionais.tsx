import { getTranslations } from "next-intl/server"
import { Plus } from "lucide-react"
import { adicionaisAVenda } from "@/lib/adicionais"

// A secao de ADICIONAIS, usada pela tela de planos E pela landing.
//
// ─── Por que um componente so, com um interruptor ────────────────────────────
//
// Os dois lugares mostram a mesma lista, com a mesma descricao, e mudam em uma
// coisa: a landing NAO mostra preco. Duplicar o bloco criaria o dia em que o
// texto e atualizado num lugar e nao no outro — e quem le a vitrine e depois a
// tela de contratacao veria duas promessas diferentes.
//
// ─── Por que <details>, e nao um card aberto ─────────────────────────────────
//
// O pedido era "o preco aparece quando o cliente clica". `<details>` e
// exatamente isso, e de graca: funciona sem JavaScript, e acessivel por teclado
// e leitor de tela por natureza, e nao precisa de estado. Um card sempre aberto
// tambem competiria com os planos, que sao o que a pagina quer vender primeiro.

export async function Adicionais({
  mostrarPreco,
  linkContato,
}: {
  /** A landing anuncia SEM preco; a tela de planos, com. */
  mostrarPreco: boolean
  /** WhatsApp do suporte. `null` quando nao configurado — o bloco continua
   *  aparecendo, so sem o botao: saber que o recurso existe ja vale. */
  linkContato: string | null
}) {
  const t = await getTranslations("adicionais")
  const tNomes = await getTranslations("mapAdmin.admin.actions")
  const itens = adicionaisAVenda()
  if (itens.length === 0) return null

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Plus className="size-5 text-primary" />
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {itens.map((a) => (
          <details
            key={a.recurso}
            className="group rounded-xl border bg-card p-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
              {tNomes(`featureNames.${a.recurso}` as "featureNames.ia")}
              <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                {t("verDetalhes")}
              </span>
            </summary>

            <div className="mt-3 space-y-3 text-sm">
              <p className="text-muted-foreground">
                {t(`descricao.${a.recurso}` as "descricao.ia")}
              </p>

              {mostrarPreco && (
                <p className="text-lg font-semibold">
                  {a.precoMensal === null ? (
                    // `null` é SOB CONSULTA, e nunca "R$ 0,00": um adicional
                    // com custo por uso anunciado de graça seria pior que não
                    // anunciado.
                    <span className="text-base">{t("sobConsulta")}</span>
                  ) : (
                    <>
                      R$ {a.precoMensal}
                      <span className="text-sm font-normal text-muted-foreground">
                        {t("porMes")}
                      </span>
                    </>
                  )}
                </p>
              )}

              {linkContato && (
                <a
                  href={linkContato}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {t("falarComAGente")}
                </a>
              )}
            </div>
          </details>
        ))}
      </div>

      {/* Dito com todas as letras: hoje a contratacao e por conversa, e nao por
          botao. Esconder isso faria a pessoa clicar esperando checkout. */}
      <p className="text-xs text-muted-foreground">{t("comoContratar")}</p>
    </section>
  )
}
