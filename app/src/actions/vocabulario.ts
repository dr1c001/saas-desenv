"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getTenant, requireActiveSubscription } from "@/lib/auth"
import {
  lerVocabulario,
  normalizarTermo,
  validarTermo,
  VOCABULARIO_PADRAO,
  type Vocabulario,
} from "@/lib/vocabulario"

export type EstadoVocabulario = { erro?: string; ok?: boolean }

export async function getVocabulario(): Promise<Vocabulario> {
  const { tenantId } = await getTenant()
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { locale: true, vocabulary: true },
  })
  return lerVocabulario(tenant?.vocabulary, tenant?.locale === "en" ? "en" : "pt")
}

export async function salvarVocabulario(
  _prev: EstadoVocabulario,
  formData: FormData
): Promise<EstadoVocabulario> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  // Como o sistema inteiro se chama muda para TODA a equipe de uma vez, e não
  // é o técnico em campo que decide isso.
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  const ler = (nome: string) => String(formData.get(nome) ?? "")
  const entrada = {
    os: {
      curto: ler("osCurto"),
      singular: ler("osSingular"),
      plural: ler("osPlural"),
      genero: ler("osGenero"),
    },
    tec: {
      curto: ler("tecCurto"),
      singular: ler("tecSingular"),
      plural: ler("tecPlural"),
      genero: ler("tecGenero"),
    },
  }

  for (const termo of [entrada.os, entrada.tec]) {
    const problema = validarTermo(termo)
    if (problema) return { erro: problema }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      vocabulary: {
        os: normalizarTermo(entrada.os),
        tec: normalizarTermo(entrada.tec),
      },
    },
  })

  // O vocabulário entra nas mensagens no carregamento da requisição, então o
  // sistema inteiro muda de nome — não só esta tela. revalidatePath("/",
  // "layout") derruba o cache de todas as rotas do dashboard de uma vez.
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function restaurarVocabulario(): Promise<EstadoVocabulario> {
  const { tenantId, role } = await getTenant()
  await requireActiveSubscription(tenantId)
  if (role !== "OWNER" && role !== "ADMIN") return { erro: "semPermissao" }

  // NULL no banco, não o objeto padrão gravado: assim uma mudança futura no
  // padrão do sistema alcança quem nunca customizou, em vez de congelar o
  // texto de hoje na conta dela.
  //
  // Prisma.DbNull e não `null`: em coluna Json, `null` é ambíguo (pode
  // significar "o valor JSON null"), então o Prisma exige dizer qual dos dois.
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { vocabulary: Prisma.DbNull },
  })
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function getVocabularioPadrao(): Promise<Vocabulario> {
  const { tenantId } = await getTenant()
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { locale: true },
  })
  return VOCABULARIO_PADRAO[tenant?.locale === "en" ? "en" : "pt"]
}
