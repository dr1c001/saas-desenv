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

  // Ordem respeita FKs (filhos antes dos pais).
  const TABLES = [
    "AuthRateLimit",
    "PushSubscription",
    "UserLocation",
    "TabPermission",
    "ChecklistItem",
    "ServiceItem",
    "Attachment",
    "MaintenanceItem",
    "ServiceOrder",
    "MaintenanceOrder",
    "Quote",
    "Equipment",
    "Revenue",
    "Expense",
    "Address",
    "UserAddress",
    "Client",
    "Provider",
    "Subscription",
    "User",
    "Tenant",
    "Plan",
  ]

  return {
    db,
    client,
    async reset() {
      await client.exec(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE;`)
    },
    async close() {
      await db.$disconnect()
      await client.close()
    },
  }
}
