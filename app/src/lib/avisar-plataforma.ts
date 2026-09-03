import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { EMAIL_FUNDADOR } from "@/lib/admin"
import { papelPode } from "@/lib/permissoes"
import { sendPushToUser } from "@/lib/push"
import {
  chaveDoAviso,
  montarAviso,
  PERMISSAO_DO_AVISO,
  type AvisoDaPlataforma,
  type DadosDoAviso,
} from "@/lib/avisos-plataforma"

// Entregar o aviso ao dono da plataforma.
//
// As regras puras (quem pode receber o quê, qual a chave, o que o texto diz)
// estão em avisos-plataforma.ts. Aqui mora o que fala com banco e rede.
//
// ─── NUNCA LANÇA ─────────────────────────────────────────────────────────────
//
// Avisar é acessório. Falhar em notificar não pode derrubar o cadastro da
// empresa nova nem fazer o webhook do Asaas responder erro — o Asaas reenviaria
// o evento para sempre por causa de um push que não saiu.

/**
 * Quem recebe um aviso da plataforma.
 *
 * ─── A armadilha que esta função existe para desarmar ────────────────────────
 *
 * O jeito óbvio de escrever isto é ler a tabela `PlatformAdmin`. E ela está
 * VAZIA em produção — o fundador entra no painel pelo `EMAIL_FUNDADOR`, com o
 * papel DONO garantido no código justamente para ele não se trancar do lado de
 * fora ao se remover por engano (ver lib/admin.ts).
 *
 * Ou seja: a versão óbvia não avisaria NINGUÉM, começando pela única pessoa que
 * usa o painel. E falharia em silêncio, passando em qualquer teste que popule a
 * tabela.
 *
 * ─── E por que a comparação de e-mail é insensível a maiúscula ───────────────
 *
 * `EMAIL_FUNDADOR` é normalizado com `.toLowerCase()`, e `adminLogado()`
 * compara em minúsculas. Mas `User.email` é gravado CRU no primeiro login
 * (lib/auth.ts), com o que veio do Supabase. Um e-mail cadastrado com uma
 * maiúscula qualquer não casaria — e o dono ficaria sem aviso sem nada acusar.
 */
export async function destinatariosDaPlataforma(
  permissao: Parameters<typeof papelPode>[1]
): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
  const equipe = await prisma.platformAdmin.findMany({
    where: { active: true },
    select: { email: true, role: true },
  })

  const emails = new Set<string>()
  // O fundador SEMPRE, e primeiro: ele pode tudo, e a linha dele na tabela é
  // opcional por decisão de projeto.
  if (EMAIL_FUNDADOR) emails.add(EMAIL_FUNDADOR)
  for (const m of equipe) {
    if (papelPode(m.role, permissao)) emails.add(m.email.trim().toLowerCase())
  }
  if (emails.size === 0) return []

  // OR de `equals` com `mode: insensitive` — e não `in`, que casa byte a byte.
  const usuarios = await prisma.user.findMany({
    where: { OR: [...emails].map((e) => ({ email: { equals: e, mode: "insensitive" as const } })) },
    select: { id: true },
  })
  if (usuarios.length === 0) return []

  return prisma.pushSubscription.findMany({
    where: { userId: { in: usuarios.map((u) => u.id) } },
    select: { endpoint: true, p256dh: true, auth: true },
  })
}

/**
 * Avisa, uma vez só, para sempre.
 *
 * A CHAVE é gravada ANTES do envio. Gravar a mesma duas vezes é impossível
 * (índice único), e é isso — e não um `if` — que impede o aviso repetido
 * quando o Asaas reenvia o mesmo evento ou quando duas requisições do primeiro
 * login correm juntas.
 *
 * A linha fica gravada mesmo se o push falhar, com `delivered = 0`. Essa
 * diferença é o que permite responder depois "por que eu não fui avisado":
 * linha ausente = o gatilho nunca rodou; linha com zero = rodou e o push não
 * chegou. Sem ela, os dois casos parecem o mesmo.
 */
export async function avisarPlataforma(
  evento: AvisoDaPlataforma,
  dados: DadosDoAviso & { subscriptionId?: string | null; fimDoPeriodo?: Date | null }
): Promise<void> {
  try {
    const key = chaveDoAviso(evento, dados)

    try {
      await prisma.platformAlert.create({
        data: { key, event: evento, tenantId: dados.tenantId ?? null },
      })
    } catch {
      // Chave repetida: alguém já avisou este fato. Nada a fazer, e nada a
      // registrar — não é erro, é o mecanismo funcionando.
      return
    }

    const t = await getTranslations("avisosPlataforma")
    const aviso = montarAviso(evento, dados, (chave, valores) =>
      t(chave as "novaEmpresa.title", valores)
    )

    const inscricoes = await destinatariosDaPlataforma(PERMISSAO_DO_AVISO[evento])
    const resumo = await sendPushToUser(inscricoes, {
      title: aviso.title,
      body: aviso.body,
      url: aviso.url,
      tag: aviso.tag,
      requireInteraction: aviso.requireInteraction,
    })

    await prisma.platformAlert.update({
      where: { key },
      data: { delivered: resumo.enviadas, detail: aviso.body },
    })
  } catch (e) {
    // Engolido de propósito, mas NUNCA em silêncio: sem este log, um cano
    // quebrado ficaria meses sem ninguém perceber — o modo de falha deste
    // recurso é justamente não acontecer nada.
    console.error("[avisarPlataforma] falhou:", evento, e)
  }
}

/** O botão de teste do painel. Não grava reivindicação: pode repetir sempre. */
export async function enviarAvisoDeTeste(): Promise<{
  enviadas: number
  removidas: number
  falharam: number
}> {
  const t = await getTranslations("avisosPlataforma")
  const aviso = montarAviso("testeDeAviso", {}, (chave, valores) =>
    t(chave as "novaEmpresa.title", valores)
  )
  const inscricoes = await destinatariosDaPlataforma(PERMISSAO_DO_AVISO.testeDeAviso)
  return sendPushToUser(inscricoes, {
    title: aviso.title,
    body: aviso.body,
    url: aviso.url,
    tag: aviso.tag,
  })
}
