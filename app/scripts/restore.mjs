// Restauração de um backup lógico.
//
//   node --env-file=.env.restore scripts/restore.mjs backups/2026-08-18T...
//
// É este script que transforma "temos backup" em "o backup restaura". Enquanto
// ele não rodar com sucesso pelo menos uma vez, o que existe é um arquivo que
// ninguém sabe se presta.
//
// TRAVA DE PRODUÇÃO. Recusa rodar contra o banco apontado por DATABASE_URL do
// .env de produção: restaurar por cima do banco vivo apagaria o trabalho de
// todo mundo desde o backup. Por isso o comando usa .env.restore, um arquivo
// separado que aponta pro banco de ensaio.

import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import pg from "pg"
import { conferir, doJson, ordemDeLimpeza } from "./_backup-lib.mjs"

const LOTE = 500

async function confirmar(pergunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const resposta = await new Promise((r) => rl.question(pergunta, r))
  rl.close()
  return resposta.trim().toUpperCase()
}

async function main() {
  const pasta = process.argv[2]
  if (!pasta) {
    console.error("Uso: node --env-file=.env.restore scripts/restore.mjs <pasta-do-backup>")
    process.exit(1)
  }

  const url = process.env.RESTORE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) {
    console.error("RESTORE_DATABASE_URL (ou DATABASE_URL) não definida.")
    process.exit(1)
  }

  const manifesto = JSON.parse(fs.readFileSync(path.join(pasta, "manifest.json"), "utf-8"))

  const c = new pg.Client({ connectionString: url })
  await c.connect()

  // ── Trava ────────────────────────────────────────────────────────────────
  // Compara com o banco de produção declarado no ambiente. Se forem o mesmo,
  // para. Uma restauração por engano em produção não tem desfazer.
  const { rows: [alvo] } = await c.query(
    "select current_database() as db, inet_server_addr()::text as host"
  )
  if (process.env.PRODUCTION_DATABASE_URL && url === process.env.PRODUCTION_DATABASE_URL) {
    console.error("RECUSADO: a URL alvo é a mesma do banco de produção.")
    process.exit(1)
  }

  // ── Confere o schema ─────────────────────────────────────────────────────
  // Restaurar num schema diferente é a causa número um de restore que
  // "funciona" e corrompe: a coluna some, o valor cai no lugar errado.
  const { rows: aplicadas } = await c.query(
    `select migration_name from _prisma_migrations
     where finished_at is not null order by finished_at desc limit 1`
  ).catch(() => ({ rows: [] }))

  const schemaAlvo = aplicadas[0]?.migration_name ?? null
  if (schemaAlvo !== manifesto.migration) {
    console.error(
      `RECUSADO: schema diferente.\n` +
        `  backup:  ${manifesto.migration}\n` +
        `  destino: ${schemaAlvo}\n` +
        `Rode 'npx prisma migrate deploy' no destino antes de restaurar.`
    )
    process.exit(1)
  }

  console.log(`Destino: ${alvo.db} @ ${alvo.host ?? "local"}`)
  console.log(`Backup:  ${manifesto.geradoEm}, ${Object.keys(manifesto.linhas).length} tabelas`)

  if (!process.env.RESTORE_SEM_CONFIRMAR) {
    const r = await confirmar(`\nApagar TUDO em "${alvo.db}" e restaurar? Digite RESTAURAR: `)
    if (r !== "RESTAURAR") {
      console.log("Cancelado.")
      process.exit(0)
    }
  }

  // ── Limpa e carrega ──────────────────────────────────────────────────────
  const tabelas = manifesto.ordem
  const limpeza = ordemDeLimpeza(tabelas, [])
  await c.query(
    `TRUNCATE TABLE ${limpeza.map((t) => `"${t}"`).join(", ")} CASCADE;`
  )

  for (const tabela of tabelas) {
    const arquivo = path.join(pasta, `${tabela}.jsonl`)
    if (!fs.existsSync(arquivo)) continue

    const linhas = fs
      .readFileSync(arquivo, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
    if (linhas.length === 0) continue

    const colunas = Object.keys(linhas[0])
    for (let i = 0; i < linhas.length; i += LOTE) {
      const lote = linhas.slice(i, i + LOTE)
      // INSERT parametrizado em lote. Concatenar valor no SQL quebraria em
      // qualquer texto com aspas — e o banco está cheio de texto do cliente.
      const valores = []
      const marcadores = lote.map((linha, l) => {
        const p = colunas.map((_, cIdx) => `$${l * colunas.length + cIdx + 1}`)
        for (const col of colunas) valores.push(doJson(linha[col]))
        return `(${p.join(", ")})`
      })
      await c.query(
        `INSERT INTO "${tabela}" (${colunas.map((x) => `"${x}"`).join(", ")}) VALUES ${marcadores.join(", ")}`,
        valores
      )
    }
    console.log(`  ${tabela}: ${linhas.length}`)
  }

  // ── Confere ──────────────────────────────────────────────────────────────
  // A parte que faz este script valer: sem conferência, uma carga que perdeu
  // metade das linhas termina sem barulho nenhum.
  const contagens = {}
  for (const tabela of tabelas) {
    const { rows } = await c.query(`select count(*)::int n from "${tabela}"`)
    contagens[tabela] = rows[0].n
  }
  const fora = conferir(manifesto, contagens)

  await c.end()

  if (fora.length > 0) {
    console.error("\nRESTAURAÇÃO NÃO CONFERE:")
    for (const d of fora) {
      console.error(`  ${d.tabela}: esperado ${d.esperado}, encontrado ${d.encontrado}`)
    }
    process.exit(1)
  }

  const total = Object.values(contagens).reduce((s, n) => s + n, 0)
  console.log(`\nRestaurado e CONFERIDO: ${tabelas.length} tabelas, ${total} linhas.`)
}

main().catch((e) => {
  console.error("Restauração falhou:", e)
  process.exit(1)
})
