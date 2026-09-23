"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Onde o convite de equipe TERMINA.
//
// Antes o link do e-mail levava direto ao /dashboard. A pessoa entrava, usava o
// sistema, fechava — e não tinha senha nenhuma: a sessão viera do link, não de
// um cadastro. Na volta, ela ia ao e-mail e clicava no link de novo. Os links
// do Supabase são de USO ÚNICO e expiram; quando isso acontecia, o integrante
// ficava trancado para fora da empresa que paga, e o dono precisava convidar
// tudo outra vez (o que, por sinal, a Action recusava: o e-mail já estava na
// equipe).
//
// Esta tela faz do link uma coisa só: a pessoa escolhe a própria senha, e a
// partir daí entra como todo mundo. É irmã de /reset-password — mesma mecânica,
// texto diferente: aqui ninguém está recuperando nada, está criando.
// (Relatado pelo dono da plataforma em 23/09/2026.)
export default function CriarSenhaPage() {
  const router = useRouter()
  const t = useTranslations("auth.criarSenha")
  const tcommon = useTranslations("common")
  const tv = useTranslations("auth.validation")
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [temSessao, setTemSessao] = useState<boolean | null>(null)

  // Schema construído dentro do componente pois as mensagens de validação
  // do zod vêm do next-intl (precisam de acesso ao `t`).
  const schema = z
    .object({
      password: z.string().min(6, tv("minPasswordLength")),
      confirmPassword: z.string().min(6, tv("minPasswordLength")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: tv("passwordMismatch"),
      path: ["confirmPassword"],
    })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setTemSessao(!!user))
  }, [])

  async function onSubmit(data: FormData) {
    setServerError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setServerError(error.message)
      return
    }
    setSuccess(true)
    setTimeout(() => {
      router.push("/dashboard")
      router.refresh()
    }, 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {temSessao === false && (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{t("invalidLink")}</p>
              <Link
                href="/login"
                className="block text-center text-sm text-primary underline-offset-4 hover:underline"
              >
                {t("backToLogin")}
              </Link>
            </div>
          )}

          {temSessao && !success && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t("confirmPasswordLabel")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
              {serverError && <p className="text-sm text-destructive">{serverError}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? tcommon("saving") : t("submit")}
              </Button>
            </form>
          )}

          {success && <p className="text-sm text-green-600">{t("success")}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
