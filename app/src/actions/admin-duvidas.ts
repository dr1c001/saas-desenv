"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/admin"
import { notificar } from "@/lib/notificar"
import { podeEscrever, problemaNoTexto, resumo } from "@/lib/duvida"

// O lado do PAINEL do canal de dúvida.
//
// Separado de actions/duvidas.ts de propósito: aqui toda função exige
// `requireSuperAdmin("atenderDuvida")`, lá toda função é do tenant logado. Num
// arquivo só, as duas guardas conviveriam lado a lado — e é assim que um dia
// uma função chama a errada.
//
// `atenderDuvida` e não `verPainel`: a dúvida carrega o que a empresa está
// tentando fazer no sistema, e isso não é assunto de quem cuida de cobrança
// (FINANCEIRO) nem de quem vende (COMERCIAL). O suporte lê; o financeiro não.

export type EstadoResposta = { erro?: string; ok?: boolean }

/** A fila: quem espera resposta primeiro, do mais antigo para o mais novo. */
export async function getFilaDeDuvidas(filtro?: string) {
  await requireSuperAdmin("atenderDuvida")

  // Sem filtro, a fila mostra o que ainda está vivo: fechada é histórico, e
  // deixá-la na fila afogaria o que espera resposta.
  const escolhido = ["ABERTA", "RESPONDIDA", "FECHADA"].includes(String(filtro))
    ? (filtro as "ABERTA" | "RESPONDIDA" | "FECHADA")
    : null
  const status = escolhido
    ? { status: escolhido }
    : { status: { not: "FECHADA" as const } }

  return prisma.supportThread.findMany({
    where: status,
    select: {
      id: true,
      tenantId: true,
      tenantName: true,
      authorName: true,
      authorRole: true,
      planName: true,
      subscriptionStatus: true,
      screenRoute: true,
      screenCode: true,
      status: true,
      messageCount: true,
      lastMessageAt: true,
      lastMessageFrom: true,
      createdAt: true,
      messages: { take: 1, orderBy: { createdAt: "asc" }, select: { body: true } },
    },
    // Quem espera resposta primeiro; dentro disso, o mais ANTIGO na frente —
    // quem está esperando há mais tempo é quem mais precisa ser atendido, e
    // ordenar pelo mais recente enterraria justamente esse.
    orderBy: [{ status: "asc" }, { lastMessageAt: "asc" }],
    take: 100,
  })
}

export async function getDuvida(id: string) {
  await requireSuperAdmin("atenderDuvida")
  return prisma.supportThread.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  })
}

/** Quantas esperam resposta agora. Para o contador no menu do painel. */
export async function contarDuvidasAbertas(): Promise<number> {
  await requireSuperAdmin("atenderDuvida")
  return prisma.supportThread.count({ where: { status: "ABERTA" } })
}

/**
 * Responde, e avisa quem perguntou.
 *
 * O aviso ao cliente vai pelo `notificar` de sempre, com público
 * "responsavel" mirando o autor — assim ele herda o que já existe: a
 * preferência de silenciar por pessoa, o modo sem som, e a trava de quem
 * desligou notificação na empresa. Um caminho próprio aqui ignoraria os três.
 */
export async function responderDuvida(
  id: string,
  _prev: EstadoResposta,
  formData: FormData
): Promise<EstadoResposta> {
  const admin = await requireSuperAdmin("atenderDuvida")

  const texto = String(formData.get("texto") ?? "").trim()
  const problema = problemaNoTexto(texto)
  if (problema) return { erro: problema }

  const duvida = await prisma.supportThread.findUnique({
    where: { id },
    select: { id: true, tenantId: true, authorId: true, messageCount: true },
  })
  if (!duvida) return { erro: "naoEncontrado" }
  // Vale para os DOIS lados: um limite que o dono pode furar não é limite.
  if (!podeEscrever(duvida.messageCount)) return { erro: "conversaCheia" }

  const agora = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({
      data: {
        threadId: id,
        kind: "PLATAFORMA",
        body: texto,
        authorName: admin.name,
        authorEmail: admin.email,
      },
    })
    await tx.supportThread.update({
      where: { id },
      data: {
        status: "RESPONDIDA",
        messageCount: { increment: 1 },
        lastMessageAt: agora,
        lastMessageFrom: "PLATAFORMA",
        // A resposta é nova para o cliente: zera a leitura dele.
        readByClientAt: null,
      },
    })
  })

  // A empresa pode ter sido apagada e a conversa sobrevivido (SET NULL) — aí
  // não há a quem avisar, e isso não é erro.
  if (duvida.tenantId && duvida.authorId) {
    after(
      notificar({
        tenantId: duvida.tenantId,
        evento: "duvidaRespondida",
        corpo: resumo(texto),
        url: "/ajuda#duvidas",
        referencia: id,
        responsavelId: duvida.authorId,
      })
    )
  }

  revalidatePath("/admin/duvidas")
  revalidatePath(`/admin/duvidas/${id}`)
  return { ok: true }
}

/** Encerra pelo painel. O cliente reabre escrevendo de novo. */
export async function fecharDuvida(id: string): Promise<EstadoResposta> {
  const admin = await requireSuperAdmin("atenderDuvida")
  const r = await prisma.supportThread.updateMany({
    where: { id, status: { not: "FECHADA" } },
    data: { status: "FECHADA", closedAt: new Date(), closedBy: admin.email },
  })
  if (r.count === 0) return { erro: "naoEncontrado" }
  revalidatePath("/admin/duvidas")
  revalidatePath(`/admin/duvidas/${id}`)
  return { ok: true }
}
