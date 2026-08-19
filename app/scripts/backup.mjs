// Backup lógico do banco inteiro.
//
//   node --env-file=.env scripts/backup.mjs [pasta-destino]
//
// Gera uma pasta com um .jsonl por tabela e um manifest.json com a contagem de
// linhas e a última migration aplicada. É a contagem que permite a restauração
// se conferir — sem ela, uma carga que perdeu metade das linhas termina sem
// barulho nenhum.
//
// Por que não pg_dump: ele não está instalado em toda máquina, e a versão do
// cliente precisa casar com a do servidor (o Supabase roda Postgres 15/17 e o
// pg_dump 14 local recusa). Este script depende só do `pg`, que o projeto já
// usa. O custo é não trazer objetos de banco além de dados — o que é aceitável
// porque o SCHEMA já é reproduzível pelas migrations (reparadas em 12/06) e
// isso é verificado pelo teste de ida e volta.
//
// LEIA ANTES DE CONFIAR: este arquivo contém dados pessoais de clientes finais
// de terceiros. Guardar significa assumir a guarda deles. Trate como o banco.

import fs from "node:fs"
import path from "node:path"
import pg from "pg"
import { ordemDeCarga, paraJson, selectDeColunas } from "./_backup-lib.mjs"

const LOTE = 1000

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL não definida. Rode com: node --env-file=.env scripts/backup.mjs")
    process.exit(1)
  }

  const destino =
    process.argv[2] ??
    path.join("backups", new Date().toISOString().replace(/[:.]/g, "-"))
  fs.mkdirSync(destino, { recursive: true })

  const c = new pg.Client({ connectionString: url })
  await c.connect()

  // Tabelas e dependências vêm do CATÁLOGO, nunca de lista escrita à mão:
  // lista fixa fica defasada em silêncio (foi o que aconteceu com o reset()
  // dos testes, defasado em seis tabelas sem ninguém notar).
  const { rows: tabelas } = await c.query(
    `select tablename from pg_tables
     where schemaname = 'public' and tablename <> '_prisma_migrations'`
  )
  const nomes = tabelas.map((t) => t.tablename)

  const { rows: fks } = await c.query(`
    select tc.table_name as tabela, ccu.table_name as referencia
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`)

  const ordem = ordemDeCarga(nomes, fks)

  // Tipos das colunas: data/hora e lida como TEXTO, senao o driver desloca
  // toda data pelo fuso local a cada ciclo (ver selectDeColunas).
  const { rows: colunasCru } = await c.query(
    `select table_name as tabela, column_name as nome, data_type as tipo
     from information_schema.columns where table_schema = 'public'
     order by ordinal_position`
  )
  const colunasPorTabela = {}
  for (const c2 of colunasCru) {
    ;(colunasPorTabela[c2.tabela] ??= []).push({ nome: c2.nome, tipo: c2.tipo })
  }

  const { rows: migrations } = await c.query(
    `select migration_name from _prisma_migrations
     where finished_at is not null order by finished_at desc limit 1`
  )

  const linhas = {}
  for (const tabela of ordem) {
    const arquivo = path.join(destino, `${tabela}.jsonl`)
    const saida = fs.createWriteStream(arquivo, { encoding: "utf-8" })
    let total = 0

    // Paginado por OFFSET: uma tabela grande não pode carregar inteira na
    // memória do processo. Ordenado por ctid pra a paginação ser estável.
    for (let offset = 0; ; offset += LOTE) {
      const { rows } = await c.query(
        `select ${selectDeColunas(colunasPorTabela[tabela] ?? [])} from "${tabela}" ` +
          `order by ctid limit ${LOTE} offset ${offset}`
      )
      if (rows.length === 0) break
      for (const linha of rows) {
        const convertida = {}
        for (const [k, v] of Object.entries(linha)) convertida[k] = paraJson(v)
        saida.write(JSON.stringify(convertida) + "\n")
      }
      total += rows.length
      if (rows.length < LOTE) break
    }

    await new Promise((r) => saida.end(r))
    linhas[tabela] = total
    console.log(`  ${tabela}: ${total}`)
  }

  const manifesto = {
    geradoEm: new Date().toISOString(),
    migration: migrations[0]?.migration_name ?? null,
    linhas,
    ordem,
  }
  fs.writeFileSync(
    path.join(destino, "manifest.json"),
    JSON.stringify(manifesto, null, 2) + "\n",
    "utf-8"
  )

  await c.end()

  const totalLinhas = Object.values(linhas).reduce((s, n) => s + n, 0)
  console.log(`\nBackup em ${destino}`)
  console.log(`${ordem.length} tabelas, ${totalLinhas} linhas, schema ${manifesto.migration}`)
  console.log(
    "\nEste backup ainda NÃO foi provado. Prove com:\n" +
      `  node --env-file=.env.restore scripts/restore.mjs ${destino}`
  )
}

main().catch((e) => {
  console.error("Backup falhou:", e)
  process.exit(1)
})
