import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getTeamMember } from "@/actions/team"
import { getTenant } from "@/lib/auth"
import { TeamEditForm } from "@/components/team/team-edit-form"

export default async function EditTeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [membro, { role, userId }] = await Promise.all([getTeamMember(id), getTenant()])
  if (!membro) notFound()

  // Mesma trava das Actions de equipe. A Action se defende sozinha — ela é um
  // endereço HTTP próprio —, e isto aqui só evita que quem não pode editar
  // chegue a ver o formulário. (Ver actions/team.ts, `atualizarIntegrante`.)
  if (role !== "OWNER" && role !== "ADMIN") redirect("/team")

  const t = await getTranslations("team")

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t("edit.title")}</h1>
      <TeamEditForm
        membro={membro}
        // O cargo do dono não muda, e ninguém muda o próprio: as duas travas
        // vivem na Action, e o formulário só explica por que o campo está
        // desligado em vez de deixar salvar e voltar calado.
        cargoTravado={
          membro.role === "OWNER" ? "owner" : membro.id === userId ? "self" : null
        }
      />
    </div>
  )
}
