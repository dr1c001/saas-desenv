// De uma ferramenta pedida pelo modelo para uma chamada de verdade.
//
// Tudo aqui passa pelas MESMAS funções que a tela chama. Nenhuma consulta ao
// banco é escrita neste arquivo, de propósito — ver o porquê em ferramentas.ts.
// Na prática: tenant vem da sessão, permissão é conferida lá dentro, e cota de
// plano também. A assistente não tem como escapar de nada disso.
//
// O que ESTE arquivo faz é a tradução que falta: fala não tem id. "Conclui a do
// João" precisa virar um clientId, e é aqui que isso acontece — usando
// resolver.ts, que na dúvida devolve as opções em vez de escolher.
//
// O que cada função devolve é TEXTO, e não objeto: é o modelo que vai ler. Um
// texto curto e específico ("OS #24 do João Silva, em andamento") dá uma
// resposta melhor do que um JSON grande, e gasta menos token.

import { getClients, deleteClient } from "@/actions/clients"
import {
  completeServiceOrder,
  createServiceOrder,
  deleteServiceOrder,
  getServiceOrders,
  updateOrderStatus,
} from "@/actions/service-orders"
import { addChecklistItem } from "@/actions/checklist"
import { reagendarOs } from "@/actions/schedule"
import { emitNfse } from "@/actions/nfse"
import { getFinanceSummary } from "@/actions/finance"
import { getPecas } from "@/actions/estoque"
import { createClient as criarClienteAction } from "@/actions/clients"
import { codigoDaAba, DESTINOS, normalizarCodigo, pareceCodigo } from "@/lib/codigos-abas"
import { comoPerguntar, numeroFalado, resolverUnico } from "@/lib/ia/resolver"

/** O que volta para o modelo. `abrir` navega a tela de quem falou. */
export type Resultado = {
  texto: string
  erro?: boolean
  abrir?: string
}

const ok = (texto: string, abrir?: string): Resultado => ({ texto, abrir })
const falhou = (texto: string): Resultado => ({ texto, erro: true })

function dinheiro(v: unknown): string {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const ROTULO_STATUS: Record<string, string> = {
  OPEN: "aberta",
  IN_PROGRESS: "em andamento",
  DONE: "concluída",
  INVOICED: "faturada",
  CANCELLED: "cancelada",
}

type Ordem = {
  id: string
  number: number | string
  title: string
  status: string
  totalAmount?: unknown
  scheduledAt?: Date | null
  client?: { name: string } | null
}

function comoLinha(o: Ordem): string {
  const quando = o.scheduledAt ? ` agendada para ${o.scheduledAt.toLocaleString("pt-BR")}` : ""
  return `#${o.number} ${o.title} — ${o.client?.name ?? "sem cliente"}, ${
    ROTULO_STATUS[o.status] ?? o.status
  }, ${dinheiro(o.totalAmount)}${quando}`
}

/**
 * Acha a OS pelo número que a pessoa falou.
 *
 * Por NÚMERO, e não por título: número é o que está impresso no documento e na
 * boca de quem trabalha ali. Título se repete ("Manutenção elétrica" em vinte
 * ordens) e casaria com a errada.
 */
async function acharOrdem(falado: string): Promise<{ o: Ordem } | { erro: string }> {
  const n = numeroFalado(String(falado ?? ""))
  if (!n) return { erro: "Não entendi o número da ordem de serviço. Peça o número à pessoa." }

  const todas = (await getServiceOrders()) as unknown as Ordem[]
  const achadas = todas.filter((o) => numeroFalado(String(o.number)) === n)
  if (achadas.length === 0) return { erro: `Não existe ordem de serviço com o número ${n}.` }
  if (achadas.length > 1) {
    return { erro: comoPerguntar("ordem de serviço", achadas.map(comoLinha)) }
  }
  return { o: achadas[0] }
}

type Cli = { id: string; name: string }

async function acharCliente(falado: string): Promise<{ c: Cli } | { erro: string }> {
  const todos = (await getClients()) as unknown as Cli[]
  const r = resolverUnico(String(falado ?? ""), todos, (c) => c.name)
  if (r.tipo === "nenhum") return { erro: `Não achei nenhum cliente chamado "${falado}".` }
  if (r.tipo === "varios") return { erro: comoPerguntar("cliente", r.opcoes.map((c) => c.name)) }
  return { c: r.item }
}

/** Uma data AAAA-MM-DD, ou `null` se não der para confiar nela. */
function comoData(valor: unknown): { ano: number; mes: number; dia: number } | null {
  const m = String(valor ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [, a, ms, d] = m
  const ano = Number(a)
  const mes = Number(ms)
  const dia = Number(d)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return { ano, mes, dia }
}

function comoFormData(campos: Record<string, string | undefined>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== "") fd.set(k, v)
  return fd
}

/**
 * Executa a ferramenta e devolve o que o modelo vai ler.
 *
 * Nunca lança: uma falha aqui vira texto de erro que volta para o modelo, que
 * explica à pessoa. Deixar estourar deixaria a assistente muda no meio de um
 * comando, e quem está com as mãos ocupadas não tem como investigar.
 */
export async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>
): Promise<Resultado> {
  try {
    return await despachar(nome, args)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido"
    return falhou(`A operação falhou: ${msg}`)
  }
}

async function despachar(nome: string, a: Record<string, unknown>): Promise<Resultado> {
  switch (nome) {
    // ─── Navegar ────────────────────────────────────────────────────────────
    case "abrir_tela": {
      const pedido = String(a.destino ?? "")
      const porCodigo = pareceCodigo(pedido)
        ? DESTINOS.find((d) => d.codigo === normalizarCodigo(pedido))
        : undefined
      const alvo =
        porCodigo ??
        DESTINOS.find((d) => d.rota.includes(pedido.toLowerCase())) ??
        DESTINOS.find((d) => codigoDaAba(d.aba ?? "") && d.navKey.toLowerCase() === pedido.toLowerCase())
      if (!alvo) return falhou(`Não achei uma tela chamada "${pedido}".`)
      return ok(`Abrindo ${alvo.rota} (${alvo.codigo}).`, alvo.rota)
    }

    // ─── Ler ────────────────────────────────────────────────────────────────
    case "listar_ordens": {
      const ordens = (await getServiceOrders({
        q: a.busca ? String(a.busca) : undefined,
        status: a.status ? String(a.status) : undefined,
      })) as unknown as Ordem[]
      if (ordens.length === 0) return ok("Nenhuma ordem de serviço encontrada com esses filtros.")
      // Teto de 20: a resposta é FALADA. Uma lista de cem itens não ajuda
      // ninguém e ainda custa token.
      const lista = ordens.slice(0, 20).map(comoLinha).join("\n")
      const resto = ordens.length > 20 ? `\n(e mais ${ordens.length - 20})` : ""
      return ok(`${ordens.length} encontrada(s):\n${lista}${resto}`)
    }

    case "buscar_cliente": {
      const r = await acharCliente(a.busca as string)
      if ("erro" in r) return falhou(r.erro)
      const ordens = (await getServiceOrders({ q: r.c.name })) as unknown as Ordem[]
      return ok(
        `${r.c.name} — ${ordens.length} ordem(ns) de serviço.\n` +
          ordens.slice(0, 10).map(comoLinha).join("\n")
      )
    }

    case "agenda_do_dia": {
      const d = comoData(a.data) ?? nowBRT()
      const mes = (await import("@/actions/schedule")).getScheduledOrders
      const ordens = (await mes(d.ano, d.mes)) as unknown as Ordem[]
      const doDia = ordens.filter((o) => o.scheduledAt && o.scheduledAt.getDate() === d.dia)
      if (doDia.length === 0) return ok(`Nada agendado para ${d.dia}/${d.mes}.`)
      return ok(`${doDia.length} para ${d.dia}/${d.mes}:\n${doDia.map(comoLinha).join("\n")}`)
    }

    case "situacao_financeira": {
      // Os nomes vêm de getFinanceSummary, e `pendingRevenues`/`pendingExpenses`
      // são LISTAS, não totais — somar é aqui. Escrever `totalReceivable` de
      // memória devolveria R$ 0,00 em silêncio, que é o pior tipo de erro numa
      // assistente: plausível, falado com segurança, e errado.
      const f = (await getFinanceSummary()) as unknown as {
        monthlyRevenue?: unknown
        pendingRevenues?: { amount?: unknown }[]
        pendingExpenses?: { amount?: unknown }[]
      }
      const soma = (l?: { amount?: unknown }[]) =>
        (l ?? []).reduce((t, i) => t + Number(i.amount ?? 0), 0)
      const aReceber = f.pendingRevenues ?? []
      const aPagar = f.pendingExpenses ?? []
      return ok(
        `Receita do mês: ${dinheiro(f.monthlyRevenue)}. ` +
          `A receber: ${dinheiro(soma(aReceber))} em ${aReceber.length} lançamento(s). ` +
          `A pagar: ${dinheiro(soma(aPagar))} em ${aPagar.length}.`
      )
    }

    case "consultar_estoque": {
      // `stock`, e não `balance`: é o nome no schema. Errar aqui faria toda
      // peça parecer zerada, e a assistente avisaria falta que não existe.
      type Peca = { name: string; stock?: unknown; minStock?: unknown; unit?: string }
      const pecas = (await getPecas(a.busca ? String(a.busca) : undefined)) as unknown as Peca[]
      if (pecas.length === 0) return ok("Nenhuma peça encontrada.")
      const alvo = a.busca
        ? pecas
        : // Sem busca, o que interessa é o que está faltando.
          pecas.filter((p) => Number(p.minStock ?? 0) > 0 && Number(p.stock ?? 0) <= Number(p.minStock))
      if (alvo.length === 0) return ok("Nenhuma peça abaixo do mínimo.")
      return ok(
        alvo
          .slice(0, 20)
          .map((p) => `${p.name}: ${Number(p.stock ?? 0)} ${p.unit ?? ""} (mínimo ${Number(p.minStock ?? 0)})`)
          .join("\n")
      )
    }

    // ─── Escrever ───────────────────────────────────────────────────────────
    case "criar_ordem": {
      const r = await acharCliente(a.cliente as string)
      if ("erro" in r) return falhou(r.erro)
      const estado = await createServiceOrder(
        {},
        comoFormData({
          title: String(a.titulo ?? ""),
          description: a.descricao ? String(a.descricao) : undefined,
          clientId: r.c.id,
          scheduledAt: a.agendamento ? String(a.agendamento) : undefined,
        })
      )
      // A action devolve `message` quando recusa — falta de permissão, cota do
      // plano estourada, campo inválido. Repassar o motivo é o que permite à
      // assistente dizer o que aconteceu em vez de "não deu".
      if (estado?.message) return falhou(estado.message)
      if (estado?.errors) return falhou(`Dados inválidos: ${Object.keys(estado.errors).join(", ")}.`)
      return ok(`Ordem de serviço criada para ${r.c.name}: ${a.titulo}.`, "/service-orders")
    }

    case "mudar_status_ordem": {
      const r = await acharOrdem(a.numero as string)
      if ("erro" in r) return falhou(r.erro)
      await updateOrderStatus(r.o.id, String(a.status))
      return ok(`OS #${r.o.number} agora está ${ROTULO_STATUS[String(a.status)]}.`)
    }

    case "reagendar_ordem": {
      const r = await acharOrdem(a.numero as string)
      if ("erro" in r) return falhou(r.erro)
      const d = comoData(a.quando)
      if (!d) return falhou("Não entendi a data. Peça o dia à pessoa.")
      const res = await reagendarOs(r.o.id, d.ano, d.mes, d.dia)
      if (!res.ok) return falhou(`Não deu para reagendar: ${res.motivo}.`)
      return ok(`OS #${r.o.number} movida para ${d.dia}/${d.mes}.`)
    }

    case "adicionar_item_checklist": {
      const r = await acharOrdem(a.numero as string)
      if ("erro" in r) return falhou(r.erro)
      await addChecklistItem(r.o.id, String(a.item ?? ""))
      return ok(`Item acrescentado ao checklist da OS #${r.o.number}.`)
    }

    case "criar_cliente": {
      const estado = await criarClienteAction(
        {},
        comoFormData({
          name: String(a.nome ?? ""),
          phone: a.telefone ? String(a.telefone) : undefined,
          document: a.documento ? String(a.documento) : undefined,
          email: a.email ? String(a.email) : undefined,
        })
      )
      if (estado?.message) return falhou(estado.message)
      if (estado?.errors) return falhou(`Dados inválidos: ${Object.keys(estado.errors).join(", ")}.`)
      return ok(`Cliente ${a.nome} cadastrado.`, "/clients")
    }

    case "movimentar_estoque": {
      const { movimentar } = await import("@/actions/estoque")
      type Peca = { id: string; name: string; sku?: string | null }
      const pecas = (await getPecas(String(a.peca ?? ""))) as unknown as Peca[]
      const achada = resolverUnico(String(a.peca ?? ""), pecas, (p) => p.name)
      if (achada.tipo === "nenhum") return falhou(`Não achei a peça "${a.peca}".`)
      if (achada.tipo === "varios")
        return falhou(comoPerguntar("peça", achada.opcoes.map((p) => p.name)))
      const estado = await movimentar(
        {},
        comoFormData({
          pecaId: achada.item.id,
          tipo: String(a.tipo ?? ""),
          quantidade: String(a.quantidade ?? ""),
          motivo: a.motivo ? String(a.motivo) : undefined,
        })
      )
      if (estado?.erro) return falhou(`Não deu: ${estado.erro}.`)
      return ok(`Movimento registrado em ${achada.item.name}.`)
    }

    // ─── Irreversível (só chega aqui depois de alguém confirmar) ────────────
    case "concluir_ordem": {
      const r = await acharOrdem(a.numero as string)
      if ("erro" in r) return falhou(r.erro)
      // Sem itens: a assistente conclui com os itens que a OS já tem. Ditar
      // item, quantidade e preço por voz é onde o erro custa dinheiro, e por
      // isso essa parte continua sendo da tela.
      await completeServiceOrder(r.o.id, String(a.conclusao ?? ""), [], a.faturar_agora === true)
      return ok(
        `OS #${r.o.number} concluída${a.faturar_agora === true ? " e faturada" : ""}.`,
        `/service-orders/${r.o.id}`
      )
    }

    case "emitir_nota_fiscal": {
      const r = await acharOrdem(a.numero as string)
      if ("erro" in r) return falhou(r.erro)
      const res = (await emitNfse(r.o.id)) as unknown as { error?: string } | undefined
      if (res?.error) return falhou(`A emissão falhou: ${res.error}`)
      return ok(`Nota fiscal da OS #${r.o.number} enviada à prefeitura.`)
    }

    case "excluir_ordem": {
      const r = await acharOrdem(a.numero as string)
      if ("erro" in r) return falhou(r.erro)
      await deleteServiceOrder(r.o.id)
      return ok(`OS #${r.o.number} apagada.`, "/service-orders")
    }

    case "excluir_cliente": {
      const r = await acharCliente(a.nome as string)
      if ("erro" in r) return falhou(r.erro)
      await deleteClient(r.c.id)
      return ok(`Cliente ${r.c.name} apagado.`, "/clients")
    }

    default:
      return falhou(`A ferramenta ${nome} não existe.`)
  }
}

/** Hoje, em Brasília, já separado em ano/mês/dia. */
function nowBRT(): { ano: number; mes: number; dia: number } {
  const brt = new Date(Date.now() - 3 * 3600_000)
  return { ano: brt.getUTCFullYear(), mes: brt.getUTCMonth() + 1, dia: brt.getUTCDate() }
}
