import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

// Backend simples baseado em Postgres (não há Redis/KV no projeto). Sob
// concorrência alta, dois requests simultâneos podem ambos passar no mesmo
// instante (a leitura da contagem não é atômica com o incremento) — aceitável
// aqui: um rate limit de força bruta precisa barrar dezenas/centenas de
// tentativas sequenciais, não é afetado por 1-2 requests a mais passarem.
export async function checkRateLimit(key: string, max: number, windowMinutes: number): Promise<RateLimitResult> {
  const windowMs = windowMinutes * 60 * 1000
  const now = new Date()

  const existing = await prisma.authRateLimit.findUnique({ where: { key } })

  if (!existing || now.getTime() - existing.windowStart.getTime() > windowMs) {
    await prisma.authRateLimit.upsert({
      where: { key },
      create: { key, attempts: 1, windowStart: now },
      update: { attempts: 1, windowStart: now },
    })
    return { allowed: true }
  }

  if (existing.attempts >= max) {
    const retryAfterSeconds = Math.ceil((windowMs - (now.getTime() - existing.windowStart.getTime())) / 1000)
    return { allowed: false, retryAfterSeconds }
  }

  await prisma.authRateLimit.update({ where: { key }, data: { attempts: { increment: 1 } } })
  return { allowed: true }
}

// x-forwarded-for é setado de forma confiável pela Vercel com o IP real do
// cliente (primeiro da lista, se houver proxies encadeados).
export async function clientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return h.get("x-real-ip") ?? "unknown"
}
