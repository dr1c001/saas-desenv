"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { updateTeamMemberRole, removeTeamMember } from "@/actions/team"
import { Trash2 } from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

type Props = { memberId: string; currentRole: string }

export function TeamRowActions({ memberId, currentRole }: Props) {
  const [isPending, startTransition] = useTransition()

  if (currentRole === "OWNER") return null

  function handleRoleChange(role: string | null) {
    if (!role) return
    startTransition(() =>
      updateTeamMemberRole(memberId, role as "ADMIN" | "TECHNICIAN")
    )
  }

  function handleRemove() {
    if (!confirm("Remover este membro da equipe?")) return
    startTransition(() => removeTeamMember(memberId))
  }

  return (
    <div className="flex items-center gap-2">
      <Select defaultValue={currentRole} onValueChange={handleRoleChange} disabled={isPending}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ADMIN">Administrador</SelectItem>
          <SelectItem value="TECHNICIAN">Técnico</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        className="text-destructive hover:text-destructive h-8 w-8"
        onClick={handleRemove}
        disabled={isPending}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
