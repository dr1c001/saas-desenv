"use server"

import { prisma } from "@/lib/prisma"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import type { EstadoDaIndicacao } from "@/lib/indicacao"

// A tela de cadastro para de prometer o que não sabe.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// /register lia `?ref=` da URL e, se houvesse QUALQUER valor, mostrava o banner
// verde "Código de indicação aplicado! Você ganhou 10% de desconto" e trocava o
// subtítulo. Quem concede de verdade é lib/auth.ts, que só concede quando
// existe um Tenant com aquele `referralCode` — e o código é gerado SOB DEMANDA
// (actions/referral.ts), ficando nulo até alguém abrir /referral.
//
// Bastava o link chegar truncado pelo WhatsApp, ou o indicador nunca ter aberto
// a tela de indicação: o visitante lia o banner, criava a conta e pagava o
// preço cheio. Ninguém avisava, em momento nenhum.
//
// ─── Por que é um ORÁCULO, e o que isso obriga ───────────────────────────────
//
// Responder "existe / não existe" sobre um identificador é, por construção, um
// oráculo de enumeração: com ele dá para varrer o espaço de códigos e descobrir
// quais empresas têm programa de indicação ativo. Por isso três coisas:
//
//   1. limite por IP, e o estouro NÃO vira "inválido" — vira "não consegui
//      conferir", que é a verdade e não desmente um código bom;
//   2. a resposta é só o ESTADO, nunca o nome da empresa, o id, nem nada que
//      identifique quem indicou;
//   3. nada é gravado. A concessão continua acontecendo uma única vez, em
//      lib/auth.ts, na criação do tenant — esta função não concede nada.
//
// (Achado na auditoria de 13/09/2026, grupo 9.)

/** Quantas conferências por IP, e em quantos minutos. Conferir é mais barato
 *  que cadastrar (8/60min em actions/auth.ts), mas é o oráculo — então o teto é
 *  próximo, e não generoso. */
const POR_IP = 10
const JANELA_MIN = 60

export async function conferirIndicacao(codigo: string): Promise<EstadoDaIndicacao> {
  const limpo = codigo.trim()
  if (!limpo) return "invalido"
  // Um código tem tamanho conhecido (nanoid em actions/referral.ts). Recusar o
  // absurdo antes de tocar no banco evita que a consulta vire o custo do ataque.
  if (limpo.length > 64) return "invalido"

  const ip = await clientIp().catch(() => null)
  if (ip) {
    const pode = await checkRateLimit(`indicacao:ip:${ip}`, POR_IP, JANELA_MIN)
    // NÃO é "invalido": quem estourou o limite pode estar com um código bom.
    if (!pode.allowed) return "naoConferido"
  }

  try {
    const dono = await prisma.tenant.findFirst({
      where: { referralCode: limpo },
      select: { id: true },
    })
    return dono ? "valido" : "invalido"
  } catch (e) {
    // Banco fora do ar não pode virar "seu código não vale".
    console.error("[indicacao] falha ao conferir o código:", e)
    return "naoConferido"
  }
}
