import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

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

async function seedTenant(name: string) {
  return testDb.db.tenant.create({ data: { name } })
}

describe("clients — isolamento entre tenants", () => {
  it("getClient não retorna cliente de outro tenant (IDOR)", async () => {
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    const client = await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente da A" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenantB.id, userId: "u1", role: "OWNER" })
    const { getClient } = await import("@/actions/clients")
    const result = await getClient(client.id)

    expect(result).toBeNull()
  })

  it("getClient retorna o cliente pro tenant dono", async () => {
    const tenantA = await seedTenant("Empresa A")
    const client = await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente da A" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenantA.id, userId: "u1", role: "OWNER" })
    const { getClient } = await import("@/actions/clients")
    const result = await getClient(client.id)

    expect(result?.id).toBe(client.id)
  })

  it("getClients só lista clientes do próprio tenant", async () => {
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente A1" } })
    await testDb.db.client.create({ data: { tenantId: tenantA.id, name: "Cliente A2" } })
    await testDb.db.client.create({ data: { tenantId: tenantB.id, name: "Cliente B1" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenantA.id, userId: "u1", role: "OWNER" })
    const { getClients } = await import("@/actions/clients")
    const result = await getClients()

    expect(result).toHaveLength(2)
    expect(result.every((c) => c.name.startsWith("Cliente A"))).toBe(true)
  })
})

describe("clients — checagem de papel", () => {
  it("deleteClient bloqueia TECHNICIAN e não apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const client = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "Cliente" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { deleteClient } = await import("@/actions/clients")

    await expect(deleteClient(client.id)).rejects.toThrow("REDIRECT:/clients")

    const stillExists = await testDb.db.client.findUnique({ where: { id: client.id } })
    expect(stillExists).not.toBeNull()
  })

  it("deleteClient permite OWNER e apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const client = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "Cliente" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { deleteClient } = await import("@/actions/clients")

    await expect(deleteClient(client.id)).rejects.toThrow("REDIRECT:/clients")

    const stillExists = await testDb.db.client.findUnique({ where: { id: client.id } })
    expect(stillExists).toBeNull()
  })

  it("deleteClient permite ADMIN e apaga o registro", async () => {
    const tenant = await seedTenant("Empresa")
    const client = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "Cliente" } })

    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "ADMIN" })
    const { deleteClient } = await import("@/actions/clients")

    await expect(deleteClient(client.id)).rejects.toThrow("REDIRECT:/clients")

    const stillExists = await testDb.db.client.findUnique({ where: { id: client.id } })
    expect(stillExists).toBeNull()
  })
})

// ─── Importação por planilha ─────────────────────────────────────────────────
// A leitura do arquivo e o mapeamento de colunas são testados isolados em
// lib/__tests__. Aqui interessa o que só o banco prova: o que foi realmente
// gravado, se o endereço ficou ligado ao cliente certo, e se um tenant enxerga
// o outro.

function planilha(nome: string): File {
  const buf = readFileSync(`src/lib/__tests__/fixtures/${nome}`)
  return new File([new Uint8Array(buf)], nome)
}

function csv(conteudo: string, nome = "clientes.csv"): File {
  return new File([conteudo], nome)
}

function envio(arquivo: File): FormData {
  const fd = new FormData()
  fd.set("arquivo", arquivo)
  return fd
}

describe("importClients", () => {
  it("grava os clientes de um .xlsx feito por ferramenta real", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    const r = await importClients({ ok: false }, envio(planilha("clientes.xlsx")))

    expect(r.ok).toBe(true)
    expect(r.importados).toBe(3)

    const gravados = await testDb.db.client.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    })
    expect(gravados.map((c) => c.name)).toEqual([
      "Ana Souza",
      "Carlos <Teste>",
      "José da Silva & Cia",
    ])
    // O acento tem que sobreviver ao caminho inteiro: zip -> XML -> banco.
    expect(gravados.find((c) => c.name.startsWith("José"))?.email).toBe("jose@exemplo.com.br")
  })

  it("liga o endereço ao cliente certo, não ao vizinho", async () => {
    // O risco real de gravar em lote: casar endereço com cliente por posição.
    // Cada linha aqui tem cidade diferente, então uma troca aparece na hora.
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    await importClients(
      { ok: false },
      envio(
        csv(
          "Nome;Cidade;UF\n" +
            "Primeiro;Piracicaba;SP\n" +
            "Segundo;Campinas;SP\n" +
            "Terceiro;Santos;SP\n"
        )
      )
    )

    const gravados = await testDb.db.client.findMany({
      where: { tenantId: tenant.id },
      include: { address: true },
    })
    const porNome = Object.fromEntries(gravados.map((c) => [c.name, c.address?.city]))
    expect(porNome).toEqual({ Primeiro: "Piracicaba", Segundo: "Campinas", Terceiro: "Santos" })
  })

  it("não cria endereço em branco quando a planilha não traz endereço", async () => {
    // Endereço vazio seria varrido todo dia pelo backfill de coordenadas sem
    // nunca ter o que geocodificar.
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    await importClients({ ok: false }, envio(csv("Nome;Telefone\nAna Souza;11999998888\n")))

    expect(await testDb.db.address.count()).toBe(0)
  })

  it("não geocodifica na importação (o cron faz o backfill)", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    await importClients({ ok: false }, envio(csv("Nome;Cidade\nAna Souza;Piracicaba\n")))

    const addr = await testDb.db.address.findFirst()
    expect(addr?.city).toBe("Piracicaba")
    expect(addr?.latitude).toBeNull()
  })

  it("pula quem já está cadastrado, mesmo com o documento formatado diferente", async () => {
    const tenant = await seedTenant("Empresa")
    await testDb.db.client.create({
      data: { tenantId: tenant.id, name: "José da Silva", document: "123.456.789-09" },
    })
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    // Mesmo CPF, sem pontuação: comparar cru deixaria entrar duplicado.
    const r = await importClients(
      { ok: false },
      envio(csv("Nome;CPF\nJose da Silva;12345678909\nAna Souza;98765432100\n"))
    )

    expect(r.importados).toBe(1)
    expect(r.jaExistiam).toBe(1)
    expect(await testDb.db.client.count({ where: { tenantId: tenant.id } })).toBe(2)
  })

  it("não considera duplicado o cliente de OUTRO tenant", async () => {
    // Se a checagem de duplicidade esquecesse o tenantId, a empresa B não
    // conseguiria cadastrar um cliente que a empresa A já tem — e ninguém
    // entenderia o motivo.
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    await testDb.db.client.create({
      data: { tenantId: tenantA.id, name: "José", document: "12345678909" },
    })
    mockGetTenant.mockResolvedValue({ tenantId: tenantB.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    const r = await importClients({ ok: false }, envio(csv("Nome;CPF\nJosé;12345678909\n")))

    expect(r.importados).toBe(1)
    expect(await testDb.db.client.count({ where: { tenantId: tenantB.id } })).toBe(1)
  })

  it("importa as linhas boas e relata as ruins", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    const r = await importClients(
      { ok: false },
      envio(csv("Nome;E-mail\nAna Souza;ana@x.com\n;semnome@x.com\nBruno Lima;bruno@\n"))
    )

    expect(r.importados).toBe(2)
    expect(r.erros?.[0]).toMatchObject({ linha: 3, motivo: "nomeInvalido" })
    expect(r.avisos?.[0]).toMatchObject({ linha: 4, motivo: "emailIgnorado" })
    // Importado, só que sem o e-mail quebrado.
    const bruno = await testDb.db.client.findFirst({ where: { name: "Bruno Lima" } })
    expect(bruno?.email).toBeNull()
  })

  it("bloqueia TECHNICIAN e não grava nada", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { importClients } = await import("@/actions/clients")

    const r = await importClients({ ok: false }, envio(csv("Nome\nAna Souza\n")))

    expect(r.ok).toBe(false)
    // Chave de tradução, não texto pronto — a tela resolve com reasons.<motivo>.
    expect(r.motivo).toBe("semPermissao")
    expect(await testDb.db.client.count()).toBe(0)
  })

  it("devolve motivo traduzível quando a planilha não tem coluna de nome", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    const r = await importClients({ ok: false }, envio(csv("Coluna A;Coluna B\nx;y\n")))

    expect(r.ok).toBe(false)
    expect(r.motivo).toBe("semColunaNome")
    expect(await testDb.db.client.count()).toBe(0)
  })

  it("recusa arquivo ausente sem estourar exceção", async () => {
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "OWNER" })
    const { importClients } = await import("@/actions/clients")

    const r = await importClients({ ok: false }, new FormData())

    expect(r).toMatchObject({ ok: false, motivo: "arquivoVazio" })
  })
})
