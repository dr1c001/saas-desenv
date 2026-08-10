"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { signIn } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PublicLanguageToggle } from "@/components/layout/public-language-toggle"

function LoginForm() {
  const router = useRouter()
  const t = useTranslations()
  const searchParams = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)

  // /api/auth/confirm manda pra cá com ?error=... quando o link de convite ou
  // de recuperação já foi usado (os links do Supabase são de uso único). Essa
  // mensagem NUNCA era lida: o convidado via só a tela de login limpa, sem
  // explicação, com "Cadastrar empresa" em destaque — e acabava criando uma
  // empresa nova em vez de entrar na do empregador.
  // (Relatado por cliente em 08/08/2026.)
  const linkNotice = searchParams.get("error")

  // Schema construído dentro do componente pois as mensagens de validação
  // do zod vêm do next-intl (precisam de acesso ao `t`).
  const schema = z.object({
    email: z.string().email(t("auth.validation.invalidEmail")),
    password: z.string().min(6, t("auth.validation.minPasswordLength")),
  })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError(null)
    const { error, errorCode } = await signIn(data.email, data.password)
    if (errorCode === "RATE_LIMIT") {
      setServerError(t("auth.login.errors.rateLimit"))
      return
    }
    if (error) {
      const msg = error.toLowerCase()
      if (msg.includes("email not confirmed")) {
        setServerError(t("auth.login.errors.emailNotConfirmed"))
      } else if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
        setServerError(t("auth.login.errors.invalidCredentials"))
      } else if (msg.includes("rate limit") || msg.includes("too many")) {
        setServerError(t("auth.login.errors.rateLimit"))
      } else {
        setServerError(error)
      }
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
          {linkNotice && (
            <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              {linkNotice}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.login.emailLabel")}</Label>
              <Input id="email" type="email" placeholder={t("auth.login.emailPlaceholder")} {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.login.passwordLabel")}</Label>
                <Link href="/forgot-password" className="text-xs text-primary underline-offset-4 hover:underline">
                  {t("auth.login.forgotPasswordLink")}
                </Link>
              </div>
              <Input id="password" type="password" {...register("password")} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t.rich("auth.login.noAccount", {
              link: (chunks) => (
                <Link href="/register" className="text-primary underline-offset-4 hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
      </CardContent>
    </Card>
  )
}

// useSearchParams exige Suspense no App Router — mesmo padrão já usado na
// página de cadastro.
export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/40">
      <PublicLanguageToggle className="self-center" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
