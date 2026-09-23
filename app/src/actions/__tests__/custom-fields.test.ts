import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    // null = pode. A permissão por ação tem os testes dela em acoes.test.ts e
    // permissao-acao.test.ts; aqui o assunto é campo personalizado.
    checarAcao: vi.fn().mockResolvedValue(null),
  }))
  // A mensagem de erro precisa do nome do campo interpolado ("Preencha o campo
  // 'Metragem'"), então a tradução acontece na action — mesmo padrão do
  // translateFieldErrors já usado aqui. Fora do runtime do Next isso não roda,
  // e o mock devolve chave + valor pra as asserções continuarem legíveis.
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string, vals?: Record<string, unknown>) =>
      `${chave}:${vals?.campo ?? ""}`,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const seedTenant = (name: string) => testDb.db.tenant.create({ data: { name } })

function form(dados: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(dados)) fd.set(k, v)
  return fd
}

const comoOwner = (tenantId: string) =>
  mockGetTenant.mockResolvedValue({ tenantId, userId: "u1", role: "OWNER" })

describe("definição de campos personalizados", () => {
  it("cria um campo e ele aparece na listagem da entidade certa", async () => {
    const tenant = await seedTenant("Pet shop")
    comoOwner(tenant.id)
    const { createCustomField, getCustomFields } = await import("@/actions/custom-fields")

    const r = await createCustomField({}, form({ entity: "CLIENT", label: "Raça", type: "TEXT" }))
    expect(r.ok).toBe(true)

    expect(await getCustomFields("CLIENT")).toMatchObject([{ label: "Raça", type: "TEXT" }])
    // Não pode vazar pra outra entidade.
    expect(await getCustomFields("SERVICE_ORDER")).toEqual([])
  })

  it("guarda as opções só quando o tipo é lista", async () => {
    const tenant = await seedTenant("Pet shop")
    comoOwner(tenant.id)
    const { createCustomField, getCustomFields } = await import("@/actions/custom-fields")

    await createCustomField(
      {},
      form({ entity: "CLIENT", label: "Porte", type: "SELECT", options: "Pequeno\nMédio\nPequeno" })
    )
    // Campo de texto com opções digitadas por engano não deve guardá-las.
    await createCustomField(
      {},
      form({ entity: "CLIENT", label: "Observação", type: "TEXT", options: "A\nB" })
    )

    const campos = await getCustomFields("CLIENT")
    expect(campos.find((c) => c.label === "Porte")?.options).toEqual(["Pequeno", "Médio"])
    expect(campos.find((c) => c.label === "Observação")?.options).toEqual([])
  })

  it("recusa lista de opções vazia", async () => {
    const tenant = await seedTenant("Empresa")
    comoOwner(tenant.id)
    const { createCustomField } = await import("@/actions/custom-fields")

    const r = await createCustomField({}, form({ entity: "CLIENT", label: "Porte", type: "SELECT" }))
    expect(r.erro).toBe("semOpcoes")
    expect(await testDb.db.customField.count()).toBe(0)
  })

  it("bloqueia TECHNICIAN", async () => {
    // Um técnico não deveria conseguir apagar um campo que já tem valor
    // preenchido em centenas de clientes.
    const tenant = await seedTenant("Empresa")
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "u1", role: "TECHNICIAN" })
    const { createCustomField } = await import("@/actions/custom-fields")

    const r = await createCustomField({}, form({ entity: "CLIENT", label: "Raça", type: "TEXT" }))
    expect(r.erro).toBe("semPermissao")
    expect(await testDb.db.customField.count()).toBe(0)
  })

  it("respeita o teto de campos por entidade", async () => {
    const tenant = await seedTenant("Empresa")
    comoOwner(tenant.id)
    const { createCustomField } = await import("@/actions/custom-fields")
    const { MAX_CAMPOS_POR_ENTIDADE } = await import("@/lib/custom-fields")

    for (let i = 0; i < MAX_CAMPOS_POR_ENTIDADE; i++) {
      await createCustomField({}, form({ entity: "CLIENT", label: `Campo ${i}`, type: "TEXT" }))
    }
    const r = await createCustomField({}, form({ entity: "CLIENT", label: "Excedente", type: "TEXT" }))

    expect(r.erro).toBe("limiteAtingido")
    expect(await testDb.db.customField.count()).toBe(MAX_CAMPOS_POR_ENTIDADE)
  })

  it("não apaga campo de outra empresa", async () => {
    // deleteMany com tenantId no where: delete por id sozinho apagaria campo
    // alheio se o id vazasse.
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    const campo = await testDb.db.customField.create({
      data: { tenantId: tenantA.id, entity: "CLIENT", label: "Raça" },
    })

    comoOwner(tenantB.id)
    const { deleteCustomField } = await import("@/actions/custom-fields")
    const r = await deleteCustomField(campo.id)

    expect(r.erro).toBe("naoEncontrado")
    expect(await testDb.db.customField.findUnique({ where: { id: campo.id } })).not.toBeNull()
  })

  it("uma empresa não enxerga os campos da outra", async () => {
    const tenantA = await seedTenant("Empresa A")
    const tenantB = await seedTenant("Empresa B")
    await testDb.db.customField.create({
      data: { tenantId: tenantA.id, entity: "CLIENT", label: "Só da A" },
    })

    comoOwner(tenantB.id)
    const { getCustomFields } = await import("@/actions/custom-fields")
    expect(await getCustomFields("CLIENT")).toEqual([])
  })

  it("reordena e regrava a sequência inteira", async () => {
    const tenant = await seedTenant("Empresa")
    comoOwner(tenant.id)
    const { createCustomField, moveCustomField, getCustomFields } = await import(
      "@/actions/custom-fields"
    )

    for (const label of ["A", "B", "C"]) {
      await createCustomField({}, form({ entity: "CLIENT", label: `Campo ${label}`, type: "TEXT" }))
    }
    const [, segundo] = await getCustomFields("CLIENT")
    await moveCustomField(segundo.id, "up")

    expect((await getCustomFields("CLIENT")).map((c) => c.label)).toEqual([
      "Campo B",
      "Campo A",
      "Campo C",
    ])
    // Posições reescritas sem buracos nem repetição.
    const posicoes = await testDb.db.customField.findMany({
      where: { tenantId: tenant.id },
      orderBy: { position: "asc" },
      select: { position: true },
    })
    expect(posicoes.map((p) => p.position)).toEqual([0, 1, 2])
  })

  it("mover além da ponta não faz nada e não quebra", async () => {
    const tenant = await seedTenant("Empresa")
    comoOwner(tenant.id)
    const { createCustomField, moveCustomField, getCustomFields } = await import(
      "@/actions/custom-fields"
    )

    await createCustomField({}, form({ entity: "CLIENT", label: "Único", type: "TEXT" }))
    const [campo] = await getCustomFields("CLIENT")

    expect(await moveCustomField(campo.id, "up")).toEqual({ ok: true })
    expect(await moveCustomField(campo.id, "down")).toEqual({ ok: true })
  })
})

describe("valores no cadastro de cliente", () => {
  async function campoEm(tenantId: string, over: Record<string, unknown> = {}) {
    return testDb.db.customField.create({
      data: { tenantId, entity: "CLIENT", label: "Metragem", ...over },
    })
  }

  it("grava o valor junto com o cliente", async () => {
    const tenant = await seedTenant("Limpeza")
    const campo = await campoEm(tenant.id)
    comoOwner(tenant.id)
    const { createClient } = await import("@/actions/clients")

    await expect(
      createClient({}, form({ name: "Condomínio Sol", [`cf_${campo.id}`]: "1200" }))
    ).rejects.toThrow("REDIRECT:/clients")

    const cliente = await testDb.db.client.findFirst({ where: { tenantId: tenant.id } })
    expect(cliente?.customValues).toEqual({ [campo.id]: "1200" })
  })

  it("cobra campo obrigatório em vez de gravar pela metade", async () => {
    const tenant = await seedTenant("Limpeza")
    await campoEm(tenant.id, { required: true })
    comoOwner(tenant.id)
    const { createClient } = await import("@/actions/clients")

    const r = await createClient({}, form({ name: "Condomínio Sol" }))

    expect(r.message).toContain("Metragem")
    expect(await testDb.db.client.count()).toBe(0)
  })

  it("ignora valor enviado com id de campo que não existe", async () => {
    // Server Action é endpoint HTTP: dá pra enviar qualquer coisa na mão.
    const tenant = await seedTenant("Limpeza")
    comoOwner(tenant.id)
    const { createClient } = await import("@/actions/clients")

    await expect(
      createClient({}, form({ name: "Cliente", cf_inventado: "x" }))
    ).rejects.toThrow("REDIRECT:/clients")

    const cliente = await testDb.db.client.findFirst()
    expect(cliente?.customValues).toEqual({})
  })

  it("não aceita valor fora da lista de opções", async () => {
    const tenant = await seedTenant("Pet shop")
    const campo = await campoEm(tenant.id, {
      label: "Porte",
      type: "SELECT",
      options: ["Pequeno", "Grande"],
    })
    comoOwner(tenant.id)
    const { createClient } = await import("@/actions/clients")

    const r = await createClient({}, form({ name: "Cliente", [`cf_${campo.id}`]: "Gigante" }))

    expect(r.message).toContain("Porte")
    expect(await testDb.db.client.count()).toBe(0)
  })

  it("edição preserva o mesmo comportamento do cadastro", async () => {
    // Divergir entre criar e editar significaria campo obrigatório cobrado num
    // lugar e ignorado no outro.
    const tenant = await seedTenant("Limpeza")
    const campo = await campoEm(tenant.id)
    const cliente = await testDb.db.client.create({
      data: { tenantId: tenant.id, name: "Condomínio Sol" },
    })
    comoOwner(tenant.id)
    const { updateClient } = await import("@/actions/clients")

    await expect(
      updateClient(cliente.id, {}, form({ name: "Condomínio Sol", [`cf_${campo.id}`]: "980" }))
    ).rejects.toThrow(`REDIRECT:/clients/${cliente.id}`)

    const atualizado = await testDb.db.client.findUnique({ where: { id: cliente.id } })
    expect(atualizado?.customValues).toEqual({ [campo.id]: "980" })
  })

  it("valor de campo apagado fica no banco mas some da exibição", async () => {
    const tenant = await seedTenant("Limpeza")
    const campo = await campoEm(tenant.id)
    const cliente = await testDb.db.client.create({
      data: { tenantId: tenant.id, name: "Cliente", customValues: { [campo.id]: "1200" } },
    })

    comoOwner(tenant.id)
    const { deleteCustomField, getCustomFields } = await import("@/actions/custom-fields")
    const { paraExibicao } = await import("@/lib/custom-fields")
    await deleteCustomField(campo.id)

    const depois = await testDb.db.client.findUnique({ where: { id: cliente.id } })
    // Continua guardado — recriar o campo traz o valor de volta.
    expect(depois?.customValues).toEqual({ [campo.id]: "1200" })
    // Mas não aparece em lugar nenhum.
    expect(paraExibicao(await getCustomFields("CLIENT"), depois?.customValues)).toEqual([])
  })
})
