import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// As travas do balanço, no banco de verdade.
//
// Elas são restrições DE BANCO: um teste que checasse a mesma regra em
// TypeScript não provaria nada sobre o que o Postgres aceita — e quem chama a
// Server Action direto não passa por TypeScript nenhum.
//
// Este arquivo também confere o DRIFT entre a migration escrita à mão e o
// schema do Prisma. As duas descrevem a mesma tabela por caminhos diferentes,
// e quando elas divergem o sistema funciona local e quebra no deploy — que é o
// pior lugar para descobrir.

let migrado: PGlite
let doSchema: PGlite

async function aplicarMigrations() {
  const db = new PGlite()
  const dir = join(process.cwd(), "prisma/migrations")
  for (const p of readdirSync(dir).filter((f) => !f.endsWith(".toml")).sort()) {
    await db.exec(readFileSync(join(dir, p, "migration.sql"), "utf8"))
  }
  return db
}

beforeAll(async () => {
  migrado = await aplicarMigrations()
  doSchema = new PGlite()
  await doSchema.exec(readFileSync(join(process.cwd(), "src/test-utils/test-schema.sql"), "utf8"))

  await migrado.exec(`
    INSERT INTO "Tenant" ("id","name","updatedAt") VALUES ('t1','Empresa', CURRENT_TIMESTAMP);
  `)
})

afterAll(async () => {
  await migrado.close()
  await doSchema.close()
})

const inserirLinha = (descricao: string, valor: number, grupo = "PASSIVO_NAO_CIRCULANTE") =>
  migrado.exec(
    `INSERT INTO "BalanceEntry" ("id","tenantId","group","description","amount","updatedAt")
     VALUES ('${Math.random().toString(36).slice(2)}','t1','${grupo}','${descricao}',${valor}, CURRENT_TIMESTAMP);`
  )

describe("a linha manual do balanço", () => {
  it("aceita a linha comum", async () => {
    await expect(inserirLinha("Financiamento da van", 38000)).resolves.toBeDefined()
  })

  it("ACEITA valor negativo, porque conta retificadora existe", async () => {
    // "(-) Provisão para devedores duvidosos" é linha legítima do ativo.
    // Travar em zero obrigaria a empresa a mentir no balanço para caber na
    // regra do sistema.
    await expect(
      inserirLinha("(-) Provisao para perdas", -2000, "ATIVO_CIRCULANTE")
    ).resolves.toBeDefined()
  })

  it("RECUSA descrição vazia", async () => {
    // Linha sem nome é linha que ninguém sabe o que é — e o contador devolve
    // perguntando.
    await expect(inserirLinha("", 1000)).rejects.toThrow(/descricao_nao_vazia/)
  })

  it("RECUSA descrição só de espaços", async () => {
    await expect(inserirLinha("   ", 1000)).rejects.toThrow(/descricao_nao_vazia/)
  })

  it("RECUSA grupo que não existe", async () => {
    await expect(inserirLinha("Qualquer", 10, "GRUPO_INVENTADO")).rejects.toThrow()
  })

  it("some junto com a empresa", async () => {
    // Cascade: linha de balanço órfã não aparece em tela alguma e ninguém
    // consegue apagar pela interface.
    await migrado.exec(`INSERT INTO "Tenant" ("id","name","updatedAt")
      VALUES ('t2','Some', CURRENT_TIMESTAMP);`)
    await migrado.exec(`INSERT INTO "BalanceEntry" ("id","tenantId","group","description","amount","updatedAt")
      VALUES ('be-t2','t2','PASSIVO_CIRCULANTE','Emprestimo',500, CURRENT_TIMESTAMP);`)
    await migrado.exec(`DELETE FROM "Tenant" WHERE id = 't2';`)

    const r = await migrado.query<{ n: number }>(
      `SELECT count(*)::int n FROM "BalanceEntry" WHERE "tenantId" = 't2'`
    )
    expect(r.rows[0].n).toBe(0)
  })
})

describe("o caixa inicial e o capital social", () => {
  const setar = (campo: string, valor: string) =>
    migrado.exec(`UPDATE "Tenant" SET "${campo}" = ${valor} WHERE id = 't1';`)

  it("aceitam valor, zero e NULL", async () => {
    await expect(setar("openingCash", "5000")).resolves.toBeDefined()
    await expect(setar("openingCash", "0")).resolves.toBeDefined()
    await expect(setar("openingCash", "NULL")).resolves.toBeDefined()
    await expect(setar("shareCapital", "20000")).resolves.toBeDefined()
  })

  it("RECUSAM valor negativo", async () => {
    // Se a empresa devia mais do que tinha no primeiro dia, isso é PASSIVO, e
    // entra como linha manual — não como caixa negativo.
    await expect(setar("openingCash", "-1")).rejects.toThrow(/caixa_inicial_nao_negativo/)
    await expect(setar("shareCapital", "-1")).rejects.toThrow(/capital_nao_negativo/)
  })

  it("NULL é diferente de zero, e o conferente usa essa diferença", async () => {
    // "Não informou" pede para cadastrar; "informou zero" não pede nada. Um
    // DEFAULT 0 apagaria essa distinção e mandaria toda empresa consertar um
    // campo que já está certo.
    await setar("openingCash", "NULL")
    const r = await migrado.query<{ v: string | null }>(
      `SELECT "openingCash"::text v FROM "Tenant" WHERE id = 't1'`
    )
    expect(r.rows[0].v).toBeNull()
  })
})

describe("a migration bate com o schema do Prisma", () => {
  async function colunas(db: PGlite, tabela: string) {
    const r = await db.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = $1 ORDER BY column_name`,
      [tabela]
    )
    return r.rows
  }

  it("a tabela nova tem as MESMAS colunas pelos dois caminhos", async () => {
    // A migration é escrita à mão e o schema é lido pelo Prisma. Divergir aqui
    // faz o sistema funcionar local e quebrar no deploy.
    const [a, b] = await Promise.all([
      colunas(migrado, "BalanceEntry"),
      colunas(doSchema, "BalanceEntry"),
    ])
    expect(a.length).toBeGreaterThan(0)
    expect(a).toEqual(b)
  })

  it("os campos novos da empresa também batem", async () => {
    const so = (rows: { column_name: string }[]) =>
      rows.filter((c) => c.column_name === "openingCash" || c.column_name === "shareCapital")
    const [a, b] = await Promise.all([colunas(migrado, "Tenant"), colunas(doSchema, "Tenant")])
    expect(so(a)).toHaveLength(2)
    expect(so(a)).toEqual(so(b))
  })

  it("o enum de grupos tem os cinco valores, nos dois", async () => {
    const valores = async (db: PGlite) => {
      const r = await db.query<{ enumlabel: string }>(
        `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'BalanceGroup' ORDER BY enumlabel`
      )
      return r.rows.map((x) => x.enumlabel)
    }
    const esperado = [
      "ATIVO_CIRCULANTE",
      "ATIVO_NAO_CIRCULANTE",
      "PASSIVO_CIRCULANTE",
      "PASSIVO_NAO_CIRCULANTE",
      "PATRIMONIO_LIQUIDO",
    ]
    expect(await valores(migrado)).toEqual(esperado)
    expect(await valores(doSchema)).toEqual(esperado)
  })
})
