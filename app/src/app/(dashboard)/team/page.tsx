import Link from "next/link"
import { getTeamMembers } from "@/actions/team"
import { getTenant } from "@/lib/auth"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { UserPlus, MapPin } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { TeamRowActions } from "@/components/team/team-row-actions"
import { getTranslations } from "next-intl/server"

// Rótulos vêm de common.roles (i18n); aqui só a variante visual do Badge por papel.
const roleVariant: Record<string, "default" | "secondary" | "outline"> = {
  OWNER: "default",
  ADMIN: "default",
  TECHNICIAN: "secondary",
}

export default async function TeamPage() {
  const [members, { role }] = await Promise.all([getTeamMembers(), getTenant()])
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
        <CardHeader>
          <CardTitle className="text-base">{t("list.countMembers", { count: members.length })}</CardTitle>
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
                      <TeamRowActions memberId={m.id} currentRole={m.role} />
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
