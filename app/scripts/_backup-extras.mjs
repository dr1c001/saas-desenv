// O que mora FORA do schema `public`, e por isso ficava fora do backup.
//
// O backup lê `pg_tables where schemaname = 'public'` — as tabelas do sistema.
// Duas coisas essenciais não estão lá:
//
//   1. as CONTAS DE LOGIN, no schema `auth` do Supabase;
//   2. as FOTOS, que são arquivos no Storage, não linhas no banco.
//
// Sem as duas, restaurar devolvia clientes, OS e financeiro — e ninguém
// conseguia entrar, e toda foto de serviço apontava para um arquivo que não
// existe mais. (Descoberto conferindo o backup em 01/09/2026.)

import fs from "node:fs"
import path from "node:path"

/**
 * As contas de login (`auth.users`).
 *
 * ─── Por que SEM a senha, por padrão ───────────────────────────────────────
 *
 * Guardar o hash faria a restauração ser transparente: todo mundo volta a
 * entrar com a senha de sempre. O custo é que hashes de senha passam a viver
 * em disco — e, neste projeto, a pasta de backup fica dentro do OneDrive, ou
 * seja, sincronizada para a nuvem.
 *
 * Sem o hash a recuperação continua completa: as contas são recriadas com o
 * MESMO id (que é o `User.id` do sistema — conferido: os 6 usuários batem), e
 * cada pessoa entra pelo "esqueci minha senha". Um e-mail a mais no pior dia
 * do ano é um preço pequeno perto de vazar hash de senha num dia comum.
 *
 * Quem quiser o outro lado da troca roda com `--com-senha`, sabendo o que está
 * escolhendo.
 */
export async function salvarContasDeLogin(cliente, destino, { comSenha = false } = {}) {
  const colunas = [
    "id",
    "email",
    "phone",
    "created_at",
    "email_confirmed_at",
    "last_sign_in_at",
    "raw_user_meta_data",
    "raw_app_meta_data",
    // `role` e `aud` fazem parte do que o Supabase espera ao recriar a conta.
    "role",
    "aud",
  ]
  if (comSenha) colunas.push("encrypted_password")

  const { rows } = await cliente.query(
    `select ${colunas.map((c) => `"${c}"`).join(", ")} from auth.users order by created_at`
  )

  const arquivo = path.join(destino, "_contas-de-login.jsonl")
  const saida = fs.createWriteStream(arquivo, { encoding: "utf-8" })
  for (const linha of rows) {
    const convertida = {}
    for (const [k, v] of Object.entries(linha)) {
      convertida[k] = v instanceof Date ? v.toISOString() : v
    }
    saida.write(JSON.stringify(convertida) + "\n")
  }
  await new Promise((r) => saida.end(r))

  return { total: rows.length, comSenha }
}

/**
 * Os arquivos do Storage — hoje, as fotos das OS e dos orçamentos.
 *
 * Baixa o conteúdo de verdade, e não só a listagem: o registro `Attachment` já
 * está no backup das tabelas e sozinho não serve de nada — aponta para um
 * arquivo. A foto É a prova do serviço prestado.
 *
 * Usa a chave de serviço que já está no `.env` (o mesmo que o resto do script
 * lê). O bucket é privado, então não há URL pública para baixar sem ela.
 */
export async function salvarArquivos(destino, { bucket = "os-fotos" } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) {
    return { total: 0, bytes: 0, pulado: "faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }
  }

  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(url, chave, { auth: { persistSession: false } })

  // A listagem do Storage é por pasta e paginada. As fotos ficam em
  // <tenantId>/<dono>/<arquivo>, então é preciso descer a árvore.
  const caminhos = []
  async function listar(prefixo) {
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefixo, { limit: 100, offset: pagina * 100 })
      if (error) throw new Error(`Storage.list(${prefixo}): ${error.message}`)
      if (!data || data.length === 0) return
      for (const item of data) {
        const cheio = prefixo ? `${prefixo}/${item.name}` : item.name
        // Pasta não tem `id`; arquivo tem. É como a API do Supabase separa.
        if (item.id) caminhos.push(cheio)
        else await listar(cheio)
      }
      if (data.length < 100) return
    }
  }
  await listar("")

  let bytes = 0
  for (const caminho of caminhos) {
    const { data, error } = await supabase.storage.from(bucket).download(caminho)
    if (error) throw new Error(`Storage.download(${caminho}): ${error.message}`)
    const conteudo = Buffer.from(await data.arrayBuffer())
    const alvo = path.join(destino, "arquivos", bucket, caminho)
    fs.mkdirSync(path.dirname(alvo), { recursive: true })
    fs.writeFileSync(alvo, conteudo)
    bytes += conteudo.length
  }

  return { total: caminhos.length, bytes, bucket }
}
