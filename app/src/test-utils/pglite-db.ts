import * as fs from "node:fs"
import * as path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { PrismaPGlite } from "pglite-prisma-adapter"
import { PrismaClient } from "@/generated/prisma/client"

export interface TestDatabase {
  db: PrismaClient
  client: PGlite
  reset: () => Promise<void>
  close: () => Promise<void>
}

// Postgres real (WASM, em processo) — sem Docker, sem conta externa, sem
// tocar no banco de produção.
//
// NÃO reaplica o histórico de prisma/migrations/*.sql: esse projeto tem um
// drift conhecido entre o histórico de migrations e o schema real (ver
// PLANO_DE_ENGENHARIA.md, seção 9, item 10) — replay do zero falha ("type
// X does not exist"), confirmado ao montar essa infra de testes. Em vez
// disso, usa um script único gerado direto do schema.prisma atual
// (`npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma
// --script`), que sempre reflete o schema real. Regenerar esse arquivo
// sempre que schema.prisma mudar (test-schema.sql fica em .gitignore).
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite()

  const sqlPath = path.join(__dirname, "test-schema.sql")
  if (!fs.existsSync(sqlPath)) {
    throw new Error(
      "test-schema.sql não existe. Gere com: npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > src/test-utils/test-schema.sql"
    )
  }
  await client.exec(fs.readFileSync(sqlPath, "utf-8"))

  const adapter = new PrismaPGlite(client)
  const db = new PrismaClient({ adapter })

  // As tabelas vêm do próprio banco, não de uma lista escrita à mão.
  //
  // A lista fixa que existia aqui foi ficando para trás a cada tabela nova
  // (AdminAuditLog, PlatformAdmin, MonthlySnapshot, CustomField,
  // ServiceContract, GeocodeBatch...). O sintoma é traiçoeiro: o teste não
  // quebra, ele passa a enxergar as linhas que o teste anterior gravou — e o
  // resultado depende da ORDEM em que os testes rodaram. Descoberto em
  // 18/08/2026, quando um teste contou 6 registros de auditoria em vez de 0.
  //
  // Uma consulta ao catálogo não erra e não precisa ser lembrada.
  const { rows } = await client.query<{ tablename: string }>(
    `select tablename from pg_tables
     where schemaname = 'public' and tablename <> '_prisma_migrations'`
  )
  // TRUNCATE de todas de uma vez com CASCADE: não há ordem de FK a respeitar.
  const TABLES = rows.map((r) => r.tablename)

  return {
    db,
    client,
    async reset() {
      if (TABLES.length === 0) return
      await client.exec(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE;`)
    },
    async close() {
      await db.$disconnect()
      await client.close()
    },
  }
}
