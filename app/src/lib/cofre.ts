// Cifra o que não pode ser lido nem por quem tiver o banco.
//
// Existe por causa do certificado digital. Um arquivo A1 é a IDENTIDADE da
// empresa: com ele e a senha, alguém emite nota fiscal em nome dela e assina
// documento como ela. Não é credencial de integração — é a assinatura da
// pessoa jurídica.
//
// Por isso ele não pode ficar como o `zapiToken`, em texto puro numa coluna.
// Se um token de WhatsApp vaza, troca-se o token. Se um certificado vaza, não
// existe "trocar": existe revogar na certificadora e comprar outro, e no meio
// disso alguém pode ter emitido nota no CNPJ da cliente.
//
// ─── O que este módulo garante, e o que NÃO garante ──────────────────────────
//
// GARANTE: quem obtiver um dump do banco — backup vazado, acesso indevido ao
// Postgres, engenheiro curioso — não consegue ler nada, porque a chave não
// está lá. Ela vive numa variável de ambiente.
//
// NÃO GARANTE: proteção contra quem já executa código no nosso servidor. Esse
// alguém tem a chave e o banco. Nenhuma cifra do lado do servidor resolve
// isso, e dizer o contrário seria mentira confortável.
//
// AES-256-GCM porque autentica além de cifrar: adulterar o texto cifrado no
// banco faz a decifragem FALHAR, em vez de devolver lixo silenciosamente.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

const ALGORITMO = "aes-256-gcm"
const TAMANHO_IV = 12 // recomendado para GCM
const SEPARADOR = "."

/**
 * A chave, derivada do segredo do ambiente.
 *
 * Derivada e não usada crua: o segredo é texto digitado por gente e quase
 * nunca tem exatamente 32 bytes. SHA-256 dá o tamanho certo sem exigir que
 * alguém acerte o comprimento na mão — e errar isso quebraria a cifra de um
 * jeito que só apareceria ao tentar decifrar.
 */
function chave(): Buffer {
  const segredo = process.env.CERT_ENCRYPTION_KEY
  if (!segredo || segredo.length < 32) {
    throw new Error(
      "CERT_ENCRYPTION_KEY ausente ou curta demais (mínimo 32 caracteres). " +
        "Sem ela o certificado não pode ser guardado nem lido."
    )
  }
  return createHash("sha256").update(segredo, "utf8").digest()
}

/** Há chave configurada? A tela usa para não oferecer envio que vai falhar. */
export function cofreConfigurado(): boolean {
  const s = process.env.CERT_ENCRYPTION_KEY
  return !!s && s.length >= 32
}

/**
 * Cifra. Devolve `iv.tag.dados`, tudo em base64.
 *
 * O IV é sorteado a cada chamada e guardado junto — reusar IV em GCM quebra a
 * cifra por completo, e guardá-lo em separado só criaria uma segunda coisa
 * para perder.
 */
export function cifrar(dados: Buffer | string): string {
  const iv = randomBytes(TAMANHO_IV)
  const c = createCipheriv(ALGORITMO, chave(), iv)
  const bruto = typeof dados === "string" ? Buffer.from(dados, "utf8") : dados
  const cifrado = Buffer.concat([c.update(bruto), c.final()])
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), cifrado.toString("base64")].join(
    SEPARADOR
  )
}

/**
 * Decifra o que `cifrar` produziu.
 *
 * Lança quando o conteúdo foi adulterado ou a chave mudou. Lançar é o
 * comportamento certo: devolver dado parcial de um certificado seria pior que
 * falhar, porque o erro apareceria mais adiante, sem relação com a causa.
 */
export function decifrar(guardado: string): Buffer {
  const partes = guardado.split(SEPARADOR)
  if (partes.length !== 3) throw new Error("Conteúdo cifrado em formato inesperado.")

  const [iv, tag, dados] = partes.map((p) => Buffer.from(p, "base64"))
  const d = createDecipheriv(ALGORITMO, chave(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(dados), d.final()])
}

/** Decifra e devolve texto. Para a senha do certificado. */
export function decifrarTexto(guardado: string): string {
  return decifrar(guardado).toString("utf8")
}
