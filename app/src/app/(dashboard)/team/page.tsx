import Link from "next/link"
import { getTeamMembers } from "@/actions/team"
import { getTenant } from "@/lib/auth"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { UserPlus, MapPin } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { TeamRowActions } from "@/components/team/team-row-actions"
import { SearchBar } from "@/components/shared/search-bar"
import { getTranslations } from "next-intl/server"

// Rótulos vêm de common.roles (i18n); aqui só a variante visual do Badge por papel.
const roleVariant: Record<string, "default" | "secondary" | "outline"> = {
  OWNER: "default",
  ADMIN: "default",
  TECHNICIAN: "secondary",
}

type SearchParams = Promise<{ q?: string | string[] }>

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  // ?q=a&q=b chega como ARRAY. Tipar como string e passar adiante fazia o
  // `.trim()` de getTeamMembers estourar e a página inteira responder 500 —
  // por uma URL que qualquer um monta.
  const busca = (await searchParams).q
  const q = Array.isArray(busca) ? busca[0] : busca
  const [members, { role, userId }] = await Promise.all([getTeamMembers({ q }), getTenant()])
  const isAdmin = role === "OWNER" || role === "ADMIN"
  const t = await getTranslations("team")
  const tc = await getTranslations("common")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("list.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("list.subtitle")}</p>
        </div>
        {isAdmin && (
          <Link href="/team/invite" className={buttonVariants()}>
            <UserPlus className="size-4 mr-2" />
            {t("list.inviteButton")}
          </Link>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">{t("list.countMembers", { count: members.length })}</CardTitle>
          <SearchBar placeholder={t("list.searchPlaceholder")} />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("list.columns.name")}</TableHead>
                <TableHead>{t("list.columns.email")}</TableHead>
                <TableHead>{t("list.columns.role")}</TableHead>
                <TableHead>{t("list.columns.location")}</TableHead>
                <TableHead>{t("list.columns.since")}</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-sm text-muted-foreground py-10">
                    {t("list.emptyFiltered")}
                  </TableCell>
                </TableRow>
              )}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleVariant[m.role] ?? "outline"}>
                      {tc(`roles.${m.role}` as "roles.OWNER")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.location ? (
                      <span className="flex items-center gap-1 text-green-700">
                        <MapPin className="size-3" />
                        {formatDate(m.location.updatedAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("list.noLocation")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(m.createdAt)}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <TeamRowActions
                        memberId={m.id}
                        memberName={m.name}
                        currentRole={m.role}
                        ehVoce={m.id === userId}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
