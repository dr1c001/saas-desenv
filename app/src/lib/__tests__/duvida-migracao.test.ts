import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// As travas do canal de dúvida, no banco de verdade — e o drift entre a
// migration escrita à mão e o schema do Prisma.
//
// São restrições DE BANCO: um teste que checasse a mesma regra em TypeScript
// não provaria nada sobre o que o Postgres aceita, e quem chama a Server Action
// direto não passa por TypeScript nenhum.

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
    INSERT INTO "Tenant" ("id","name","updatedAt") VALUES ('t1','Livela store', CURRENT_TIMESTAMP);
    INSERT INTO "User" ("id","tenantId","name","email","role")
      VALUES ('u1','t1','Priscila','p@ex.com','OWNER');
  `)
})

afterAll(async () => {
  await migrado.close()
  await doSchema.close()
})

/**
 * `tenant` explícito porque os blocos compartilham UM banco e rodam em ordem:
 * o primeiro apaga a empresa dele de propósito, e usar sempre a mesma faria os
 * blocos seguintes falharem por um motivo que não é o que eles testam.
 */
const novaDuvida = (id: string, tenant: string, extra = "") =>
  migrado.exec(`
    INSERT INTO "SupportThread"
      ("id","tenantId","tenantName","authorName","authorEmail","authorRole",
       "subscriptionStatus","lastMessageAt","lastMessageFrom","updatedAt"${extra ? ',"status","closedAt"' : ""})
    VALUES ('${id}','${tenant}','Empresa','Priscila','p@ex.com','OWNER',
       'ACTIVE', CURRENT_TIMESTAMP, 'CLIENTE', CURRENT_TIMESTAMP${extra});
  `)

describe("a conversa sobrevive à empresa", () => {
  it("apagar a empresa NÃO apaga a dúvida — só o vínculo", async () => {
    // A dúvida de quem desistiu é a mais valiosa que existe: é o motivo do
    // abandono, escrito pela própria pessoa. Cascade apagaria justamente ela, e
    // Restrict impediria apagarEmpresaAbandonada() de rodar.
    await migrado.exec(`
      INSERT INTO "SupportThread"
        ("id","tenantId","authorId","tenantName","authorName","authorEmail","authorRole",
         "subscriptionStatus","lastMessageAt","lastMessageFrom","updatedAt")
      VALUES ('d1','t1','u1','Livela store','Priscila','p@ex.com','OWNER',
         'ACTIVE', CURRENT_TIMESTAMP, 'CLIENTE', CURRENT_TIMESTAMP);
    `)
    await migrado.exec(`DELETE FROM "User" WHERE id = 'u1';`)
    await migrado.exec(`DELETE FROM "Tenant" WHERE id = 't1';`)

    const r = await migrado.query<{ tenantId: string | null; tenantName: string }>(
      `SELECT "tenantId", "tenantName" FROM "SupportThread" WHERE id = 'd1'`
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].tenantId).toBeNull()
    // O RETRATO fica: é a única memória de que a pergunta foi feita.
    expect(r.rows[0].tenantName).toBe("Livela store")
  })
})

describe("as travas da mensagem", () => {
  beforeAll(async () => {
    await migrado.exec(`
      INSERT INTO "Tenant" ("id","name","updatedAt") VALUES ('t2','Outra', CURRENT_TIMESTAMP);
      INSERT INTO "SupportThread"
        ("id","tenantId","tenantName","authorName","authorEmail","authorRole",
         "subscriptionStatus","lastMessageAt","lastMessageFrom","updatedAt")
      VALUES ('d2','t2','Outra','A','a@ex.com','OWNER','ACTIVE', CURRENT_TIMESTAMP, 'CLIENTE', CURRENT_TIMESTAMP);
    `)
  })

  const mensagem = (corpo: string) =>
    migrado.exec(`
      INSERT INTO "SupportMessage" ("id","threadId","kind","body","authorName","authorEmail")
      VALUES ('${Math.random().toString(36).slice(2)}','d2','CLIENTE','${corpo}','A','a@ex.com');
    `)

  it("recusa mensagem VAZIA", async () => {
    await expect(mensagem("")).rejects.toThrow(/corpo_nao_vazio/)
    await expect(mensagem("   ")).rejects.toThrow(/corpo_nao_vazio/)
  })

  it("recusa mensagem acima do limite", async () => {
    await expect(mensagem("x".repeat(2001))).rejects.toThrow(/corpo_nao_vazio/)
  })

  it("aceita a pergunta de verdade", async () => {
    await expect(mensagem("Como emito nota fiscal?")).resolves.toBeDefined()
  })

  it("mensagem some junto com a conversa", async () => {
    // Cascade aqui, e só aqui: mensagem sem conversa não é nada.
    await migrado.exec(`DELETE FROM "SupportThread" WHERE id = 'd2';`)
    const r = await migrado.query<{ n: number }>(
      `SELECT count(*)::int n FROM "SupportMessage" WHERE "threadId" = 'd2'`
    )
    expect(r.rows[0].n).toBe(0)
  })
})

describe("fechada tem data, aberta não tem", () => {
  beforeAll(async () => {
    await migrado.exec(
      `INSERT INTO "Tenant" ("id","name","updatedAt") VALUES ('t3','Terceira', CURRENT_TIMESTAMP);`
    )
  })

  it("recusa FECHADA sem data de fechamento", async () => {
    // Sem esta trava, a fila do painel mostraria conversa fechada que ninguém
    // consegue explicar quando foi encerrada.
    await expect(novaDuvida("d3", "t3", ", 'FECHADA', NULL")).rejects.toThrow(/fechada_tem_data/)
  })

  it("recusa ABERTA COM data de fechamento", async () => {
    await expect(novaDuvida("d4", "t3", ", 'ABERTA', CURRENT_TIMESTAMP")).rejects.toThrow(
      /fechada_tem_data/
    )
  })

  it("aceita os dois casos coerentes", async () => {
    await expect(novaDuvida("d5", "t3", ", 'FECHADA', CURRENT_TIMESTAMP")).resolves.toBeDefined()
    await expect(novaDuvida("d6", "t3", ", 'ABERTA', NULL")).resolves.toBeDefined()
  })
})

describe("a migration bate com o schema do Prisma", () => {
  async function colunas(db: PGlite, tabela: string) {
    const r = await db.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name = $1 ORDER BY column_name`,
      [tabela]
    )
    return r.rows
  }

  it("SupportThread tem as mesmas colunas pelos dois caminhos", async () => {
    // A migration é escrita à mão e o schema é lido pelo Prisma. Divergir aqui
    // faz o sistema funcionar local e quebrar no deploy.
    const [a, b] = await Promise.all([
      colunas(migrado, "SupportThread"),
      colunas(doSchema, "SupportThread"),
    ])
    expect(a.length).toBeGreaterThan(15)
    expect(a).toEqual(b)
  })

  it("SupportMessage também", async () => {
    const [a, b] = await Promise.all([
      colunas(migrado, "SupportMessage"),
      colunas(doSchema, "SupportMessage"),
    ])
    expect(a).toEqual(b)
  })

  it("os dois enums têm os mesmos valores", async () => {
    const valores = async (db: PGlite, tipo: string) => {
      const r = await db.query<{ enumlabel: string }>(
        `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1 ORDER BY enumlabel`,
        [tipo]
      )
      return r.rows.map((x) => x.enumlabel)
    }
    expect(await valores(migrado, "SupportThreadStatus")).toEqual(["ABERTA", "FECHADA", "RESPONDIDA"])
    expect(await valores(doSchema, "SupportThreadStatus")).toEqual(["ABERTA", "FECHADA", "RESPONDIDA"])
    expect(await valores(migrado, "SupportAuthorKind")).toEqual(["CLIENTE", "PLATAFORMA"])
    expect(await valores(doSchema, "SupportAuthorKind")).toEqual(["CLIENTE", "PLATAFORMA"])
  })

  it("as chaves estrangeiras seguram o que devem", async () => {
    const regra = async (db: PGlite, nome: string) => {
      const r = await db.query<{ confdeltype: string }>(
        `SELECT confdeltype FROM pg_constraint WHERE conname = $1`,
        [nome]
      )
      return r.rows[0]?.confdeltype
    }
    // 'n' = SET NULL na conversa (sobrevive), 'c' = CASCADE na mensagem.
    expect(await regra(migrado, "SupportThread_tenantId_fkey")).toBe("n")
    expect(await regra(doSchema, "SupportThread_tenantId_fkey")).toBe("n")
    expect(await regra(migrado, "SupportMessage_threadId_fkey")).toBe("c")
    expect(await regra(doSchema, "SupportMessage_threadId_fkey")).toBe("c")
  })
})
