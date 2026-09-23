// A porta de entrada da API de integração.
//
// Toda rota de /api/v1 começa aqui, e o que sai daqui é o tenantId — que
// TODA consulta seguinte precisa usar como filtro. É a única coisa separando
// as empresas: a API não tem sessão, não tem cookie, não tem proxy.ts na
// frente. A chave é a autorização inteira.
//
// As mensagens de erro daqui são em INGLÊS e não passam pelo next-intl, de
// propósito. Quem consome API lê `code`, não a frase — e `getTranslations`
// depende de contexto de request que rota de API pode não ter, o que
// transformaria um 401 honesto num 500.

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hasActiveSubscription } from "@/lib/auth"
import { temRecurso } from "@/lib/plan"
import { chaveConfere, chaveDoCabecalho, prefixoDe } from "@/lib/api-chave"
import { checkRateLimit } from "@/lib/rate-limit"

/** Teto por chave. Generoso para integração de verdade e ainda assim um freio
 *  para laço que saiu do controle no lado do cliente. */
const REQUISICOES_POR_MINUTO = 120

/** De quanto em quanto tempo o "último uso" é regravado. Gravar a cada
 *  requisição seria uma escrita por leitura — e o campo existe para a pessoa
 *  saber se pode revogar uma chave esquecida, não para cronometrar. */
const MINUTOS_ENTRE_REGISTROS_DE_USO = 5

export type Autenticado = { tenantId: string; chaveId: string }

export function erroApi(status: number, code: string, message: string, extra?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers: extra })
}

/**
 * Quem está chamando, ou a resposta de recusa pronta.
 *
 * Devolve a resposta em vez de lançar para a rota poder simplesmente
 * `return r.resposta` — recusa aqui é caso previsto, não excepcional.
 */
export async function autenticarApi(
  req: Request
): Promise<{ ok: true; auth: Autenticado } | { ok: false; resposta: NextResponse }> {
  const bruta = chaveDoCabecalho(req.headers.get("authorization"))
  if (!bruta) {
    return {
      ok: false,
      resposta: erroApi(401, "missing_authorization", "Send your key as: Authorization: Bearer <key>", {
        "WWW-Authenticate": "Bearer",
      }),
    }
  }

  // Formato errado morre aqui, sem ida ao banco. Não há limite de tentativas
  // para chave inválida de propósito: o segredo tem 32 caracteres base62
  // (~190 bits), então adivinhar é inviável, e gravar uma linha de contagem
  // por tentativa recusada daria a quem varre a internet uma forma de encher
  // uma tabela nossa.
  const prefixo = prefixoDe(bruta)
  if (!prefixo) return { ok: false, resposta: erroApi(401, "invalid_key", "Invalid API key.") }

  const chave = await prisma.apiKey.findUnique({
    where: { prefix: prefixo },
    select: { id: true, tenantId: true, hash: true, revokedAt: true, lastUsedAt: true },
  })

  // Mesma resposta para "não existe", "não confere" e "revogada": distinguir
  // contaria a quem tenta se o prefixo existe.
  if (!chave || chave.revokedAt || !chaveConfere(bruta, chave.hash)) {
    return { ok: false, resposta: erroApi(401, "invalid_key", "Invalid API key.") }
  }

  // A assinatura pode ter caído depois de a chave ser criada. Sem esta
  // checagem, cancelar o plano deixaria a integração rodando para sempre.
  if (!(await hasActiveSubscription(chave.tenantId))) {
    return {
      ok: false,
      resposta: erroApi(402, "subscription_inactive", "This account has no active subscription."),
    }
  }

  // E o plano pode ter mudado. A API é do Enterprise; um downgrade para Pro
  // precisa desligá-la, senão o recurso que justifica o preço vira vitalício
  // para quem passou por lá uma vez.
  if (!(await temRecurso(chave.tenantId, "api"))) {
    return {
      ok: false,
      resposta: erroApi(403, "plan_required", "The integration API requires the Enterprise plan."),
    }
  }

  const limite = await checkRateLimit(`api:${prefixo}`, REQUISICOES_POR_MINUTO, 1)
  if (!limite.allowed) {
    return {
      ok: false,
      resposta: erroApi(429, "rate_limited", "Too many requests. Slow down.", {
        "Retry-After": String(limite.retryAfterSeconds),
      }),
    }
  }

  await registrarUso(chave.id, chave.lastUsedAt)
  return { ok: true, auth: { tenantId: chave.tenantId, chaveId: chave.id } }
}

async function registrarUso(id: string, ultimoUso: Date | null) {
  const limite = MINUTOS_ENTRE_REGISTROS_DE_USO * 60 * 1000
  if (ultimoUso && Date.now() - ultimoUso.getTime() < limite) return
  // Nunca derruba a requisição: registrar uso é conveniência, e falhar aqui
  // não pode transformar uma chamada boa em erro.
  try {
    await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } })
  } catch {
    /* segue */
  }
}

// ─── Utilidades das rotas ────────────────────────────────────────────────────

/** Quantos itens por página. Teto de 100 para uma chamada não puxar a base
 *  inteira num request só. */
export function limiteDaBusca(url: URL): number {
  const bruto = Number(url.searchParams.get("limit"))
  if (!Number.isInteger(bruto) || bruto < 1) return 50
  return Math.min(bruto, 100)
}

/** Paginação por cursor, e não por offset: com offset, criar um registro
 *  enquanto o cliente pagina faz um item repetir e outro sumir. */
export function paginacao(url: URL, limite: number) {
  const cursor = url.searchParams.get("cursor")
  // Forma sempre igual (campos opcionais em vez de duas formas diferentes):
  // o Prisma tipa `skip` como number, e uma união faria o objeto inteiro
  // deixar de casar com a assinatura.
  return {
    take: limite,
    skip: cursor ? 1 : undefined,
    cursor: cursor ? { id: cursor } : undefined,
  }
}

export function pagina<T extends { id: string }>(itens: T[], limite: number) {
  return {
    data: itens,
    // Devolve o cursor só quando a página veio cheia. Cursor sempre presente
    // faria o cliente pedir uma página vazia a cada varredura.
    next_cursor: itens.length === limite ? itens[itens.length - 1].id : null,
  }
}

/** Corpo JSON, ou null quando não é JSON válido. */
export async function corpoJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}
