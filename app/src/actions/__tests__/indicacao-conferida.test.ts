import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { DESCONTO_DE_QUEM_E_INDICADO } from "@/lib/indicacao"

// A tela de cadastro prometia 10% para QUALQUER ?ref=.
//
// Ela lia o parâmetro da URL e, havendo qualquer valor, mostrava o banner verde
// "Código de indicação aplicado! Você ganhou 10% de desconto" e trocava o
// subtítulo. Quem concede de verdade é lib/auth.ts, que só concede quando
// existe um Tenant com aquele `referralCode` — e o código é gerado SOB DEMANDA
// (actions/referral.ts), ficando nulo até alguém abrir /referral.
//
// Bastava o link chegar truncado pelo WhatsApp, ou o indicador nunca ter aberto
// a tela: o visitante lia o banner, criava a conta e pagava o preço cheio.
// Ninguém avisava, em momento nenhum.
//
// (Achado na auditoria de 13/09/2026, grupo 9.)

let testDb: TestDatabase
const mockLimite = vi.fn()
const mockIp = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: mockLimite,
    clientIp: mockIp,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockLimite.mockReset().mockResolvedValue({ allowed: true, remaining: 9 })
  mockIp.mockReset().mockResolvedValue("1.2.3.4")
})

const conferir = async (codigo: string) => {
  const { conferirIndicacao } = await import("@/actions/conferir-indicacao")
  return conferirIndicacao(codigo)
}

async function empresaComCodigo(codigo: string) {
  return testDb.db.tenant.create({ data: { name: "Quem Indicou", referralCode: codigo } })
}

describe("conferir o código de indicação", () => {
  it("código de uma empresa de verdade: válido", async () => {
    await empresaComCodigo("ABC123")
    expect(await conferir("ABC123")).toBe("valido")
  })

  it("código que não é de ninguém: inválido", async () => {
    // O caso do link truncado no WhatsApp.
    await empresaComCodigo("ABC123")
    expect(await conferir("ABC")).toBe("invalido")
  })

  it("vazio: inválido, sem tocar no banco", async () => {
    expect(await conferir("   ")).toBe("invalido")
  })

  it("e espaço em volta não estraga um código bom", async () => {
    await empresaComCodigo("ABC123")
    expect(await conferir("  ABC123 ")).toBe("valido")
  })
})

describe("o que NÃO pode virar 'seu código não vale'", () => {
  it("estourar o limite por IP devolve 'não conferido'", async () => {
    // A trava existe porque isto é um oráculo de enumeração. Mas quem estourou
    // o limite pode estar com um código BOM — desmenti-lo seria recriar a
    // mentira pelo lado oposto, no momento exato da conversão.
    await empresaComCodigo("ABC123")
    mockLimite.mockResolvedValue({ allowed: false, remaining: 0 })

    expect(await conferir("ABC123")).toBe("naoConferido")
  })

  it("banco fora do ar devolve 'não conferido'", async () => {
    const { conferirIndicacao } = await import("@/actions/conferir-indicacao")
    vi.spyOn(testDb.db.tenant, "findFirst").mockRejectedValueOnce(new Error("sem banco"))

    expect(await conferirIndicacao("ABC123")).toBe("naoConferido")
  })

  it("mas um código absurdamente longo é recusado antes do banco", async () => {
    const espiao = vi.spyOn(testDb.db.tenant, "findFirst")
    // O espião sobrevive entre os `it` deste arquivo (o alvo é o mesmo objeto),
    // então carrega as chamadas dos testes acima. Zerar antes de afirmar.
    espiao.mockClear()
    expect(await conferir("x".repeat(500))).toBe("invalido")
    expect(espiao).not.toHaveBeenCalled()
    espiao.mockRestore()
  })
})

describe("a conferência não concede nada", () => {
  it("nenhum desconto é gravado ao conferir", async () => {
    // Quem concede continua sendo lib/auth.ts, uma vez só, na criação do
    // tenant. Esta função só responde.
    const dono = await empresaComCodigo("ABC123")

    await conferir("ABC123")

    const depois = await testDb.db.tenant.findUnique({ where: { id: dono.id } })
    expect(depois!.referralDiscountPercent).toBe(0)
  })
})

describe("a tela obedece os quatro estados", () => {
  // Estrutural: a tela é client component com react-hook-form, zod e Supabase.
  // O defeito era a CONDIÇÃO que decidia mostrar a promessa.
  const TELA = readFileSync(
    join(process.cwd(), "src/app/(auth)/register/page.tsx"),
    "utf8"
  )
  const mensagens = (idioma: "pt" | "en") =>
    JSON.parse(readFileSync(join(process.cwd(), `messages/${idioma}.json`), "utf8")) as {
      auth: { register: Record<string, string> }
    }

  it("o banner verde só aparece quando o código FOI conferido", () => {
    // A condição de antes era `{refCode && (`: qualquer valor na URL.
    expect(TELA).toMatch(/refCode && estadoDaIndicacao === "valido" &&/)
    expect(TELA).not.toMatch(/\{refCode && \(\r?\n\s*<div className="mb-4 rounded-lg border border-green/)
  })

  it("e o subtítulo que promete também", () => {
    expect(TELA).toMatch(/refCode && estadoDaIndicacao === "valido"[\s\S]{0,120}subtitleWithRef/)
  })

  it("os quatro estados têm caixa na tela", () => {
    for (const estado of ["conferindo", "valido", "invalido", "naoConferido"]) {
      expect(TELA, estado).toContain(`estadoDaIndicacao === "${estado}"`)
    }
  })

  it.each(["pt", "en"] as const)("e texto nos dois idiomas — %s", (idioma) => {
    const r = mensagens(idioma).auth.register
    for (const chave of ["refChecking", "refBanner", "refInvalid", "refUnknown", "subtitleWithRef"]) {
      expect(typeof r[chave], chave).toBe("string")
    }
  })
})

describe("o percentual tem UM dono", () => {
  const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("o número saiu dos textos de venda", () => {
    // Estava escrito à mão em quatro textos (dois por idioma). Mudar o
    // percentual exigia lembrar de seis lugares, e esquecer um faz o sistema
    // prometer uma coisa e conceder outra.
    for (const idioma of ["pt", "en"] as const) {
      const r = JSON.parse(ler(`messages/${idioma}.json`)).auth.register
      expect(r.refBanner, idioma).toContain("{percent}")
      expect(r.subtitleWithRef, idioma).toContain("{percent}")
      expect(r.refBanner, idioma).not.toMatch(/\b10\s*%/)
      expect(r.subtitleWithRef, idioma).not.toMatch(/\b10\s*%/)
    }
  })

  it("e quem concede usa a mesma constante que a tela mostra", () => {
    expect(DESCONTO_DE_QUEM_E_INDICADO).toBe(10)
    expect(ler("src/lib/auth.ts")).toContain("DESCONTO_DE_QUEM_E_INDICADO")
    expect(ler("src/app/(auth)/register/page.tsx")).toContain("DESCONTO_DE_QUEM_E_INDICADO")
  })

  it("e ninguém mais aponta para o arquivo que não existe", () => {
    // Dois comentários mandavam espelhar o valor em `api/referral/join/route.ts`,
    // removido em algum momento — a instrução ficou apontando para o nada.
    for (const arq of ["src/lib/auth.ts", "src/lib/confirmar-pagamento.ts"]) {
      const fonte = ler(arq)
      const menciona = fonte.includes("api/referral/join")
      // Só pode aparecer na frase que EXPLICA que ele não existe.
      if (menciona) expect(fonte, arq).toMatch(/api\/referral\/join[^\n]*\n?[^\n]*n[ãa]o existe/i)
    }
  })
})
