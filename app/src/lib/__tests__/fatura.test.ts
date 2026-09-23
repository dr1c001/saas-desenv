import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// A FATURA em PDF, e o download da nota fiscal para anexar.
//
// ─── O que se prova aqui ─────────────────────────────────────────────────────
//
// O documento é gerado de verdade (renderToBuffer roda), então o teste afirma o
// que dá para afirmar sem abrir o PDF: que ele NASCE quando deve, que NÃO nasce
// quando não há o que cobrar, e que uma OS de outra empresa não vira fatura
// aqui — com os dados do cliente dela dentro.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

const execucao = new Date("2026-09-10T12:00:00Z")
const dia = 24 * 60 * 60 * 1000

async function cenario(opts: { comPix?: boolean } = {}) {
  const tenant = await testDb.db.tenant.create({
    data: {
      name: "Polar Clima",
      document: "12345678000199",
      ...(opts.comPix === false
        ? {}
        : {
            pixKey: "12345678000199",
            pixKeyType: "cnpj",
            pixReceiver: "POLAR CLIMA LTDA",
            pixCity: "SAO PAULO",
          }),
    },
  })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Auto Posto Rodovia", document: "98765432000188" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      number: 42,
      title: "Troca de compressor",
      clientId: cliente.id,
      status: "INVOICED",
      totalAmount: 2000,
      concludedAt: execucao,
    },
  })
  return { tenant, cliente, os }
}

async function parcela(
  tenantId: string,
  orderId: string,
  valor: number,
  dias: number,
  paga = false
) {
  return testDb.db.revenue.create({
    data: {
      tenantId,
      orderId,
      description: `OS20260042 — Troca de compressor (${dias}d)`,
      amount: valor,
      dueDate: new Date(execucao.getTime() + dias * dia),
      ...(paga ? { status: "PAID" as const, paidAt: new Date() } : {}),
    },
  })
}

const lib = () => import("@/lib/fatura")

describe("a fatura", () => {
  it("nasce quando há parcela em aberto", async () => {
    const { tenant, os } = await cenario()
    await parcela(tenant.id, os.id, 500, 0, true)
    await parcela(tenant.id, os.id, 1500, 7)
    const { gerarFatura } = await lib()

    const f = await gerarFatura(tenant.id, os.id)

    expect(f).not.toBeNull()
    expect(f!.buffer.length).toBeGreaterThan(1000)
    // Um PDF de verdade começa com %PDF.
    expect(f!.buffer.subarray(0, 4).toString()).toBe("%PDF")
    // O nome do arquivo diz de qual OS é: o cliente salva isso na pasta dele.
    expect(f!.nomeArquivo).toContain("OS2026")
  })

  it("NÃO nasce quando tudo já foi pago", async () => {
    // Não existe fatura de conta quitada. Devolver um PDF vazio seria pior: ele
    // iria anexado num e-mail e o cliente abriria um documento que não diz nada.
    const { tenant, os } = await cenario()
    await parcela(tenant.id, os.id, 2000, 0, true)
    const { gerarFatura } = await lib()

    expect(await gerarFatura(tenant.id, os.id)).toBeNull()
  })

  it("NÃO nasce quando a OS não tem recebimento nenhum", async () => {
    const { tenant, os } = await cenario()
    const { gerarFatura } = await lib()

    expect(await gerarFatura(tenant.id, os.id)).toBeNull()
  })

  it("uma OS de OUTRA empresa não vira fatura aqui", async () => {
    // Sem o filtro de tenant, um id de fora geraria um PDF com o nome e o
    // documento do cliente de outra base dentro.
    const { tenant, os } = await cenario()
    await parcela(tenant.id, os.id, 1500, 7)
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const { gerarFatura } = await lib()

    expect(await gerarFatura(outra.id, os.id)).toBeNull()
  })

  it("funciona sem PIX configurado", async () => {
    // A empresa que não configurou a chave continua conseguindo mandar a
    // fatura — ela só sai sem o "onde pagar".
    const { tenant, os } = await cenario({ comPix: false })
    await parcela(tenant.id, os.id, 1500, 7)
    const { gerarFatura } = await lib()

    const f = await gerarFatura(tenant.id, os.id)
    expect(f).not.toBeNull()
  })
})

describe("baixar a nota fiscal para anexar", () => {
  it("devolve o arquivo quando o emissor responde", async () => {
    const conteudo = Buffer.alloc(2048, 1)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => conteudo })) as unknown as typeof fetch
    )
    const { baixarNotaFiscal } = await lib()

    const b = await baixarNotaFiscal("https://emissor/nota.pdf")

    expect(b?.length).toBe(2048)
    vi.unstubAllGlobals()
  })

  it("resposta minúscula é página de erro, não documento", async () => {
    // Anexar isso faria o cliente abrir um arquivo quebrado em nome da empresa.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(20) })) as unknown as typeof fetch
    )
    const { baixarNotaFiscal } = await lib()

    expect(await baixarNotaFiscal("https://emissor/erro")).toBeNull()
    vi.unstubAllGlobals()
  })

  it("falha de rede vira null, e não exceção", async () => {
    // Isto roda DENTRO do cron diário. Uma exceção aqui derrubaria as etapas
    // seguintes — e a cobrança sair sem a nota é muito melhor do que a cobrança
    // não sair.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout") }) as unknown as typeof fetch)
    const { baixarNotaFiscal } = await lib()

    expect(await baixarNotaFiscal("https://emissor/nota.pdf")).toBeNull()
    vi.unstubAllGlobals()
  })

  it("resposta de erro do emissor vira null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, arrayBuffer: async () => Buffer.alloc(0) })) as unknown as typeof fetch
    )
    const { baixarNotaFiscal } = await lib()

    expect(await baixarNotaFiscal("https://emissor/404")).toBeNull()
    vi.unstubAllGlobals()
  })
})
