import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { escaparHtml } from "@/lib/html"

// O nome da empresa saía CRU no HTML do e-mail que sai em nome dela.
//
// `emailEmNomeDaEmpresa` escapava o corpo (`& < >`) e interpolava
// `${companyName}` direto no <h2>, na linha de cima. O nome é digitado pela
// própria empresa, com validação só de tamanho. "Silva & Cia <Refrigeração>"
// perdia a palavra entre < >; um `<img onerror=...>` no nome sairia por
// noreply@servicoos.com.br — remetente autenticado do nosso domínio — para a
// caixa de entrada de um terceiro, em quatro e-mails: aviso de status,
// orçamento, OS concluída e cobrança.
//
// Os outros templates tinham a mesma exposição por outro caminho: t() e
// t.markup() inserem os values literalmente. O nome da pessoa e o da empresa
// entram escapados em todos agora. (Achado na auditoria de 13/09/2026.)
//
// Monta o e-mail de verdade com o Resend trocado por espião — mesmo harness
// de past-due-email.test.ts.

const enviados: { subject: string; html: string; to: string }[] = []

beforeEach(() => {
  vi.resetModules()
  enviados.length = 0
  process.env.RESEND_API_KEY = "chave-de-teste"
  process.env.VERCEL_ENV = "production"
  vi.doMock("resend", () => ({
    Resend: class {
      emails = {
        send: async (p: { subject: string; html: string; to: string }) => {
          enviados.push(p)
          return { data: { id: "x" }, error: null }
        },
      }
    },
  }))
})

afterEach(() => {
  vi.doUnmock("resend")
  delete process.env.VERCEL_ENV
})

const NOME = "Silva & Cia <Refrigeração>"

describe("escaparHtml", () => {
  it("troca os cinco caracteres, com o & primeiro", () => {
    expect(escaparHtml(`a & b < c > d " e ' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f")
    // Se o & fosse trocado por último, o "&lt;" recém-criado viraria "&amp;lt;".
    expect(escaparHtml("&lt;")).toBe("&amp;lt;")
    expect(escaparHtml("")).toBe("")
  })
})

describe("o e-mail em nome da empresa", () => {
  it("o nome da empresa chega inteiro no cabeçalho — e cru no assunto", async () => {
    const { sendQuoteEmail } = await import("@/lib/resend")
    await sendQuoteEmail("cliente@exemplo.com", NOME, "ORC-0001", "Segue o orçamento.", null)

    const e = enviados[0]
    expect(e.html).toContain(`<h2 style="margin:0 0 16px">Silva &amp; Cia &lt;Refrigeração&gt;</h2>`)
    expect(e.html).not.toContain("<Refrigeração>")
    // O assunto é cabeçalho de texto puro: "&amp;" apareceria literal na caixa
    // de entrada. Nunca escapar.
    expect(e.subject).toBe(`ORC-0001 — ${NOME}`)
  })

  it("HTML no nome da empresa não vira tag na caixa do cliente", async () => {
    const { sendDunningEmail } = await import("@/lib/resend")
    await sendDunningEmail("cliente@exemplo.com", '<img src=x onerror="alert(1)">', "Cobrança", "Texto", null)

    expect(enviados[0].html).not.toMatch(/<img/i)
    expect(enviados[0].html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
  })

  it("o corpo continua escapado depois da extração do helper", async () => {
    const { sendClientNoticeEmail } = await import("@/lib/resend")
    await sendClientNoticeEmail("cliente@exemplo.com", "Empresa", "1 < 2 & 3 > 2 <b>x</b>", "pt")

    expect(enviados[0].html).toContain("1 &lt; 2 &amp; 3 &gt; 2 &lt;b&gt;x&lt;/b&gt;")
    expect(enviados[0].html).not.toContain("<b>x</b>")
  })

  it("a OS concluída passa pelo mesmo caminho", async () => {
    const { sendOsEmail } = await import("@/lib/resend")
    await sendOsEmail("cliente@exemplo.com", NOME, "OS20260042", "Concluída.", null)

    expect(enviados[0].html).toContain("&lt;Refrigeração&gt;")
  })
})

describe("os e-mails do ServiçoOS para o dono e a equipe", () => {
  it("o convite de equipe escapa o nome da empresa — quem recebe é um terceiro", async () => {
    const { sendTeamInviteEmail } = await import("@/lib/resend")
    await sendTeamInviteEmail("novo@exemplo.com", "Ana <b>", NOME, "https://x/convite", "pt")

    expect(enviados[0].html).toContain("Silva &amp; Cia &lt;Refrigeração&gt;")
    expect(enviados[0].html).toContain("Ana &lt;b&gt;")
    expect(enviados[0].html).not.toContain("<Refrigeração>")
  })

  it("o aviso de atraso escapa nome e empresa", async () => {
    const { sendPastDueWarningEmail } = await import("@/lib/resend")
    await sendPastDueWarningEmail("dona@exemplo.com", "Priscila <i>", NOME, 10, "pt")

    expect(enviados[0].html).toContain("Priscila &lt;i&gt;")
    expect(enviados[0].html).toContain("&lt;Refrigeração&gt;")
  })
})
