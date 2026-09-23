import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { BUCKET } from "@/lib/foto"

// Armazenamento de arquivos no Supabase Storage.
//
// A logo da empresa é guardada como base64 numa coluna do banco — funciona
// porque tem 20 KB depois do redimensionamento. Foto de OS não: mesmo
// comprimida no aparelho, são centenas de KB, e uma OS pode ter 10. Guardar
// isso em coluna incharia o banco e deixaria toda consulta de OS mais lenta,
// inclusive as que nem querem as fotos.
//
// O bucket é PRIVADO. Foto tirada dentro da casa ou da empresa de um cliente
// final é dado pessoal do cliente do nosso cliente: link público seria
// acessível a quem descobrisse a URL, sem login, pra sempre. A exibição usa
// link assinado com validade curta.

let clienteCache: SupabaseClient | null = null

function admin(): SupabaseClient {
  if (!clienteCache) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !chave) {
      throw new Error("Armazenamento indisponível: falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY")
    }
    // Sem persistir sessão: isto roda no servidor, não há usuário aqui.
    clienteCache = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return clienteCache
}

// O bucket é criado sozinho no primeiro uso. Sem isto, montar um ambiente novo
// (ou o de teste) exigiria mais um passo manual no painel do Supabase — e
// passo manual esquecido vira erro que não diz o que fazer.
let bucketPronto = false

async function garantirBucket(): Promise<void> {
  if (bucketPronto) return
  const { data } = await admin().storage.getBucket(BUCKET)
  if (!data) {
    const { error } = await admin().storage.createBucket(BUCKET, { public: false })
    // "already exists" acontece quando dois processos sobem ao mesmo tempo —
    // é corrida benigna, não falha.
    if (error && !/exist/i.test(error.message)) throw error
  }
  bucketPronto = true
}

export async function enviarArquivo(
  caminho: string,
  conteudo: Buffer,
  tipo: string
): Promise<void> {
  await garantirBucket()
  const { error } = await admin().storage.from(BUCKET).upload(caminho, conteudo, {
    contentType: tipo,
    upsert: false,
  })
  if (error) throw new Error(`Falha ao enviar arquivo: ${error.message}`)
}

/**
 * Link temporário pra exibir a foto.
 *
 * Uma hora é bastante pra abrir a página e olhar, e curto o suficiente pra que
 * um link copiado por engano num grupo de WhatsApp pare de funcionar sozinho.
 */
export async function linkTemporario(caminho: string, segundos = 3600): Promise<string | null> {
  await garantirBucket()
  const { data } = await admin().storage.from(BUCKET).createSignedUrl(caminho, segundos)
  return data?.signedUrl ?? null
}

/** Baixa o conteúdo — usado pra embutir a foto no PDF, que não abre link. */
export async function baixarArquivo(caminho: string): Promise<Buffer | null> {
  await garantirBucket()
  const { data, error } = await admin().storage.from(BUCKET).download(caminho)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Apaga do armazenamento. Falha aqui NÃO derruba quem chama: a linha do banco
 * já foi removida e a foto sumiu da tela; um arquivo órfão custa alguns KB e
 * pode ser varrido depois. O contrário — linha apagada e erro na cara do
 * usuário — seria pior.
 */
export async function apagarArquivo(caminho: string): Promise<void> {
  try {
    await garantirBucket()
    await admin().storage.from(BUCKET).remove([caminho])
  } catch {
    // silencioso de propósito, ver comentário acima
  }
}
