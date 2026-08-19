"use client"

// A fila offline no navegador.
//
// IndexedDB, e não localStorage, por três motivos práticos:
//
//  - localStorage é síncrono e trava a interface. O técnico está com o celular
//    na mão, no meio do serviço.
//  - o limite é de ~5MB e compartilhado com tudo; uma conclusão com muitos
//    itens já é grande, e fotos (o próximo passo) não caberiam de jeito nenhum.
//  - localStorage guarda só texto, então tudo viraria JSON.parse a cada
//    leitura.
//
// A fila precisa sobreviver a fechar o app e a PERDER A SESSÃO: se o token
// expirou enquanto o técnico estava sem sinal, ele faz login de novo e o
// trabalho continua lá. Perder a fila no logout seria perder trabalho de campo.

import type { Operacao } from "@/lib/fila-offline"

const BANCO = "servicoos-offline"
const LOJA = "operacoes"
const VERSAO = 1

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, VERSAO)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(LOJA)) {
        db.createObjectStore(LOJA, { keyPath: "id" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Toda operação daqui engole erro e devolve o caso vazio.
 *
 * IndexedDB falha em situações reais e chatas: navegação privada, cota cheia,
 * navegador antigo. Nenhuma delas pode derrubar a tela que o técnico está
 * usando — no pior caso ele fica sem fila offline, com o app funcionando
 * normalmente quando há sinal.
 */
async function comLoja<T>(
  modo: IDBTransactionMode,
  fn: (loja: IDBObjectStore) => IDBRequest,
  vazio: T
): Promise<T> {
  try {
    const db = await abrir()
    return await new Promise<T>((resolve) => {
      const tx = db.transaction(LOJA, modo)
      const req = fn(tx.objectStore(LOJA))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => resolve(vazio)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return vazio
  }
}

export async function listar(): Promise<Operacao[]> {
  const todas = await comLoja<Operacao[]>("readonly", (l) => l.getAll(), [])
  return todas ?? []
}

export async function guardar(op: Operacao): Promise<void> {
  await comLoja("readwrite", (l) => l.put(op), undefined)
  avisarMudanca()
}

export async function remover(id: string): Promise<void> {
  await comLoja("readwrite", (l) => l.delete(id), undefined)
  avisarMudanca()
}

/** Usado ao registrar tentativa e último erro. */
export async function atualizar(op: Operacao): Promise<void> {
  await comLoja("readwrite", (l) => l.put(op), undefined)
  avisarMudanca()
}

export async function limpar(): Promise<void> {
  await comLoja("readwrite", (l) => l.clear(), undefined)
  avisarMudanca()
}

/** Evento próprio: o indicador na tela escuta e se atualiza sem precisar
 *  perguntar de tempos em tempos. */
export const EVENTO_MUDANCA = "servicoos:fila-mudou"

function avisarMudanca() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_MUDANCA))
  }
}
