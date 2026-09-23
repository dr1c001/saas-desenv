"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { getTenant } from "@/lib/auth"
import { avisarPlataforma } from "@/lib/avisar-plataforma"
import {
  podeAbrirNova,
  podeEscrever,
  problemaNoTexto,
  resumo,
  statusApos,
  telaCanonica,
} from "@/lib/duvida"

// O lado do CLIENTE do canal de dúvida.
//
// O lado do painel está em actions/admin-duvidas.ts, e a separação não é
// estética: lá toda função exige `requireSuperAdmin`, aqui toda função é do
// tenant logado. Um arquivo só faria as duas checagens conviverem no mesmo
// lugar, e é assim que um dia uma chama a guarda errada.
//
// Toda export aqui é endereço HTTP despachável, e cada uma se defende sozinha.

export type EstadoDuvida = { erro?: string; ok?: boolean; id?: string }

/**
 * `requireActiveSubscription` fica de FORA de propósito.
 *
 * "Não consigo pagar" e "minha assinatura caiu, e agora?" são exatamente as
 * perguntas de quem está sem assinatura ativa. Trancar o canal de ajuda atrás
 * do pagamento é fechar a porta na cara de quem mais precisa falar — e é a
 * pergunta que mais interessa ao dono ouvir.
 */
async function contexto() {
  return getTenant()
}

export async function getMinhasDuvidas() {
  const { tenantId } = await contexto()
  return prisma.supportThread.findMany({
    where: { tenantId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
    take: 50,
  })
}

/**
 * Abre uma dúvida.
 *
 * Grava o RETRATO do momento — nome da empresa, de quem perguntou, cargo,
 * plano e situação da assinatura. Guardado, e não lido depois: "por que não
 * vejo o mapa?" só faz sentido junto do plano que a empresa TINHA quando
 * perguntou. Um upgrade no dia seguinte faria a pergunta parecer maluca.
 */
export async function abrirDuvida(
  _prev: EstadoDuvida,
  formData: FormData
): Promise<EstadoDuvida> {
  const { tenantId, userId } = await contexto()

  const texto = String(formData.get("texto") ?? "").trim()
  const problema = problemaNoTexto(texto)
  if (problema) return { erro: problema }

  const abertas = await prisma.supportThread.count({
    where: { tenantId, status: { in: ["ABERTA", "RESPONDIDA"] } },
  })
  if (!podeAbrirNova(abertas)) return { erro: "muitasAbertas" }

  const [empresa, autor] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, subscriptionStatus: true, plan: { select: { name: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, role: true },
    }),
  ])
  if (!empresa || !autor) return { erro: "naoEncontrado" }

  // A tela vem do navegador: passa pelo catálogo, e o que não estiver nele
  // vira nulo. Sem isto entraria id de OS e de cliente final no painel.
  const tela = telaCanonica(formData.get("tela"))
  const agora = new Date()

  const duvida = await prisma.supportThread.create({
    data: {
      tenantId,
      authorId: userId,
      tenantName: empresa.name,
      authorName: autor.name,
      authorEmail: autor.email,
      authorRole: autor.role,
      planName: empresa.plan?.name ?? null,
      subscriptionStatus: empresa.subscriptionStatus,
      screenRoute: tela?.rota ?? null,
      screenCode: tela?.codigo ?? null,
      status: "ABERTA",
      messageCount: 1,
      lastMessageAt: agora,
      lastMessageFrom: "CLIENTE",
      messages: {
        create: {
          kind: "CLIENTE",
          body: texto,
          authorName: autor.name,
          authorEmail: autor.email,
        },
      },
    },
    select: { id: true, messages: { select: { id: true } } },
  })

  after(
    avisarPlataforma("duvidaNova", {
      tenantId,
      duvidaId: duvida.id,
      mensagemId: duvida.messages[0]?.id,
      empresa: empresa.name,
      quem: autor.name,
      pergunta: resumo(texto),
    })
  )

  revalidatePath("/ajuda")
  return { ok: true, id: duvida.id }
}

/** O cliente escreve de novo na mesma conversa — inclusive reabrindo. */
export async function responderNaDuvida(
  id: string,
  _prev: EstadoDuvida,
  formData: FormData
): Promise<EstadoDuvida> {
  const { tenantId, userId } = await contexto()

  const texto = String(formData.get("texto") ?? "").trim()
  const problema = problemaNoTexto(texto)
  if (problema) return { erro: problema }

  const duvida = await prisma.supportThread.findFirst({
    where: { id, tenantId },
    select: { id: true, messageCount: true, authorName: true, authorEmail: true, tenantName: true },
  })
  if (!duvida) return { erro: "naoEncontrado" }
  if (!podeEscrever(duvida.messageCount)) return { erro: "conversaCheia" }

  const autor = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  })

  const agora = new Date()
  const mensagem = await prisma.$transaction(async (tx) => {
    const m = await tx.supportMessage.create({
      data: {
        threadId: id,
        kind: "CLIENTE",
        body: texto,
        authorName: autor?.name ?? duvida.authorName,
        authorEmail: autor?.email ?? duvida.authorEmail,
      },
      select: { id: true },
    })
    await tx.supportThread.update({
      where: { id },
      data: {
        // Escrever REABRE a conversa fechada: a pessoa voltou porque não
        // resolveu, e obrigá-la a abrir outra perderia o contexto do que já
        // foi dito — que é justamente o que ela quer aproveitar.
        status: statusApos("CLIENTE"),
        closedAt: null,
        closedBy: null,
        messageCount: { increment: 1 },
        lastMessageAt: agora,
        lastMessageFrom: "CLIENTE",
      },
    })
    return m
  })

  after(
    avisarPlataforma("duvidaNova", {
      tenantId,
      duvidaId: id,
      mensagemId: mensagem.id,
      empresa: duvida.tenantName,
      quem: autor?.name ?? duvida.authorName,
      pergunta: resumo(texto),
    })
  )

  revalidatePath("/ajuda")
  return { ok: true, id }
}

/** Marca que o cliente leu a resposta. Some o aviso de "resposta nova". */
export async function marcarDuvidaLida(id: string): Promise<EstadoDuvida> {
  const { tenantId } = await contexto()
  const r = await prisma.supportThread.updateMany({
    where: { id, tenantId },
    data: { readByClientAt: new Date() },
  })
  if (r.count === 0) return { erro: "naoEncontrado" }
  revalidatePath("/ajuda")
  return { ok: true }
}

/** O cliente encerra: resolveu. Libera uma vaga das três. */
export async function fecharMinhaDuvida(id: string): Promise<EstadoDuvida> {
  const { tenantId } = await contexto()
  const r = await prisma.supportThread.updateMany({
    where: { id, tenantId, status: { not: "FECHADA" } },
    data: { status: "FECHADA", closedAt: new Date(), closedBy: "cliente" },
  })
  if (r.count === 0) return { erro: "naoEncontrado" }
  revalidatePath("/ajuda")
  return { ok: true }
}

// Sem reexportar constante daqui: arquivo "use server" só pode exportar função
// async, e uma constante passa no typecheck e QUEBRA O BUILD (seção 9, item 20
// do plano de engenharia). Quem precisa dos limites importa de lib/duvida.ts.
