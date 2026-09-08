import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// A migração do estoque por local, com dados dentro.
//
// O resto da suíte testa a REGRA (estoque-local.test.ts) e o schema final. Isto
// testa a única parte que não tem segunda chance: **o estoque que já existe não
// pode sumir**.
//
// Sem o preenchimento, toda empresa que já usa estoque abriria a tela nova e
// veria os saldos fora de qualquer local — presentes no total e invisíveis na
// única tela que passa a importar. E migração só roda uma vez: o erro seria
// descoberto depois, em produção, com o dado já do outro lado.
//
// Por isso este teste aplica as migrations ATÉ A ANTERIOR, insere uma empresa
// com peças e saldo como as de verdade, e só então aplica a de hoje.

const RAIZ = process.cwd()
const DIR = join(RAIZ, "prisma/migrations")
const A_MIGRACAO = "20260901000001_estoque_por_local"

let db: PGlite

const migrations = () =>
  readdirSync(DIR)
    .filter((f) => !f.endsWith(".toml"))
    .sort()

async function aplicar(nome: string) {
  await db.exec(readFileSync(join(DIR, nome, "migration.sql"), "utf8"))
}

const q = async (sql: string) => (await db.query(sql)).rows as Record<string, unknown>[]

beforeAll(async () => {
  db = new PGlite()

  const todas = migrations()
  const alvo = todas.indexOf(A_MIGRACAO)
  if (alvo < 0) throw new Error(`migration ${A_MIGRACAO} não encontrada`)

  // 1. O mundo ANTES da mudança.
  for (const m of todas.slice(0, alvo)) await aplicar(m)

  // 2. Uma empresa que já usa estoque, e outra que nunca usou.
  await db.exec(`
    INSERT INTO "Tenant" ("id","name","updatedAt") VALUES
      ('t-usa','Refrigeração Polar', CURRENT_TIMESTAMP),
      ('t-nao','Sem Estoque', CURRENT_TIMESTAMP);

    INSERT INTO "Part" ("id","tenantId","name","stock","minStock","updatedAt") VALUES
      ('p1','t-usa','Compressor 2HP', 7,     2, CURRENT_TIMESTAMP),
      ('p2','t-usa','Filtro secador', 12.5,  5, CURRENT_TIMESTAMP),
      ('p3','t-usa','Gás R-410A',     0,     1, CURRENT_TIMESTAMP);

    INSERT INTO "StockMovement" ("id","tenantId","partId","type","quantity","balanceAfter","createdAt")
    VALUES ('m1','t-usa','p1','ENTRADA', 7, 7, CURRENT_TIMESTAMP);
  `)

  // 3. E agora a migração de hoje.
  await aplicar(A_MIGRACAO)
})

afterAll(async () => {
  await db?.close()
})

describe("a empresa que já usava estoque", () => {
  it("ganha um almoxarifado", () => {
    return q(`SELECT "name","type","active" FROM "StockLocation" WHERE "tenantId"='t-usa'`).then(
      (locais) => {
        expect(locais).toHaveLength(1)
        expect(locais[0].name).toBe("Almoxarifado")
        expect(locais[0].type).toBe("ALMOXARIFADO")
        expect(locais[0].active).toBe(true)
      }
    )
  })

  it("TODO saldo que existia vai para dentro dele", async () => {
    // O coração deste teste. Se algum saldo ficasse de fora, a peça sumiria da
    // tela nova sem ter saído do estoque.
    const saldos = await q(`
      SELECT p."name", b."quantity"::float8 AS q
      FROM "StockBalance" b JOIN "Part" p ON p."id" = b."partId"
      ORDER BY p."name"`)
    expect(saldos).toEqual([
      { name: "Compressor 2HP", q: 7 },
      { name: "Filtro secador", q: 12.5 },
      { name: "Gás R-410A", q: 0 },
    ])
  })

  it("o total de cada peça continua igual à soma dos locais", async () => {
    // A invariante que este desenho inteiro depende: `Part.stock` é o total, e
    // os saldos por local são as parcelas. Divergir é o defeito clássico de
    // manter os dois.
    const fora = await q(`
      SELECT p."id"
      FROM "Part" p
      LEFT JOIN (SELECT "partId", sum("quantity") s FROM "StockBalance" GROUP BY "partId") b
        ON b."partId" = p."id"
      WHERE COALESCE(b.s, 0) <> p."stock"`)
    expect(fora).toEqual([])
  })

  it("peça com saldo ZERO também ganha linha", async () => {
    // Sem a linha, a peça não apareceria na tela do local — e o técnico
    // concluiria que ela não é estocada ali, quando na verdade acabou.
    const zero = await q(`
      SELECT b."quantity"::float8 q FROM "StockBalance" b
      JOIN "Part" p ON p."id"=b."partId" WHERE p."name"='Gás R-410A'`)
    expect(zero).toEqual([{ q: 0 }])
  })

  it("o histórico antigo passa a apontar para esse local", async () => {
    // O movimento aconteceu ali — era o único lugar que existia. Deixá-lo sem
    // local faria o histórico do almoxarifado começar do zero.
    const m = await q(`
      SELECT l."name" FROM "StockMovement" m
      JOIN "StockLocation" l ON l."id" = m."locationId" WHERE m."id"='m1'`)
    expect(m).toEqual([{ name: "Almoxarifado" }])
  })
})

describe("a empresa que nunca usou estoque", () => {
  it("NÃO ganha local nenhum", async () => {
    // Criar almoxarifado para quem nem contratou o recurso é sujeira na tela.
    const locais = await q(`SELECT "id" FROM "StockLocation" WHERE "tenantId"='t-nao'`)
    expect(locais).toEqual([])
  })
})

describe("as travas do modelo novo", () => {
  it("não deixa dois locais com o mesmo nome na mesma empresa", async () => {
    // Dois "Almoxarifado" seriam indistinguíveis na hora de escolher — e a
    // escolha errada move peça de verdade.
    await expect(
      db.exec(`INSERT INTO "StockLocation" ("id","tenantId","name") VALUES ('x','t-usa','Almoxarifado')`)
    ).rejects.toThrow()
  })

  it("permite o mesmo nome em empresas diferentes", async () => {
    await expect(
      db.exec(`INSERT INTO "StockLocation" ("id","tenantId","name") VALUES ('y','t-nao','Almoxarifado')`)
    ).resolves.not.toThrow()
  })

  it("não deixa dois saldos da mesma peça no mesmo local", async () => {
    // Duplicado faria a soma contar duas vezes, e o total divergir do real.
    const loc = (await q(`SELECT "id" FROM "StockLocation" WHERE "tenantId"='t-usa'`))[0].id
    await expect(
      db.exec(`INSERT INTO "StockBalance" ("id","partId","locationId","quantity")
               VALUES ('dup','p1','${loc}', 3)`)
    ).rejects.toThrow()
  })
})
