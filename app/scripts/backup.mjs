// Backup lógico do banco inteiro.
//
//   node --env-file=.env scripts/backup.mjs [pasta-destino]
//
// Gera uma pasta com um .jsonl por tabela e um manifest.json com a contagem de
// linhas e a última migration aplicada. É a contagem que permite a restauração
// se conferir — sem ela, uma carga que perdeu metade das linhas termina sem
// barulho nenhum.
//
// Cobre TRES coisas, e as duas ultimas moram fora do schema `public`:
//   - as tabelas do sistema;
//   - as CONTAS DE LOGIN (schema `auth` do Supabase) — sem elas, restaurar
//     devolvia todos os dados e ninguem conseguia entrar;
//   - os ARQUIVOS do Storage (as fotos) — sem eles, todo registro de foto
//     apontava para um arquivo inexistente.
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
import { ordemDeCarga, pastasParaDescartar, paraJson, selectDeColunas } from "./_backup-lib.mjs"
import { salvarArquivos, salvarContasDeLogin } from "./_backup-extras.mjs"

const LOTE = 1000

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL não definida. Rode com: node --env-file=.env scripts/backup.mjs")
    process.exit(1)
  }

  const comSenha = process.argv.includes("--com-senha")
  const destino =
    process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) ??
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

  // ─── O que mora fora do schema `public` ──────────────────────────────────
  // As contas de login e as fotos. Ver _backup-extras.mjs para o porquê de
  // cada uma, e por que a senha fica de fora por padrão.
  const contas = await salvarContasDeLogin(c, destino, { comSenha })
  console.log(
    `  contas de login: ${contas.total}` + (comSenha ? " (com hash de senha)" : " (sem senha)")
  )

  const arquivos = await salvarArquivos(destino)
  if (arquivos.pulado) console.log(`  arquivos: PULADO — ${arquivos.pulado}`)
  else console.log(`  arquivos: ${arquivos.total} (${Math.round(arquivos.bytes / 1024)} KB)`)

  const manifesto = {
    geradoEm: new Date().toISOString(),
    migration: migrations[0]?.migration_name ?? null,
    linhas,
    ordem,
    contasDeLogin: contas,
    arquivos,
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
    `${contas.total} contas de login` +
      (arquivos.pulado ? "" : `, ${arquivos.total} arquivos (${Math.round(arquivos.bytes / 1024)} KB)`)
  )
  // ─── Descarte dos antigos ────────────────────────────────────────────────
  //
  // Backup automático sem descarte enche o disco — e, aqui, enche o OneDrive,
  // que sincroniza esta pasta.
  //
  // Guarda os MANTER mais recentes, e não só o último. A razão é dano que se
  // descobre tarde: um apagamento por engano na segunda só aparece na sexta, e
  // a essa altura um backup único já teria copiado a ausência por cima da
  // única cópia boa. Com uma execução por semana, isto é dois meses de volta.
  const MANTER = 8
  const raizBackups = path.dirname(path.resolve(destino))
  try {
    const pastas = fs
      .readdirSync(raizBackups, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    for (const velha of pastasParaDescartar(pastas, MANTER)) {
      fs.rmSync(path.join(raizBackups, velha), { recursive: true, force: true })
      console.log(`  descartado: ${velha}`)
    }
  } catch (e) {
    // Falha ao limpar não pode invalidar um backup que já deu certo.
    console.warn(`  (não consegui descartar os antigos: ${e.message})`)
  }

  console.log(
    "\nEste backup ainda NÃO foi provado. Prove com:\n" +
      `  npm run backup:provar -- ${destino}`
  )
}

main().catch((e) => {
  console.error("Backup falhou:", e)
  process.exit(1)
})
