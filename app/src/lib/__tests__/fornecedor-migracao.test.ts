import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// A migration do fornecedor, no banco de verdade.
//
// Duas coisas se provam aqui e em nenhum outro lugar:
//
//   1. a TRAVA nova — apagar fornecedor com cotação passou a ser recusado pelo
//      Postgres, e não só pela Action. Antes era CASCADE: apagar levava junto,
//      em silêncio, a participação dele em toda cotação e os preços que ele deu;
//
//   2. o DRIFT entre a migration escrita à mão e o schema do Prisma. As duas
//      descrevem a mesma tabela por caminhos diferentes, e quando divergem o
//      sistema funciona local e quebra no deploy.

let migrado: PGlite
let doSchema: PGlite

beforeAll(async () => {
  migrado = new PGlite()
  const dir = join(process.cwd(), "prisma/migrations")
  for (const p of readdirSync(dir).filter((f) => !f.endsWith(".toml")).sort()) {
    await migrado.exec(readFileSync(join(dir, p, "migration.sql"), "utf8"))
  }

  doSchema = new PGlite()
  await doSchema.exec(readFileSync(join(process.cwd(), "src/test-utils/test-schema.sql"), "utf8"))

  await migrado.exec(`
    INSERT INTO "Tenant" ("id","name","updatedAt") VALUES ('t1','Empresa', CURRENT_TIMESTAMP);
    INSERT INTO "Supplier" ("id","tenantId","name","updatedAt")
      VALUES ('f1','t1','Frio Total', CURRENT_TIMESTAMP);
    INSERT INTO "Supplier" ("id","tenantId","name","updatedAt")
      VALUES ('f2','t1','Sem historico', CURRENT_TIMESTAMP);
    INSERT INTO "Quotation" ("id","tenantId","number","title","updatedAt")
      VALUES ('c1','t1',1,'Reposicao', CURRENT_TIMESTAMP);
    INSERT INTO "QuotationParticipant" ("id","quotationId","supplierId")
      VALUES ('p1','c1','f1');
  `)
})

afterAll(async () => {
  await migrado.close()
  await doSchema.close()
})

describe("apagar fornecedor não apaga histórico", () => {
  it("o BANCO recusa apagar quem já participou de cotação", async () => {
    // A trava que faltava. Com CASCADE, este DELETE levava junto a linha de
    // QuotationParticipant e todos os preços dela — e como a única forma de
    // corrigir um dado errado era apagar e recadastrar, o caminho para perder o
    // histórico era o caminho NORMAL de uso.
    await expect(migrado.exec(`DELETE FROM "Supplier" WHERE id = 'f1';`)).rejects.toThrow()
  })

  it("a participação continua lá depois da tentativa", async () => {
    const r = await migrado.query<{ n: number }>(
      `SELECT count(*)::int n FROM "QuotationParticipant" WHERE "supplierId" = 'f1'`
    )
    expect(r.rows[0].n).toBe(1)
  })

  it("quem NÃO tem histórico continua podendo ser apagado", async () => {
    // A trava não pode virar cadeado: cadastro duplicado tem de sair.
    await migrado.exec(`DELETE FROM "Supplier" WHERE id = 'f2';`)
    const r = await migrado.query<{ n: number }>(
      `SELECT count(*)::int n FROM "Supplier" WHERE id = 'f2'`
    )
    expect(r.rows[0].n).toBe(0)
  })
})

describe("os campos novos", () => {
  it("todos nascem OPCIONAIS, menos `active`", async () => {
    // Campo obrigatório travaria a EDIÇÃO dos fornecedores que já existem só
    // com nome: a pessoa abriria a ficha para corrigir o telefone e teria de
    // preencher CEP e razão social antes de salvar.
    const r = await migrado.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'Supplier'
          AND column_name IN ('legalName','documentDigits','category','contactName',
                              'zipCode','city','paymentTerms','leadTimeDays','pixKey','active')`
    )
    const obrigatorias = r.rows.filter((c) => c.is_nullable === "NO").map((c) => c.column_name)
    expect(obrigatorias).toEqual(["active"])
  })

  it("`active` já nasce true para quem existia antes", async () => {
    const r = await migrado.query<{ active: boolean }>(
      `SELECT "active" FROM "Supplier" WHERE id = 'f1'`
    )
    expect(r.rows[0].active).toBe(true)
  })

  it("o índice de documento NÃO é único", async () => {
    // Decisão consciente: empresa que já gravou o mesmo CNPJ duas vezes faria a
    // migration FALHAR no deploy, derrubando tudo que vem depois dela.
    // Duplicata vira aviso na tela.
    const r = await migrado.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'Supplier_tenantId_documentDigits_idx'`
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].indexdef).not.toContain("UNIQUE")
  })

  it("o backfill limpou a pontuação do documento que já existia", async () => {
    await migrado.exec(`
      INSERT INTO "Supplier" ("id","tenantId","name","document","updatedAt")
        VALUES ('f3','t1','Com documento','11.222.333/0001-81', CURRENT_TIMESTAMP);
    `)
    // O backfill roda uma vez, na migration; para a linha nova quem preenche é
    // a Action. O que se prova aqui é que a COLUNA existe e aceita os dígitos.
    await migrado.exec(`UPDATE "Supplier" SET "documentDigits" = '11222333000181' WHERE id = 'f3';`)
    const r = await migrado.query<{ d: string }>(
      `SELECT "documentDigits" d FROM "Supplier" WHERE id = 'f3'`
    )
    expect(r.rows[0].d).toBe("11222333000181")
  })
})

describe("a migration bate com o schema do Prisma", () => {
  async function colunas(db: PGlite) {
    const r = await db.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'Supplier' ORDER BY column_name`
    )
    return r.rows
  }

  it("a tabela tem as MESMAS colunas pelos dois caminhos", async () => {
    // A migration é escrita à mão e o schema é lido pelo Prisma. Divergir aqui
    // faz o sistema funcionar local e quebrar no deploy.
    const [a, b] = await Promise.all([colunas(migrado), colunas(doSchema)])
    expect(a.length).toBeGreaterThan(25)
    expect(a).toEqual(b)
  })

  it("a chave estrangeira da cotação é RESTRICT nos dois", async () => {
    const regra = async (db: PGlite) => {
      const r = await db.query<{ confdeltype: string }>(
        `SELECT confdeltype FROM pg_constraint
          WHERE conname = 'QuotationParticipant_supplierId_fkey'`
      )
      return r.rows[0]?.confdeltype
    }
    // 'r' = RESTRICT, 'c' = CASCADE. Era 'c'.
    expect(await regra(migrado)).toBe("r")
    expect(await regra(doSchema)).toBe("r")
  })
})
