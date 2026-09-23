import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { filtroDeFilial } from "@/lib/filial"

// A regra pura está em filial.test.ts. O que se prova AQUI é que o filtro
// funciona numa consulta de verdade — em especial que ele convive com o `OR`
// da busca por texto, que é o ponto onde ele quase quebrou:
//
// as consultas de cliente e de OS já usam `OR` no nível de cima. Se o filtro
// de filial também fosse um `OR` solto, o segundo substituiria o primeiro e a
// pesquisa pararia de filtrar — devolvendo a base inteira e PARECENDO
// funcionar. Um teste só da forma do objeto não pegaria isso; este pega.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Empresa" } })
  const centro = await testDb.db.branch.create({
    data: { tenantId: tenant.id, name: "Centro" },
  })
  const zonaSul = await testDb.db.branch.create({
    data: { tenantId: tenant.id, name: "Zona Sul" },
  })

  await testDb.db.client.createMany({
    data: [
      { tenantId: tenant.id, name: "Padaria do Centro", branchId: centro.id },
      { tenantId: tenant.id, name: "Padaria da Zona Sul", branchId: zonaSul.id },
      // Sem filial: é o cliente antigo, de antes de a empresa criar unidades.
      { tenantId: tenant.id, name: "Padaria Antiga", branchId: null },
    ],
  })

  return { tenant, centro, zonaSul }
}

const busca = (q: string) => ({
  OR: [
    { name: { contains: q, mode: "insensitive" as const } },
    { email: { contains: q, mode: "insensitive" as const } },
  ],
})

async function nomes(where: object) {
  const r = await testDb.db.client.findMany({ where, select: { name: true }, orderBy: { name: "asc" } })
  return r.map((c) => c.name)
}

describe("o filtro numa consulta de verdade", () => {
  it("ver tudo devolve as três", async () => {
    const { tenant } = await cenario()

    expect(await nomes({ tenantId: tenant.id, ...filtroDeFilial({ tipo: "tudo" }) })).toEqual([
      "Padaria Antiga",
      "Padaria da Zona Sul",
      "Padaria do Centro",
    ])
  })

  it("ver uma filial devolve a dela MAIS a que não tem filial", async () => {
    // A regra que impede a base histórica de sumir quando a empresa cadastra a
    // primeira unidade.
    const { tenant, centro } = await cenario()

    expect(
      await nomes({ tenantId: tenant.id, ...filtroDeFilial({ tipo: "filial", branchId: centro.id }) })
    ).toEqual(["Padaria Antiga", "Padaria do Centro"])
  })

  it("não devolve o cliente da filial vizinha", async () => {
    const { tenant, centro } = await cenario()

    const r = await nomes({
      tenantId: tenant.id,
      ...filtroDeFilial({ tipo: "filial", branchId: centro.id }),
    })

    expect(r).not.toContain("Padaria da Zona Sul")
  })
})

describe("o filtro convive com a busca por texto", () => {
  it("busca + filial: as DUAS condições valem ao mesmo tempo", async () => {
    // É o teste que justifica o `AND`. Com dois `OR` no mesmo nível, um
    // sobrescreveria o outro — e o resultado abaixo traria a Zona Sul junto.
    const { tenant, centro } = await cenario()

    const r = await nomes({
      tenantId: tenant.id,
      ...filtroDeFilial({ tipo: "filial", branchId: centro.id }),
      ...busca("Padaria"),
    })

    expect(r).toEqual(["Padaria Antiga", "Padaria do Centro"])
  })

  it("a busca continua filtrando de verdade com o filtro de filial junto", async () => {
    // Se o filtro tivesse comido o `OR` da busca, isto devolveria as três.
    const { tenant, centro } = await cenario()

    const r = await nomes({
      tenantId: tenant.id,
      ...filtroDeFilial({ tipo: "filial", branchId: centro.id }),
      ...busca("Antiga"),
    })

    expect(r).toEqual(["Padaria Antiga"])
  })

  it("busca sem filtro de filial continua igual ao que sempre foi", async () => {
    const { tenant } = await cenario()

    const r = await nomes({
      tenantId: tenant.id,
      ...filtroDeFilial({ tipo: "tudo" }),
      ...busca("Zona"),
    })

    expect(r).toEqual(["Padaria da Zona Sul"])
  })
})

describe("apagar filial não apaga o que estava nela", () => {
  it("o cliente volta a ser 'sem filial', e não some", async () => {
    // ON DELETE SET NULL. Se fosse CASCADE, remover uma unidade apagaria os
    // clientes, as OS e o faturamento dela — destruição de dado por um clique
    // de organização. (A tela desativa em vez de apagar justamente por isso;
    // isto aqui é a rede embaixo.)
    const { tenant, centro } = await cenario()

    await testDb.db.branch.delete({ where: { id: centro.id } })

    const sobrou = await testDb.db.client.findFirst({ where: { name: "Padaria do Centro" } })
    expect(sobrou).not.toBeNull()
    expect(sobrou!.branchId).toBeNull()
    expect((await nomes({ tenantId: tenant.id })).length).toBe(3)
  })
})
