"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { signUpUser } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const schema = z.object({
  companyName: z.string().min(2, "Nome da empresa obrigatório"),
  name: z.string().min(2, "Seu nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  termsAccepted: z.boolean().refine((v) => v === true, {
    message: "Você precisa aceitar os Termos de Uso e a Política de Privacidade",
  }),
})

type FormData = z.infer<typeof schema>

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refCode = searchParams.get("ref") ?? ""
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError(null)
    const { error, needsEmailConfirmation } = await signUpUser({
      email: data.email,
      password: data.password,
      name: data.name,
      companyName: data.companyName,
      refCode,
    })
    if (error) {
      const msg = error.toLowerCase()
      if (msg.includes("rate limit") || msg.includes("email rate")) {
        setServerError("Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.")
      } else if (msg.includes("already registered") || msg.includes("already been registered")) {
        setServerError("Este e-mail já está cadastrado. Tente fazer login.")
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
        <CardTitle className="text-2xl">Criar conta</CardTitle>
        <CardDescription>
          {refCode
            ? "Você foi indicado — ganhe 10% de desconto no seu plano!"
            : "Crie sua conta e escolha um plano para começar"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {refCode && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-700 dark:text-green-300">
            🎁 Código de indicação aplicado! Você ganhou <strong>10% de desconto</strong> no seu primeiro pagamento.
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="companyName">Nome da empresa</Label>
            <Input id="companyName" placeholder="Minha Empresa Ltda" {...register("companyName")} />
            {errors.companyName && <p className="text-sm text-destructive">{errors.companyName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Seu nome</Label>
            <Input id="name" placeholder="João Silva" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" placeholder="seu@email.com" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
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
                Li e aceito os{" "}
                <Link href="/terms" target="_blank" className="text-primary underline underline-offset-2">
                  Termos de Uso
                </Link>{" "}
                e a{" "}
                <Link href="/privacy" target="_blank" className="text-primary underline underline-offset-2">
                  Política de Privacidade
                </Link>
              </span>
            </label>
            {errors.termsAccepted && <p className="text-sm text-destructive">{errors.termsAccepted.message}</p>}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          {emailSent && (
            <p className="text-sm text-green-600">
              Conta criada! Verifique seu e-mail para confirmar o cadastro antes de entrar.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Suspense fallback={
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Criar conta</CardTitle>
            <CardDescription>Carregando...</CardDescription>
          </CardHeader>
        </Card>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
