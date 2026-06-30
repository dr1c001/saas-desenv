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

const roleConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  OWNER: { label: "Proprietário", variant: "default" },
  ADMIN: { label: "Administrador", variant: "default" },
  TECHNICIAN: { label: "Técnico", variant: "secondary" },
}

export default async function TeamPage() {
  const [members, { role }] = await Promise.all([getTeamMembers(), getTenant()])
  const isAdmin = role === "OWNER" || role === "ADMIN"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie os membros da sua equipe e seus acessos</p>
        </div>
        {isAdmin && (
          <Link href="/team/invite" className={buttonVariants()}>
            <UserPlus className="size-4 mr-2" />
            Convidar membro
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{members.length} membro{members.length !== 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Desde</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant={roleConfig[m.role]?.variant ?? "outline"}>
                      {roleConfig[m.role]?.label ?? m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.location ? (
                      <span className="flex items-center gap-1 text-green-700">
                        <MapPin className="size-3" />
                        {formatDate(m.location.updatedAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sem localização</span>
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
