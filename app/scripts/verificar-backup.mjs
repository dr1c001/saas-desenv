// Prova que um backup restaura — sem banco nenhum e sem risco nenhum.
//
//   node scripts/verificar-backup.mjs backups/2026-08-19T...
//
// Sobe um Postgres descartável em memória (pglite), aplica o schema, carrega o
// backup e confere linha a linha contra o manifesto. Não toca em produção, não
// precisa de banco de ensaio, não pede credencial.
//
// É isto que separa "temos backup" de "o backup restaura". Rodar depois de
// cada backup custa segundos; descobrir na hora do desastre custa a empresa.
//
// A restauração num banco de VERDADE (para promover o ensaio a produção, por
// exemplo) é scripts/restore.mjs. Este aqui é a conferência de rotina.

import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { PGlite } from "@electric-sql/pglite"
import { conferir, doJson, ordemDeLimpeza } from "./_backup-lib.mjs"

async function main() {
  const pasta = process.argv[2]
  if (!pasta) {
    console.error("Uso: node scripts/verificar-backup.mjs <pasta-do-backup>")
    process.exit(1)
  }

  const manifesto = JSON.parse(fs.readFileSync(path.join(pasta, "manifest.json"), "utf-8"))
  console.log(`Backup de ${manifesto.geradoEm}`)
  console.log(`Schema:   ${manifesto.migration}`)

  // O schema sai do schema.prisma atual. Se o backup foi tirado de um banco
  // com schema diferente do de agora, a carga falha aqui — que e exatamente o
  // aviso que se quer receber ANTES de precisar do backup.
  console.log("\nMontando banco descartavel...")
  const sql = execSync(
    "npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script",
    { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }
  )

  const db = new PGlite()
  await db.exec(sql)

  console.log("Carregando...")
  let carregadas = 0
  for (const tabela of manifesto.ordem) {
    const arquivo = path.join(pasta, `${tabela}.jsonl`)
    if (!fs.existsSync(arquivo)) continue

    const linhas = fs
      .readFileSync(arquivo, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
    if (linhas.length === 0) continue

    const colunas = Object.keys(linhas[0])
    for (const linha of linhas) {
      const valores = colunas.map((c) => doJson(linha[c]))
      const marcadores = colunas.map((_, i) => `$${i + 1}`).join(", ")
      await db.query(
        `INSERT INTO "${tabela}" (${colunas.map((c) => `"${c}"`).join(", ")}) VALUES (${marcadores})`,
        valores
      )
    }
    carregadas += linhas.length
  }

  // Conferencia: sem isto, uma carga que perdeu metade das linhas termina sem
  // barulho nenhum.
  const contagens = {}
  for (const tabela of manifesto.ordem) {
    const r = await db.query(`select count(*)::int n from "${tabela}"`)
    contagens[tabela] = r.rows[0].n
  }
  const fora = conferir(manifesto, contagens)

  // Limpa antes de sair, so pra provar que a ordem inversa tambem funciona —
  // e ela que o restore.mjs usa pra esvaziar o destino.
  await db.exec(
    `TRUNCATE TABLE ${ordemDeLimpeza(manifesto.ordem, []).map((t) => `"${t}"`).join(", ")} CASCADE;`
  )
  await db.close()

  if (fora.length > 0) {
    console.error("\nBACKUP NAO CONFERE:")
    for (const d of fora) {
      console.error(`  ${d.tabela}: esperado ${d.esperado}, restaurou ${d.encontrado}`)
    }
    process.exit(1)
  }

  // ─── O que mora fora do banco ────────────────────────────────────────────
  //
  // As contas de login e as fotos nao passam pelo pglite: nao ha schema `auth`
  // nem Storage num Postgres em memoria. Mas nao conferir NADA sobre elas
  // deixaria o "PROVADO" mentir — ele estaria falando so das tabelas, e quem
  // le entende "o backup inteiro esta bom".
  //
  // Da para conferir o que importa: os arquivos existem em disco, e a
  // contagem bate com o que o manifesto prometeu.
  const faltando = []
  const contas = manifesto.contasDeLogin
  const arquivos = manifesto.arquivos

  if (!contas) {
    faltando.push("o manifesto nao registra contas de login (backup anterior a 01/09/2026)")
  } else {
    const arq = path.join(pasta, "_contas-de-login.jsonl")
    const n = fs.existsSync(arq)
      ? fs.readFileSync(arq, "utf-8").split("\n").filter(Boolean).length
      : -1
    if (n !== contas.total) faltando.push(`contas de login: manifesto diz ${contas.total}, arquivo tem ${n}`)
  }

  if (!arquivos) {
    faltando.push("o manifesto nao registra arquivos (backup anterior a 01/09/2026)")
  } else if (!arquivos.pulado) {
    let achados = 0
    const andar = (d) => {
      if (!fs.existsSync(d)) return
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) andar(path.join(d, e.name))
        else achados++
      }
    }
    andar(path.join(pasta, "arquivos"))
    if (achados !== arquivos.total) {
      faltando.push(`arquivos: manifesto diz ${arquivos.total}, encontrei ${achados} em disco`)
    }
  }

  if (faltando.length > 0) {
    console.error("\nBACKUP INCOMPLETO:")
    for (const p of faltando) console.error(`  ${p}`)
    process.exit(1)
  }

  // Só agora, com TUDO conferido, a palavra "provado" é honesta.
  console.log(`\nPROVADO: ${manifesto.ordem.length} tabelas, ${carregadas} linhas restauradas e conferidas.`)
  console.log(
    `         ${contas.total} contas de login` +
      (contas.comSenha ? " (com senha)" : " (sem senha — recuperam por e-mail)") +
      (arquivos.pulado ? "" : `, ${arquivos.total} arquivos conferidos em disco.`)
  )
  console.log("Este backup restaura.")
}

main().catch((e) => {
  console.error("\nVerificacao falhou:", e.message ?? e)
  process.exit(1)
})
