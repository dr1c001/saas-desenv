"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { signUpUser } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PublicLanguageToggle } from "@/components/layout/public-language-toggle"

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refCode = searchParams.get("ref") ?? ""
  const t = useTranslations()
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  // Schema construído dentro do componente pois as mensagens de validação
  // do zod vêm do next-intl (precisam de acesso ao `t`).
  const schema = z.object({
    companyName: z.string().min(2, t("auth.validation.companyNameRequired")),
    name: z.string().min(2, t("auth.validation.nameRequired")),
    email: z.string().email(t("auth.validation.invalidEmail")),
    password: z.string().min(6, t("auth.validation.minPasswordLength")),
    termsAccepted: z.boolean().refine((v) => v === true, {
      message: t("auth.validation.termsRequired"),
    }),
  })

  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError(null)
    const { error, errorCode, needsEmailConfirmation } = await signUpUser({
      email: data.email,
      password: data.password,
      name: data.name,
      companyName: data.companyName,
      refCode,
    })
    if (errorCode === "RATE_LIMIT") {
      setServerError(t("auth.register.errors.rateLimit"))
      return
    }
    if (error) {
      const msg = error.toLowerCase()
      if (msg.includes("rate limit") || msg.includes("email rate")) {
        setServerError(t("auth.register.errors.rateLimit"))
      } else if (msg.includes("already registered") || msg.includes("already been registered")) {
        setServerError(t("auth.register.errors.alreadyRegistered"))
      } else {
        setServerError(error)
      }
      return
    }
    if (!needsEmailConfirmation) {
      router.push("/billing")
      router.refresh()
      return
    }
    setEmailSent(true)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t("auth.register.title")}</CardTitle>
        <CardDescription>
          {refCode ? t("auth.register.subtitleWithRef") : t("auth.register.subtitleDefault")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {refCode && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-700 dark:text-green-300">
            {t.rich("auth.register.refBanner", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="companyName">{t("auth.register.companyNameLabel")}</Label>
            <Input
              id="companyName"
              placeholder={t("auth.register.companyNamePlaceholder")}
              {...register("companyName")}
            />
            {errors.companyName && <p className="text-sm text-destructive">{errors.companyName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("auth.register.nameLabel")}</Label>
            <Input id="name" placeholder={t("auth.register.namePlaceholder")} {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.register.emailLabel")}</Label>
            <Input id="email" type="email" placeholder={t("auth.register.emailPlaceholder")} {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.register.passwordLabel")}</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 text-sm text-muted-foreground select-none">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                {...register("termsAccepted")}
              />
              <span>
                {t.rich("auth.register.termsAgreement", {
                  termsLink: (chunks) => (
                    <Link href="/terms" target="_blank" className="text-primary underline underline-offset-2">
                      {chunks}
                    </Link>
                  ),
                  privacyLink: (chunks) => (
                    <Link href="/privacy" target="_blank" className="text-primary underline underline-offset-2">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
            {errors.termsAccepted && <p className="text-sm text-destructive">{errors.termsAccepted.message}</p>}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          {emailSent && (
            <p className="text-sm text-green-600">
              {t("auth.register.emailSentMessage")}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t.rich("auth.register.haveAccount", {
            link: (chunks) => (
              <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </CardContent>
    </Card>
  )
}

export default function RegisterPage() {
  const t = useTranslations()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/40">
      <PublicLanguageToggle className="self-center" />
      <Suspense fallback={
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">{t("auth.register.title")}</CardTitle>
            <CardDescription>{t("common.loading")}</CardDescription>
          </CardHeader>
        </Card>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
