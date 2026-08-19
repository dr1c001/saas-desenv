export const runtime = "nodejs"
// Nunca em cache: uma resposta de saúde guardada é uma resposta que mente. O
// monitor externo perguntaria "está de pé?" e receberia o "sim" de meia hora
// atrás — exatamente durante a queda.
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { diagnosticar, statusHttp } from "@/lib/saude"

/**
 * Saúde do sistema, para um monitor EXTERNO consultar.
 *
 * Externo é a palavra que importa: um monitor rodando na mesma infraestrutura
 * que monitora não serve de nada. Se a Vercel cair, um cron da Vercel não vai
 * avisar ninguém. Esta rota existe pra que um serviço de fora (UptimeRobot,
 * Better Stack, o que o dono escolher) tenha o que consultar — inclusive sobre
 * o cron, que de fora ninguém consegue enxergar.
 *
 * Pública de propósito: monitor não faz login. Por isso a resposta não carrega
 * NENHUM dado de negócio — nada de contagem de empresas, receita ou nome de
 * cliente. Quem consulta fica sabendo se o sistema está de pé, e só.
 */
export async function GET() {
  let bancoRespondeu = false
  let ultimoCronOk: Date | null = null
  let primeiroRegistroEm: Date | null = null

  try {
    // Consulta trivial e barata: o objetivo é provar que a conexão vive, não
    // medir o banco. Uma checagem cara viraria, ela mesma, carga a cada minuto.
    const [cron, primeiro] = await Promise.all([
      prisma.cronRun.findFirst({
        where: { name: "daily", ok: true },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true },
      }),
      // A empresa mais antiga serve de "desde quando este sistema existe" —
      // é o que distingue "recém-implantado, cron ainda não rodou" de "o cron
      // morreu". Ver lib/saude.ts.
      prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ])
    bancoRespondeu = true
    ultimoCronOk = cron?.startedAt ?? null
    primeiroRegistroEm = primeiro?.createdAt ?? null
  } catch (err) {
    console.error("[health] banco não respondeu:", err)
  }

  const d = diagnosticar({ bancoRespondeu, ultimoCronOk, primeiroRegistroEm, agora: new Date() })

  return NextResponse.json(
    {
      estado: d.estado,
      checagens: d.checagens,
      horasDesdeOCron: d.horasDesdeOCron,
      agora: new Date().toISOString(),
    },
    {
      // 503 quando degradado: é o código que faz o monitor externo alertar.
      // Devolver 200 com "degradado" no corpo seria inútil — monitor não lê
      // corpo por padrão.
      status: statusHttp(d),
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  )
}
