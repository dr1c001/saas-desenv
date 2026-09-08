import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Escrito para reproduzir um defeito RELATADO: "as assinaturas da equipe e
// proprietário não estão salvando". Em produção: 6 usuários, ZERO assinaturas.
//
// A causa era um piso de 200 bytes na validação. Byte não mede tamanho de
// desenho, mede COMPRESSÃO — e um traço aparado sobre fundo transparente
// comprime tão bem que assinatura legítima ficava abaixo do piso. A tela dizia
// "o traço ficou pequeno demais"; a pessoa desenhava maior; continuava sendo
// recusada, porque desenhar maior quase não muda o tamanho do arquivo.

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

/** Um PNG transparente do tamanho que `getTrimmedCanvas()` produz. */
async function png(largura: number, altura: number): Promise<string> {
  const buf = await sharp({
    create: {
      width: largura,
      height: altura,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()
  return `data:image/png;base64,${buf.toString("base64")}`
}

/** O rabisco típico: quadro aparado, ~300x80. */
const assinatura = () => png(300, 80)

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Empresa" } })
  const user = await testDb.db.user.create({
    data: { id: "u1", name: "Beto", email: "beto@x.com", tenantId: tenant.id },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: user.id, role: "TECHNICIAN" })
  return { tenant, user }
}

describe("gravar a própria assinatura", () => {
  it("GRAVA de verdade no banco", async () => {
    const { user } = await cenario()
    const { salvarMinhaAssinatura } = await import("@/actions/assinatura")

    expect(await salvarMinhaAssinatura(await assinatura())).toEqual({ ok: true })

    const depois = await testDb.db.user.findUnique({ where: { id: user.id } })
    expect(depois!.signatureUrl).toMatch(/^data:image\/png;base64,/)
  })

  it("aceita assinatura LEVE — o defeito que deixou 6 pessoas sem assinar", async () => {
    // O teste que faltava. Este PNG tem tamanho de assinatura (300x80) e pesa
    // pouco mais de 100 bytes, porque área uniforme comprime quase a zero. Com
    // o piso antigo de 200 bytes ele era recusado como "pequena" — e nenhuma
    // quantidade de "desenhe maior" resolvia.
    await cenario()
    const { salvarMinhaAssinatura } = await import("@/actions/assinatura")
    const leve = await assinatura()

    const bytes = Buffer.from(leve.split(",")[1], "base64").length
    expect(bytes, "o caso só prova algo se o arquivo for mesmo leve").toBeLessThan(200)

    expect(await salvarMinhaAssinatura(leve)).toEqual({ ok: true })
  })

  it("a assinatura gravada é LIDA de volta pela mesma tela", async () => {
    await cenario()
    const { salvarMinhaAssinatura, minhaAssinatura } = await import("@/actions/assinatura")

    await salvarMinhaAssinatura(await assinatura())

    expect(await minhaAssinatura()).toMatch(/^data:image\/png;base64,/)
  })

  it("recusa com MOTIVO o que não serve como assinatura", async () => {
    await cenario()
    const { salvarMinhaAssinatura } = await import("@/actions/assinatura")

    expect(await salvarMinhaAssinatura("data:image/jpeg;base64,AAAA")).toEqual({ erro: "formato" })
    expect(await salvarMinhaAssinatura("data:image/png;base64,QQ==")).toEqual({ erro: "pequena" })
    // Toque acidental: um ponto. Recusado pelas DIMENSÕES, não pelo peso.
    expect(await salvarMinhaAssinatura(await png(6, 6))).toEqual({ erro: "pequena" })
  })

  it("grava a de QUEM PEDE, e não a de outra pessoa", async () => {
    // A action não aceita userId de propósito: Server Action é endereço HTTP, e
    // assinatura trocada é documento assinado por quem não assinou.
    const { tenant } = await cenario()
    const outro = await testDb.db.user.create({
      data: { id: "u2", name: "Ana", email: "ana@x.com", tenantId: tenant.id },
    })
    const { salvarMinhaAssinatura } = await import("@/actions/assinatura")

    await salvarMinhaAssinatura(await assinatura())

    expect((await testDb.db.user.findUnique({ where: { id: outro.id } }))!.signatureUrl).toBeNull()
  })

  it("apagar limpa o campo", async () => {
    const { user } = await cenario()
    const { salvarMinhaAssinatura, apagarMinhaAssinatura } = await import("@/actions/assinatura")

    await salvarMinhaAssinatura(await assinatura())
    await apagarMinhaAssinatura()

    expect((await testDb.db.user.findUnique({ where: { id: user.id } }))!.signatureUrl).toBeNull()
  })
})
