import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Pencil } from "lucide-react"
import { getTenant } from "@/lib/auth"
import { getFornecedor } from "@/actions/fornecedores"
import { formatarDocumento } from "@/lib/documento"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// A ficha do fornecedor.
//
// O que ela responde e nenhuma outra tela respondia: "quanto eu já comprei
// desse cara, e quando ele me deu preço". Os dados sempre existiram — a ordem
// de compra guarda o fornecedor e a cotação guarda quem participou —, só não
// havia onde olhar por fornecedor.

export default async function FichaDoFornecedorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { role } = await getTenant()
  const { id } = await params
  const f = await getFornecedor(id)
  if (!f) notFound()

  const t = await getTranslations("fornecedores")
  const isAdmin = role === "OWNER" || role === "ADMIN"

  const endereco = [
    [f.street, f.number].filter(Boolean).join(", "),
    f.complement,
    f.district,
    [f.city, f.state].filter(Boolean).join("/"),
    f.zipCode,
  ]
    .filter(Boolean)
    .join(" · ")

  const totalComprado = f.purchaseOrders.reduce((s, c) => s + Number(c.total), 0)

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{f.name}</h1>
            {!f.active && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {t("inativo")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {[f.legalName, f.document ? formatarDocumento(f.document) : null, f.category]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" variant="outline" render={<Link href={`/fornecedores/${f.id}/editar`} />}>
            <Pencil className="size-4 mr-1.5" />
            {t("editar")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Ficha titulo={t("blocos.contato")}>
          <Linha rotulo={t("campos.telefone")} valor={f.phone} />
          <Linha rotulo={t("campos.email")} valor={f.email} />
          <Linha rotulo={t("campos.contato")} valor={f.contactName} />
          <Linha rotulo={t("campos.contatoTelefone")} valor={f.contactPhone} />
          <Linha rotulo={t("campos.site")} valor={f.website} />
        </Ficha>

        <Ficha titulo={t("blocos.comercial")}>
          <Linha rotulo={t("campos.pagamento")} valor={f.paymentTerms} />
          <Linha
            rotulo={t("campos.prazo")}
            valor={f.leadTimeDays === null ? null : t("prazoDias", { dias: f.leadTimeDays })}
          />
          <Linha rotulo={t("campos.pix")} valor={f.pixKey} />
          <Linha
            rotulo={t("campos.banco")}
            valor={[f.bankName, f.bankAgency, f.bankAccount].filter(Boolean).join(" · ") || null}
          />
        </Ficha>

        {endereco && (
          <Ficha titulo={t("blocos.endereco")} className="sm:col-span-2">
            <p className="text-sm">{endereco}</p>
          </Ficha>
        )}

        {f.notes && (
          <Ficha titulo={t("blocos.observacoes")} className="sm:col-span-2">
            <p className="whitespace-pre-wrap text-sm">{f.notes}</p>
          </Ficha>
        )}
      </div>

      {/* ─── O histórico, que é o motivo da ficha existir ─────────────────── */}
      <Ficha titulo={t("historico.compras")}>
        {f.purchaseOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("historico.semCompras")}</p>
        ) : (
          <>
            <p className="mb-2 text-sm">
              {t("historico.totalComprado", { valor: formatCurrency(totalComprado) })}
            </p>
            <ul className="divide-y text-sm">
              {f.purchaseOrders.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/purchases/${c.id}`} className="font-mono text-xs hover:underline">
                    #{String(c.number).padStart(4, "0")}
                  </Link>
                  <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                  <span className="tabular-nums">{formatCurrency(Number(c.total))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Ficha>

      <Ficha titulo={t("historico.cotacoes")}>
        {f.quotations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("historico.semCotacoes")}</p>
        ) : (
          <ul className="divide-y text-sm">
            {f.quotations.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/cotacoes/${p.quotation.id}`} className="hover:underline">
                  <span className="font-mono text-xs">
                    #{String(p.quotation.number).padStart(4, "0")}
                  </span>{" "}
                  {p.quotation.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {p.respondedAt ? t("historico.respondeu") : t("historico.naoRespondeu")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Ficha>
    </div>
  )
}

function Ficha({
  titulo,
  className,
  children,
}: {
  titulo: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-2 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </p>
        {children}
      </CardContent>
    </Card>
  )
}

/** Linha em branco não aparece: ficha cheia de "—" é ruído. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{rotulo}: </span>
      {valor}
    </p>
  )
}
