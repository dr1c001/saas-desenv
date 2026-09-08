import Link from "next/link"
import { getAcoes, getPermissions } from "@/actions/permissions"
import { PermissionsForm } from "@/components/settings/permissions-form"
import { AcoesForm } from "@/components/settings/acoes-form"
import { getTenant } from "@/lib/auth"
import { CARGOS_CONFIGURAVEIS, ehCargo } from "@/lib/cargos"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ cargo?: string }>
}) {
  const { role } = await getTenant()
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard")

  const t = await getTranslations("settingsAdvanced.permissions")
  const tCargos = await getTranslations("cargos")

  // Técnico por padrão: era o único cargo configurável até existirem os outros,
  // então quem já conhecia esta tela a encontra igual ao que deixou.
  const { cargo: pedido } = await searchParams
  const cargo =
    pedido && ehCargo(pedido) && (CARGOS_CONFIGURAVEIS as readonly string[]).includes(pedido)
      ? pedido
      : "TECHNICIAN"

  const [permissions, acoes] = await Promise.all([getPermissions(cargo), getAcoes(cargo)])

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* A escolha do cargo vem ANTES de tudo, e por links e não por menu: o
          endereço passa a dizer qual cargo está aberto, então dá para voltar,
          recarregar e mandar o link para alguém sem a tela mudar de assunto. */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("escolhaCargo")}
        </p>
        <div className="flex flex-wrap gap-2">
          {CARGOS_CONFIGURAVEIS.map((c) => (
            <Link
              key={c}
              href={`/settings/permissions?cargo=${c}`}
              aria-current={c === cargo ? "page" : undefined}
              className={
                c === cargo
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              }
            >
              {tCargos(c as "TECHNICIAN")}
            </Link>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("configurando", { cargo: tCargos(cargo as "TECHNICIAN") })}
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("abasTitle")}</h2>
        <PermissionsForm cargo={cargo} permissions={permissions} />
      </div>

      {/* Segunda seção, e não uma lista só: quais abas a pessoa ENXERGA e o que
          ela FAZ dentro delas são perguntas diferentes, e misturar as duas em
          uma lista de vinte e sete caixas esconderia justamente a que mais
          importa (editar o valor da OS). */}
      <AcoesForm cargo={cargo} acoes={acoes} />
    </div>
  )
}
