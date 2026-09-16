import { describe, expect, it } from "vitest"
import { ehRecusaCerta, ehTimeout, RecusaExterna } from "@/lib/tempo-limite"

// As chamadas à Asaas, à nfe.io e ao Z-API não tinham timeout — e dois
// `catch` dependiam disso para soltar reserva e apagar linha "em qualquer
// erro". Com timeout, "não sei se saiu" virou rotina, e este módulo é o que
// separa "o serviço disse não" de "não sei". (Achado na auditoria de 13/09/2026.)

describe("recusa certa", () => {
  it("é o serviço RESPONDENDO com 4xx — nada foi criado do outro lado", () => {
    expect(ehRecusaCerta(new RecusaExterna("nfe.io /x", 400, "CNPJ inválido"))).toBe(true)
    expect(ehRecusaCerta(new RecusaExterna("Asaas /y", 422, "cartão recusado"))).toBe(true)
  })

  it("5xx de gateway NÃO é recusa certa: o backend pode ter processado", () => {
    expect(ehRecusaCerta(new RecusaExterna("nfe.io /x", 502, "Bad Gateway"))).toBe(false)
    expect(ehRecusaCerta(new RecusaExterna("nfe.io /x", 504, ""))).toBe(false)
  })

  it("timeout, socket caído e JSON quebrado não são recusa", () => {
    expect(ehRecusaCerta(Object.assign(new Error("aborted"), { name: "TimeoutError" }))).toBe(false)
    expect(ehRecusaCerta(Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_SOCKET" } }))).toBe(false)
    expect(ehRecusaCerta(new SyntaxError("Unexpected token"))).toBe(false)
    expect(ehRecusaCerta(new Error("qualquer coisa"))).toBe(false)
  })

  it("a mensagem carrega serviço, status e corpo — é o que vai para o log e para a tela", () => {
    const e = new RecusaExterna("nfe.io /companies", 400, "CNPJ inválido")
    expect(e.message).toBe("nfe.io /companies → 400: CNPJ inválido")
    expect(e.name).toBe("RecusaExterna")
    expect(e).toBeInstanceOf(Error)
  })
})

describe("timeout", () => {
  it("o TimeoutError do AbortSignal.timeout — e o AbortError de undici antigo", () => {
    expect(ehTimeout(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true)
    expect(ehTimeout(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true)
    expect(ehTimeout(new Error("x"))).toBe(false)
    expect(ehTimeout("TimeoutError")).toBe(false)
  })
})

describe("os três clientes têm timeout e lançam RecusaExterna", () => {
  // Estrutural: as bibliotecas são mockadas inteiras nos testes de quem as
  // usa, então a única forma de garantir que o `signal` está lá é ler o fonte.
  const ler = (p: string) => import("node:fs/promises").then((fs) => fs.readFile(p, "utf-8"))

  it("nfe.io: signal por chamada, RecusaExterna no não-ok, consulta e upload com tempos próprios", async () => {
    const f = await ler("src/lib/nfeio.ts")
    expect(f).toContain("signal: AbortSignal.timeout(tempoLimiteMs)")
    expect(f).toContain("throw new RecusaExterna(")
    expect(f).toContain("TEMPO_LIMITE_NFEIO_CONSULTA_MS")
    expect(f).toContain("TEMPO_LIMITE_NFEIO_UPLOAD_MS")
  })

  it("Asaas: signal e RecusaExterna", async () => {
    const f = await ler("src/lib/asaas.ts")
    expect(f).toContain("signal: AbortSignal.timeout(TEMPO_LIMITE_ASAAS_MS)")
    expect(f).toContain("throw new RecusaExterna(")
  })

  it("Z-API: signal (o catch já devolve false)", async () => {
    const f = await ler("src/lib/whatsapp.ts")
    expect(f).toContain("signal: AbortSignal.timeout(TEMPO_LIMITE_ZAPI_MS)")
  })

  it("o signal vem DEPOIS do spread de options — ninguém sobrescreve sem querer", async () => {
    for (const p of ["src/lib/nfeio.ts", "src/lib/asaas.ts"]) {
      const f = await ler(p)
      expect(f.indexOf("...options")).toBeLessThan(f.indexOf("signal: AbortSignal.timeout("))
    }
  })

  it("quem decide reserva e linha importa de tempo-limite, e não das bibliotecas mockadas", async () => {
    expect(await ler("src/actions/nfse.ts")).toContain('import { ehRecusaCerta } from "@/lib/tempo-limite"')
    expect(await ler("src/actions/billing.ts")).toContain('import { ehRecusaCerta } from "@/lib/tempo-limite"')
  })
})
