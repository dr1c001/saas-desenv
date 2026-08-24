"use server"

// A assistente de voz.
//
// Toda função exportada de um arquivo "use server" é um endereço HTTP: quem
// souber o nome chama direto, sem passar pela tela. Por isso cada uma aqui
// confere sozinha o tenant, o recurso contratado e a cota — não dá para
// depender de a interface ter escondido o botão.
//
// ─── O que a confirmação protege, e o que não ────────────────────────────────
//
// A confirmação das ações irreversíveis existe contra ERRO DE RECONHECIMENTO DE
// FALA, e não contra usuário mal-intencionado. Quem quisesse apagar uma OS de
// propósito chamaria `deleteServiceOrder` direto, com ou sem assistente — e é
// `deleteServiceOrder` que confere permissão, aqui e lá.
//
// Vale dizer isso com todas as letras para ninguém confundir a barreira: ela
// serve para a pessoa PERCEBER que a assistente entendeu "apaga" quando ela
// disse "acaba", antes de o estrago acontecer.

import Anthropic from "@anthropic-ai/sdk"
import { getAcoesPermitidas, getTenant } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { temRecurso } from "@/lib/plan"
import { lerVocabulario } from "@/lib/vocabulario"
import { aposConsumir, estadoDaCota, porQueNaoPode, type Impedimento } from "@/lib/ia/cota"
import {
  comoFerramentasDaApi,
  comoResultado,
  decidir,
  instrucoes,
  MAX_TOKENS,
  MAX_VOLTAS,
  MODELO,
  type BlocoDaResposta,
} from "@/lib/ia/conversa"
import { ferramentasPara, fraseDeConfirmacao } from "@/lib/ia/ferramentas"
import { executarFerramenta } from "@/lib/ia/executar"

/** Uma mensagem da conversa, no formato da API. */
type Mensagem = { role: "user" | "assistant"; content: unknown }

export type Pendente = {
  ferramenta: string
  args: Record<string, unknown>
  idDaChamada: string
  historico: Mensagem[]
}

export type RespostaDaAssistente =
  | { tipo: "resposta"; texto: string; abrir?: string; historico: Mensagem[]; restam: number | null }
  | { tipo: "confirmar"; frase: string; pendente: Pendente }
  | { tipo: "impedida"; motivo: Impedimento }

/** A assistente está disponível para esta empresa, e quanto sobra do mês. */
export async function estadoDaAssistente(): Promise<{
  disponivel: boolean
  motivo: Impedimento | null
  restam: number | null
  limite: number | null
}> {
  const { tenantId } = await getTenant()
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { maxIaOverride: true, iaComandosNoMes: true, iaMesDoContador: true },
  })
  const cota = estadoDaCota({
    usado: t?.iaComandosNoMes ?? 0,
    mesGravado: t?.iaMesDoContador ?? null,
    override: t?.maxIaOverride ?? null,
    agora: new Date(),
  })
  const motivo = porQueNaoPode({
    temRecurso: await temRecurso(tenantId, "ia"),
    temChave: Boolean(process.env.ANTHROPIC_API_KEY),
    cota,
  })
  return { disponivel: motivo === null, motivo, restam: cota.restam, limite: cota.limite }
}

/**
 * Um comando falado.
 *
 * `historico` vem do navegador. Ele NÃO é fonte de autoridade: as ferramentas
 * que a pessoa pode usar são montadas aqui, do papel e das permissões dela, e
 * uma chamada fora dessa lista é recusada em conversa.ts. O pior que um
 * histórico adulterado consegue é confundir o modelo.
 */
export async function falarComAssistente(
  historico: Mensagem[],
  falado: string,
  telaAtual?: string
): Promise<RespostaDaAssistente> {
  const { tenantId, role, userId } = await getTenant()

  const cru = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      maxIaOverride: true,
      iaComandosNoMes: true,
      iaMesDoContador: true,
      locale: true,
      vocabulary: true,
    },
  })
  const cota = estadoDaCota({
    usado: cru?.iaComandosNoMes ?? 0,
    mesGravado: cru?.iaMesDoContador ?? null,
    override: cru?.maxIaOverride ?? null,
    agora: new Date(),
  })
  const impedimento = porQueNaoPode({
    temRecurso: await temRecurso(tenantId, "ia"),
    temChave: Boolean(process.env.ANTHROPIC_API_KEY),
    cota,
  })
  if (impedimento) return { tipo: "impedida", motivo: impedimento }

  // A cota é consumida ANTES da conversa, e não depois: uma conversa que gasta
  // seis idas ao modelo e falha na última já custou dinheiro. Cobrar só o que
  // termina bem transformaria falha em uso grátis.
  await prisma.tenant.update({ where: { id: tenantId }, data: aposConsumir(cota) })

  const usuario = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { name: true },
  })
  const ehAdmin = role === "OWNER" || role === "ADMIN"
  const disponiveis = ferramentasPara(ehAdmin, await getAcoesPermitidas(tenantId, role))

  const sistema = instrucoes({
    nome: usuario?.name ?? "você",
    papel: role,
    hoje: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
    vocabulario: lerVocabulario(cru?.vocabulary, cru?.locale === "en" ? "en" : "pt"),
    telaAtual,
  })

  const conversa: Mensagem[] = [...historico, { role: "user", content: falado }]
  return rodar(conversa, sistema, disponiveis, cota.restam)
}

/** Executa o que a pessoa acabou de confirmar, e devolve a conversa ao modelo. */
export async function confirmarPendente(p: Pendente): Promise<RespostaDaAssistente> {
  const { tenantId, role } = await getTenant()
  if (await temRecurso(tenantId, "ia")) {
    // A execução passa pela action de verdade, que confere permissão de novo.
    const r = await executarFerramenta(p.ferramenta, p.args)
    const ehAdmin = role === "OWNER" || role === "ADMIN"
    const disponiveis = ferramentasPara(ehAdmin, await getAcoesPermitidas(tenantId, role))
    const conversa: Mensagem[] = [
      ...p.historico,
      { role: "user", content: [comoResultado(p.idDaChamada, r.texto, r.erro)] },
    ]
    const sistema = instrucoes({
      nome: "você",
      papel: role,
      hoje: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
      vocabulario: lerVocabulario(null, "pt"),
    })
    const resposta = await rodar(conversa, sistema, disponiveis, null)
    if (resposta.tipo === "resposta" && r.abrir) return { ...resposta, abrir: r.abrir }
    return resposta
  }
  return { tipo: "impedida", motivo: "semRecurso" }
}

/** Quem a pessoa cancelou não acontece, e o modelo precisa saber disso. */
export async function cancelarPendente(p: Pendente): Promise<RespostaDaAssistente> {
  const { tenantId, role } = await getTenant()
  const ehAdmin = role === "OWNER" || role === "ADMIN"
  const disponiveis = ferramentasPara(ehAdmin, await getAcoesPermitidas(tenantId, role))
  const conversa: Mensagem[] = [
    ...p.historico,
    {
      role: "user",
      content: [
        comoResultado(
          p.idDaChamada,
          "A pessoa NÃO confirmou. Nada foi feito. Não tente de novo — pergunte o que ela quer.",
          true
        ),
      ],
    },
  ]
  const sistema = instrucoes({
    nome: "você",
    papel: role,
    hoje: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
    vocabulario: lerVocabulario(null, "pt"),
  })
  return rodar(conversa, sistema, disponiveis, null)
}

/** O laço: pergunta ao modelo, executa o que der, repete até uma resposta. */
async function rodar(
  conversa: Mensagem[],
  sistema: string,
  disponiveis: ReturnType<typeof ferramentasPara>,
  restam: number | null
): Promise<RespostaDaAssistente> {
  const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const ferramentas = comoFerramentasDaApi(disponiveis)
  let abrir: string | undefined

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const r = await cliente.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      // As instruções e as ferramentas são IDÊNTICAS em toda chamada e são a
      // maior parte da entrada. Marcá-las como cacheáveis é a economia de
      // melhor retorno neste desenho — sem ela, paga-se o bloco inteiro a cada
      // comando falado.
      system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
      tools: ferramentas.map((f, i) =>
        i === ferramentas.length - 1 ? { ...f, cache_control: { type: "ephemeral" as const } } : f
      ),
      messages: conversa as Anthropic.MessageParam[],
    })

    const decisao = decidir(r.content as BlocoDaResposta[], disponiveis)
    conversa = [...conversa, { role: "assistant", content: r.content }]

    if (decisao.tipo === "responder") {
      return { tipo: "resposta", texto: decisao.texto, abrir, historico: conversa, restam }
    }

    if (decisao.tipo === "confirmar") {
      return {
        tipo: "confirmar",
        frase: fraseDeConfirmacao(decisao.ferramenta.nome, decisao.args),
        pendente: {
          ferramenta: decisao.ferramenta.nome,
          args: decisao.args,
          idDaChamada: decisao.id,
          historico: conversa,
        },
      }
    }

    if (decisao.tipo === "negada") {
      conversa = [
        ...conversa,
        {
          role: "user",
          content: [
            comoResultado(
              decisao.id,
              `Você não tem a ferramenta ${decisao.nome} nesta conta. Diga isso à pessoa em vez de tentar outro caminho.`,
              true
            ),
          ],
        },
      ]
      continue
    }

    const resultado = await executarFerramenta(decisao.ferramenta.nome, decisao.args)
    if (resultado.abrir) abrir = resultado.abrir
    conversa = [
      ...conversa,
      { role: "user", content: [comoResultado(decisao.id, resultado.texto, resultado.erro)] },
    ]
  }

  // Estourou o teto de idas e voltas. Dizer isso é melhor que devolver vazio: a
  // pessoa refaz o pedido de outro jeito em vez de achar que travou.
  return {
    tipo: "resposta",
    texto: "Me perdi no meio do pedido. Pode repetir de outro jeito?",
    historico: conversa,
    restam,
  }
}
