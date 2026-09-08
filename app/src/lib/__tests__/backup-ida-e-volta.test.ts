import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import {
  conferir,
  doJson,
  ordemDeCarga,
  ordemDeLimpeza,
  paraJson,
  selectDeColunas,
} from "../../../scripts/_backup-lib.mjs"

// A prova. "O Supabase faz backup" não é backup — backup é o que já foi
// restaurado pelo menos uma vez. Este teste faz o ciclo inteiro num Postgres
// de verdade (pglite): semeia dados representativos, exporta, APAGA TUDO,
// restaura e confere linha a linha.
//
// Usa exatamente as mesmas funções que scripts/backup.mjs e scripts/restore.mjs
// — não uma reimplementação. Um teste que exercitasse outro caminho provaria
// apenas que o teste funciona.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
})

afterAll(async () => {
  await testDb.close()
})

/** Lê o catálogo do banco, igual ao script de backup. */
async function catalogo() {
  const t = await testDb.client.query<{ tablename: string }>(
    `select tablename from pg_tables
     where schemaname = 'public' and tablename <> '_prisma_migrations'`
  )
  const fk = await testDb.client.query<{ tabela: string; referencia: string }>(`
    select tc.table_name as tabela, ccu.table_name as referencia
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)
  const col = await testDb.client.query<{ tabela: string; nome: string; tipo: string }>(
    `select table_name as tabela, column_name as nome, data_type as tipo
     from information_schema.columns where table_schema = 'public'
     order by ordinal_position`
  )
  const colunas: Record<string, { nome: string; tipo: string }[]> = {}
  for (const c of col.rows) (colunas[c.tabela] ??= []).push({ nome: c.nome, tipo: c.tipo })

  return { tabelas: t.rows.map((r) => r.tablename), arestas: fk.rows, colunas }
}

/** O mesmo dump que scripts/backup.mjs faz, em memória. */
async function exportar(ordem: string[], colunas: Record<string, { nome: string; tipo: string }[]>) {
  const dados: Record<string, unknown[]> = {}
  const linhas: Record<string, number> = {}
  for (const tabela of ordem) {
    const { rows } = await testDb.client.query(
      `select ${selectDeColunas(colunas[tabela] ?? [])} from "${tabela}" order by ctid`
    )
    dados[tabela] = rows.map((linha) => {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(linha as Record<string, unknown>)) o[k] = paraJson(v)
      // Passa por JSON de verdade: é assim que o arquivo é escrito, e é aí
      // que Date, BigInt e bytes se perderiam se a conversão estivesse errada.
      return JSON.parse(JSON.stringify(o))
    })
    linhas[tabela] = rows.length
  }
  return { dados, linhas }
}

/** A mesma carga que scripts/restore.mjs faz. */
async function restaurar(ordem: string[], dados: Record<string, unknown[]>) {
  for (const tabela of ordem) {
    const linhas = dados[tabela] ?? []
    if (linhas.length === 0) continue
    const colunas = Object.keys(linhas[0] as Record<string, unknown>)
    for (const linha of linhas as Record<string, unknown>[]) {
      const valores = colunas.map((c) => doJson(linha[c]))
      const marcadores = colunas.map((_, i) => `$${i + 1}`).join(", ")
      await testDb.client.query(
        `INSERT INTO "${tabela}" (${colunas.map((c) => `"${c}"`).join(", ")}) VALUES (${marcadores})`,
        valores
      )
    }
  }
}

describe("backup e restauração — o ciclo completo", () => {
  it("exporta, apaga tudo e restaura sem perder nem inventar linha", async () => {
    await testDb.reset()

    // ── Dados representativos, com os tipos que quebram um restore ─────────
    const plano = await testDb.db.plan.create({
      data: { name: "Pro", slug: "pro", priceMonthly: 197, priceYearly: 1970, features: ["a", "b"] },
    })
    const tenant = await testDb.db.tenant.create({
      data: {
        name: "Empresa do Teste",
        planId: plano.id,
        // JSON livre: não pode ser confundido com marcador de tipo.
        vocabulary: { os: { curto: "OS", singular: "ordem", plural: "ordens", genero: "f" } },
        // Array de texto.
        extraFeatures: ["gpsMap", "stock"],
        // Texto com aspas e acento — o que quebra INSERT concatenado.
        orderTerms: 'Garantia de 90 dias. O cliente disse "está ótimo".',
        // Data.
        onboardingDismissedAt: new Date("2026-08-18T10:00:00.000Z"),
      },
    })
    const cliente = await testDb.db.client.create({
      data: {
        tenantId: tenant.id,
        name: "José D'Ávila & Cia",
        address: { create: { street: "Rua A", city: "Piracicaba", latitude: -22.72, longitude: -47.64 } },
      },
    })
    const os = await testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id,
        clientId: cliente.id,
        number: 1,
        title: "Troca de bomba",
        // Decimal.
        totalAmount: 1234.56,
        items: { create: [{ description: "Bomba", quantity: 1, unitPrice: 1234.56, total: 1234.56 }] },
      },
    })
    await testDb.db.orderEvent.create({
      data: { tenantId: tenant.id, orderId: os.id, type: "CRIADA", actorName: "Ana" },
    })

    // ── Exporta ───────────────────────────────────────────────────────────
    const { tabelas, arestas, colunas } = await catalogo()
    const ordem = ordemDeCarga(tabelas, arestas)
    const { dados, linhas } = await exportar(ordem, colunas)

    const manifesto = {
      geradoEm: new Date().toISOString(),
      migration: "teste",
      linhas,
      ordem,
    }
    const totalAntes = Object.values(linhas).reduce((s, n) => s + n, 0)
    expect(totalAntes).toBeGreaterThan(0)

    // ── Apaga TUDO ────────────────────────────────────────────────────────
    const limpeza = ordemDeLimpeza(tabelas, arestas)
    await testDb.client.exec(
      `TRUNCATE TABLE ${limpeza.map((t) => `"${t}"`).join(", ")} CASCADE;`
    )
    expect(await testDb.db.tenant.count()).toBe(0)
    expect(await testDb.db.serviceOrder.count()).toBe(0)

    // ── Restaura ──────────────────────────────────────────────────────────
    await restaurar(ordem, dados)

    // ── Confere ───────────────────────────────────────────────────────────
    const contagens: Record<string, number> = {}
    for (const t of ordem) {
      const { rows } = await testDb.client.query<{ n: number }>(
        `select count(*)::int n from "${t}"`
      )
      contagens[t] = rows[0].n
    }
    expect(conferir(manifesto, contagens)).toEqual([])
  })

  it("os valores voltam idênticos, não só a contagem", async () => {
    // Contagem certa com conteúdo corrompido é o pior resultado possível:
    // parece que deu certo. Este teste olha os tipos que se perdem calados.
    const t = await testDb.db.tenant.findFirst({ where: { name: "Empresa do Teste" } })
    expect(t).not.toBeNull()
    expect(t!.orderTerms).toBe('Garantia de 90 dias. O cliente disse "está ótimo".')
    expect(t!.extraFeatures).toEqual(["gpsMap", "stock"])
    expect(t!.onboardingDismissedAt?.toISOString()).toBe("2026-08-18T10:00:00.000Z")
    expect((t!.vocabulary as { os: { curto: string } }).os.curto).toBe("OS")

    const os = await testDb.db.serviceOrder.findFirst({ include: { items: true, client: true } })
    // Decimal: o campo mais fácil de voltar como string ou perder casa.
    expect(Number(os!.totalAmount)).toBe(1234.56)
    expect(os!.client.name).toBe("José D'Ávila & Cia")
    expect(Number(os!.items[0].unitPrice)).toBe(1234.56)

    const endereco = await testDb.db.address.findFirst()
    expect(endereco!.latitude).toBe(-22.72)

    const evento = await testDb.db.orderEvent.findFirst()
    expect(evento!.actorName).toBe("Ana")
  })

  it("as chaves estrangeiras continuam de pé depois do restore", async () => {
    // A ordem de carga existe pra isto. Se estivesse errada, a OS teria sido
    // inserida antes do cliente e o banco teria recusado — ou pior, alguém
    // desligaria a checagem e o dado voltaria órfão.
    const os = await testDb.db.serviceOrder.findFirst({
      include: { client: true, tenant: true, orderEvents: true },
    })
    expect(os!.client).not.toBeNull()
    expect(os!.tenant.name).toBe("Empresa do Teste")
    expect(os!.orderEvents).toHaveLength(1)
  })
})
