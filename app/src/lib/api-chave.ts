// A chave da API de integração.
//
// Uma chave de API é uma senha que a empresa cola num sistema de terceiros — o
// site dela, o ERP, uma automação. Ela vai parar em arquivo de configuração,
// em variável de ambiente, no histórico de alguém. Então o desenho segue as
// mesmas regras de uma senha, e não as de um identificador:
//
//  1. **O banco NÃO guarda a chave.** Guarda o hash. Se o banco vazar, ninguém
//     sai chamando a API das empresas com o que leu — e um backup nosso, que
//     circula por definição, deixa de ser uma pilha de credenciais válidas.
//  2. **A chave aparece UMA vez**, no momento da criação. Poder reexibir
//     depois obrigaria a guardar o texto, que é justamente o que se evita.
//  3. **Comparação em tempo constante**, para o tempo de resposta não entregar
//     quantos caracteres iniciais um palpite acertou.
//
// O prefixo é o que torna isso viável: sem ele, conferir uma chave exigiria
// carregar TODAS as chaves de TODAS as empresas e testar uma a uma.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** Marca o que a chave é e de onde veio, para quem achar uma solta saber. */
const MARCA = "sos"
const TAMANHO_PREFIXO = 12
const BYTES_SEGREDO = 32

export type ChaveNova = {
  /** O texto completo. Mostrado uma única vez e nunca gravado. */
  chave: string
  /** Vai para o banco: acha a linha sem varrer a tabela. */
  prefixo: string
  /** Vai para o banco no lugar da chave. */
  hash: string
}

function base62(bytes: Buffer): string {
  const alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let saida = ""
  for (const b of bytes) saida += alfabeto[b % 62]
  return saida
}

/**
 * Uma chave nova.
 *
 * Formato: `sos_<prefixo>_<segredo>`. O prefixo é público e identifica a linha;
 * o segredo é o que autentica. Separar os dois é o que permite achar a chave
 * por índice em vez de testar o hash de todas as chaves do banco.
 */
export function gerarChave(): ChaveNova {
  const prefixo = base62(randomBytes(TAMANHO_PREFIXO))
  const segredo = base62(randomBytes(BYTES_SEGREDO))
  const chave = `${MARCA}_${prefixo}_${segredo}`
  return { chave, prefixo, hash: hashDaChave(chave) }
}

/** SHA-256 e não bcrypt: a chave tem 32 bytes de aleatoriedade real, então não
 *  há dicionário para atacar — e a conferência acontece a cada requisição da
 *  API, onde um hash lento custaria caro sem comprar segurança nenhuma. */
export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex")
}

/**
 * O prefixo de uma chave apresentada, ou null se o formato não bate.
 *
 * Recusar aqui evita uma ida ao banco a cada requisição malformada — e a
 * varredura de quem chuta o endereço encontra formato errado, não consulta.
 */
export function prefixoDe(chave: string): string | null {
  const partes = chave.split("_")
  if (partes.length !== 3) return null
  const [marca, prefixo, segredo] = partes
  if (marca !== MARCA) return null
  if (prefixo.length !== TAMANHO_PREFIXO) return null
  if (segredo.length !== BYTES_SEGREDO) return null
  return prefixo
}

/** Lê o `Authorization: Bearer <chave>`. Aceita só esse formato: `?api_key=`
 *  na URL cairia em log de servidor, histórico e cabeçalho Referer. */
export function chaveDoCabecalho(authorization: string | null): string | null {
  if (!authorization) return null
  const [esquema, valor] = authorization.split(" ")
  if (esquema?.toLowerCase() !== "bearer" || !valor) return null
  return valor.trim()
}

/**
 * A chave apresentada corresponde ao hash gravado?
 *
 * `timingSafeEqual` e não `===`: comparação comum sai no primeiro caractere
 * diferente, e o tempo de resposta contaria quantos caracteres o atacante já
 * acertou. Aqui os dois lados têm sempre 64 hex, então o tamanho nunca vaza.
 */
export function chaveConfere(apresentada: string, hashGravado: string): boolean {
  const a = Buffer.from(hashDaChave(apresentada), "hex")
  const b = Buffer.from(hashGravado, "hex")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Como a chave aparece na tela depois de criada: só o prefixo. É o suficiente
 *  para a pessoa saber qual das chaves dela é qual. */
export function mascarar(prefixo: string): string {
  return `${MARCA}_${prefixo}_${"•".repeat(8)}`
}
