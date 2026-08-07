"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "@/actions/auth"
import { PublicLanguageToggle } from "@/components/layout/public-language-toggle"

export default function ForgotPasswordPage() {
  const t = useTranslations()
  const [sent, setSent] = useState(false)

  // Schema construído dentro do componente pois as mensagens de validação
  // do zod vêm do next-intl (precisam de acesso ao `t`).
  const schema = z.object({
    email: z.string().email(t("auth.validation.invalidEmail")),
  })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    // A action devolve sempre o mesmo resultado genérico, exista ou não o
    // e-mail (não vazar quais e-mails são cadastrados) — então a confirmação
    // aqui também é sempre a mesma, agora traduzida pelo next-intl.
    await requestPasswordReset(data.email)
    setSent(true)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/40">
      <PublicLanguageToggle className="self-center" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("auth.forgotPassword.title")}</CardTitle>
          <CardDescription>{t("auth.forgotPassword.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="text-sm text-green-600">{t("auth.forgotPassword.genericResult")}</p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth.forgotPassword.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.forgotPassword.emailPlaceholder")}
                  {...register("email")}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("auth.forgotPassword.submitting") : t("auth.forgotPassword.submit")}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t.rich("auth.forgotPassword.rememberedPassword", {
              link: (chunks) => (
                <Link href="/login" className="text-primary underline-offset-4 hover:underline">
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
