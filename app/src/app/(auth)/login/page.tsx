"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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

export default function LoginPage() {
  const router = useRouter()
  const t = useTranslations()
  const [serverError, setServerError] = useState<string | null>(null)

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
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("auth.login.title")}</CardTitle>
          <CardDescription>{t("auth.login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
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
    </div>
  )
}
