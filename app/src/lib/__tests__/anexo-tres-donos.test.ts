import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// A trava de dono único do anexo, REESCRITA.
//
// Ela dizia "orderId OU quoteId, nunca os dois". Com a nota do fornecedor
// passou a haver um terceiro dono, e a versão escrita à mão viraria quatro
// combinações — sendo que a quinta, quando um quarto dono aparecer, seria
// esquecida. Agora é `num_nonnulls(...) = 1`: literalmente "exatamente um".
//
// O que a trava impede não mudou, e é o que este arquivo prova:
//
//   NENHUM dono — linha que não aparece em tela alguma, ocupa armazenamento e
//   ninguém consegue apagar pela interface;
//
//   DOIS donos — o mesmo arquivo contado duas vezes no teto por registro, e
//   aparecendo em dois documentos diferentes.
//
// Roda no banco de verdade porque é uma restrição DE BANCO: um teste que
// checasse a regra em TypeScript não provaria nada sobre o que o Postgres
// aceita.

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  const dir = join(process.cwd(), "prisma/migrations")
  for (const p of readdirSync(dir).filter((f) => !f.endsWith(".toml")).sort()) {
    await db.exec(readFileSync(join(dir, p, "migration.sql"), "utf8"))
  }

  await db.exec(`
    INSERT INTO "Tenant" ("id","name","updatedAt") VALUES ('t1','Empresa', CURRENT_TIMESTAMP);
    INSERT INTO "Client" ("id","tenantId","name","updatedAt")
      VALUES ('c1','t1','Cliente', CURRENT_TIMESTAMP);
    INSERT INTO "ServiceOrder" ("id","tenantId","clientId","number","title","updatedAt")
      VALUES ('os1','t1','c1',1,'Servico', CURRENT_TIMESTAMP);
    INSERT INTO "Quote" ("id","tenantId","number","clientName","description","updatedAt")
      VALUES ('q1','t1',1,'Cliente','Proposta', CURRENT_TIMESTAMP);
    INSERT INTO "PurchaseOrder" ("id","tenantId","number","updatedAt")
      VALUES ('pc1','t1',1, CURRENT_TIMESTAMP);
  `)
})

afterAll(async () => {
  await db?.close()
})

const inserir = (colunas: string, valores: string) =>
  db.exec(`INSERT INTO "Attachment" ("id","url","name",${colunas})
           VALUES ('${Math.random().toString(36).slice(2)}','u','n',${valores})`)

describe("exatamente um dono é aceito", () => {
  it("da ordem de serviço", async () => {
    await expect(inserir(`"orderId"`, `'os1'`)).resolves.not.toThrow()
  })

  it("do orçamento", async () => {
    await expect(inserir(`"quoteId"`, `'q1'`)).resolves.not.toThrow()
  })

  it("da ordem de COMPRA — o dono novo", async () => {
    await expect(inserir(`"purchaseOrderId"`, `'pc1'`)).resolves.not.toThrow()
  })
})

describe("nenhum dono é recusado", () => {
  it("linha órfã não entra", async () => {
    // Ela não apareceria em tela alguma, ocuparia armazenamento pago, e
    // ninguém conseguiria apagá-la pela interface.
    await expect(inserir(`"orderId"`, `NULL`)).rejects.toThrow()
  })
})

describe("dois donos são recusados", () => {
  it("OS + orçamento", async () => {
    await expect(inserir(`"orderId","quoteId"`, `'os1','q1'`)).rejects.toThrow()
  })

  it("OS + compra", async () => {
    // A combinação que a trava ANTIGA não cobria: ela só conhecia dois donos,
    // então esta linha teria passado.
    await expect(inserir(`"orderId","purchaseOrderId"`, `'os1','pc1'`)).rejects.toThrow()
  })

  it("orçamento + compra", async () => {
    await expect(inserir(`"quoteId","purchaseOrderId"`, `'q1','pc1'`)).rejects.toThrow()
  })
})

describe("três donos são recusados", () => {
  it("os três de uma vez", async () => {
    await expect(
      inserir(`"orderId","quoteId","purchaseOrderId"`, `'os1','q1','pc1'`)
    ).rejects.toThrow()
  })
})

describe("apagar a compra leva a nota junto", () => {
  it("Cascade: nota sem compra seria arquivo pago sem dono", async () => {
    await db.exec(`INSERT INTO "PurchaseOrder" ("id","tenantId","number","updatedAt")
                   VALUES ('pc2','t1',2, CURRENT_TIMESTAMP)`)
    await db.exec(`INSERT INTO "Attachment" ("id","url","name","purchaseOrderId")
                   VALUES ('a-casc','u','nota.jpg','pc2')`)

    await db.exec(`DELETE FROM "PurchaseOrder" WHERE "id"='pc2'`)

    const sobrou = await db.query(`SELECT "id" FROM "Attachment" WHERE "id"='a-casc'`)
    expect(sobrou.rows).toEqual([])
  })
})
