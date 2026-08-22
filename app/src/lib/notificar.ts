// O único caminho para avisar alguém no celular.
//
// Antes cada lugar montava o seu: buscar inscrições, checar se há alguma,
// chamar o envio, engolir o erro. Eram duas cópias e iam virar seis com os
// eventos novos — e cópia de bloco diverge, sempre na que ninguém lembra de
// atualizar. Aqui é um lugar só, e ele carrega três coisas que cada cópia
// teria de repetir sem esquecer:
//
//   1. a preferência de quem recebe (silenciou este aviso? quer sem som?)
//   2. quem NÃO recebe: nunca a própria pessoa que causou o evento
//   3. o erro morre aqui — notificação é acessório, e falhar em avisar não
//      pode derrubar a gravação que gerou o aviso

import { prisma } from "@/lib/prisma"
import { getTranslator } from "@/lib/i18n"
import { sendPushToUser } from "@/lib/push"
import { temFuncao } from "@/lib/plan"
import { definicaoDe, etiqueta, querReceber, type Evento } from "@/lib/notificacoes"

type Alvo = {
  id: string
  mutedNotifications: string[]
  silentNotifications: boolean
}

export type Aviso = {
  tenantId: string
  evento: Evento
  /** Texto do corpo. O título vem do catálogo de traduções. */
  corpo: string
  /** Para onde o toque leva. */
  url: string
  /** Id da OS/cobrança, para agrupar avisos do mesmo assunto. */
  referencia?: string
  /** Quem causou o evento — nunca recebe o próprio aviso. */
  autorId?: string | null
  /** Só para eventos de público "responsavel". */
  responsavelId?: string | null
}

/**
 * Avisa quem precisa saber.
 *
 * Nunca lança. Quem chama pode simplesmente `await notificar(...)` e seguir.
 */
export async function notificar(aviso: Aviso): Promise<void> {
  try {
    // A empresa pode ter desligado notificação por completo (lib/funcoes.ts).
    if (!(await temFuncao(aviso.tenantId, "push"))) return

    const def = definicaoDe(aviso.evento)
    const alvos = await destinatarios(aviso, def.publico)
    if (alvos.length === 0) return

    const tenant = await prisma.tenant.findUnique({
      where: { id: aviso.tenantId },
      select: { locale: true, vocabulary: true },
    })
    const t = getTranslator(tenant?.locale ?? "pt", "notifications", tenant?.vocabulary)
    const titulo = t(`${aviso.evento}.title` as "osAtribuida.title")

    // Agrupados por preferência de som: quem silenciou recebe sem barulho, e
    // não deixa de receber. Silenciar é sobre incomodar, não sobre esconder.
    for (const semSom of [false, true]) {
      const grupo = alvos.filter((a) => a.silentNotifications === semSom)
      if (grupo.length === 0) continue

      const subs = await prisma.pushSubscription.findMany({
        where: { userId: { in: grupo.map((a) => a.id) } },
        select: { endpoint: true, p256dh: true, auth: true },
      })
      if (subs.length === 0) continue

      await sendPushToUser(subs, {
        title: titulo,
        body: aviso.corpo,
        url: aviso.url,
        silent: semSom,
        // Fica na tela até ser tocada, só no que exige ação de alguém.
        requireInteraction: def.insistente,
        tag: aviso.referencia ? etiqueta(aviso.evento, aviso.referencia) : undefined,
      })
    }
  } catch (err) {
    console.error("[notificar] falhou:", aviso.evento, err)
  }
}

/** Quem recebe, já filtrado por preferência e sem o autor do evento. */
async function destinatarios(aviso: Aviso, publico: "responsavel" | "escritorio"): Promise<Alvo[]> {
  const campos = { id: true, mutedNotifications: true, silentNotifications: true }

  const pessoas =
    publico === "responsavel"
      ? aviso.responsavelId
        ? await prisma.user.findMany({
            where: { id: aviso.responsavelId, tenantId: aviso.tenantId },
            select: campos,
          })
        : []
      : await prisma.user.findMany({
          where: { tenantId: aviso.tenantId, role: { in: ["OWNER", "ADMIN"] } },
          select: campos,
        })

  return pessoas.filter(
    (p) =>
      // Nunca avisa quem acabou de fazer a coisa. Notificação sobre o próprio
      // clique é ruído, e ruído ensina a ignorar a próxima.
      p.id !== aviso.autorId && querReceber(aviso.evento, p.mutedNotifications)
  )
}
