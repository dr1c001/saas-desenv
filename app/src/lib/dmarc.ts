/**
 * A política DMARC do domínio de e-mail: o que está publicado protege?
 *
 * ─── O defeito ───────────────────────────────────────────────────────────────
 *
 * `_dmarc.servicoos.com.br` nunca foi publicado. A migração de domínio de
 * 05/08/2026 configurou DKIM e SPF da Resend; a troca para o Zoho em 06/08
 * configurou MX, SPF e DKIM do Zoho — DMARC não entrou em nenhuma das duas
 * listas. TODO e-mail do sistema sai como noreply@servicoos.com.br, inclusive
 * cobrança, orçamento e OS em nome das empresas clientes. Sem política, o
 * Gmail não tem instrução para rejeitar nem quarentenar um remetente forjado
 * com o nosso domínio, e ninguém recebe relatório.
 *
 * E nada no código detectava: a Resend devolve sucesso porque ELA aceitou a
 * mensagem. Foi exatamente essa invisibilidade que deixou isto passar duas
 * migrações de DNS. (Achado na auditoria de 13/09/2026.)
 *
 * ─── O que este módulo faz ───────────────────────────────────────────────────
 *
 * A correção de verdade é publicar o TXT — fora do código, no registro.br.
 * O código entra para tornar a ausência (e qualquer regressão futura) VISÍVEL
 * pelo canal que já existe: o cron confere uma vez por dia, conta como erro,
 * e isso faz CronRun.ok=false, /api/health devolver 503 e o e-mail de falha
 * chegar ao fundador.
 *
 * Módulo PURO — sem rede, sem Prisma. O lado que resolve DNS está em
 * lib/conferir-dmarc.ts, separado para `node:dns` nunca ser puxado por quem
 * importa só a constante (lib/resend.ts importa DOMINIO_DE_EMAIL daqui).
 */
export const DOMINIO_DE_EMAIL = "servicoos.com.br"
export const NOME_DMARC = `_dmarc.${DOMINIO_DE_EMAIL}`

export type VeredictoDmarc = {
  estado: "ok" | "ausente" | "fraca" | "indisponivel"
  /** ausente e fraca: alguém tem de mexer no DNS. indisponivel: tenta amanhã, não conta como erro. */
  precisaDeAcao: boolean
  motivo: string
}

/**
 * Avalia os registros TXT de `_dmarc` já resolvidos. `null` = o nome não
 * existe ou não tem TXT — que é o achado.
 */
export function avaliarDmarc(txts: string[] | null): VeredictoDmarc {
  const registros = (txts ?? []).map((t) => t.trim()).filter((t) => /^v=DMARC1\b/i.test(t))
  if (registros.length === 0) {
    return { estado: "ausente", precisaDeAcao: true, motivo: `${NOME_DMARC} não tem registro v=DMARC1` }
  }
  if (registros.length > 1) {
    // RFC 7489 §6.6.3: com mais de um registro os provedores ignoram todos.
    return { estado: "fraca", precisaDeAcao: true, motivo: "mais de um registro DMARC — os provedores ignoram todos" }
  }

  const tags = Object.fromEntries(
    registros[0]
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=")
        return i < 0 ? [p.toLowerCase(), ""] : [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()]
      })
  ) as Record<string, string>

  const p = (tags.p ?? "").toLowerCase()
  if (!p || p === "none") {
    return { estado: "fraca", precisaDeAcao: true, motivo: "p=none só observa — não impede remetente forjado" }
  }
  if (tags.pct !== undefined && Number(tags.pct) < 100) {
    return { estado: "fraca", precisaDeAcao: true, motivo: `pct=${tags.pct}: parte do tráfego forjado passa` }
  }
  if (!tags.rua) {
    return { estado: "fraca", precisaDeAcao: true, motivo: "sem rua= ninguém recebe relatório de falha" }
  }
  return { estado: "ok", precisaDeAcao: false, motivo: `p=${p}` }
}
