"use client"

// O elo entre a tela e a fila: enfileirar, sincronizar e observar.
//
// A regra que decide o comportamento das telas: **quando há sinal, nada muda.**
// A operação vai direto, como sempre foi, e o técnico recebe o erro real se
// houver. A fila só entra quando não há rede — senão estaríamos trocando um
// caminho testado por um caminho novo em 99% dos casos, sem ganho nenhum.

import { useSyncExternalStore } from "react"
import { sincronizar } from "@/actions/sincronizar"
import {
  decidir,
  novaOperacao,
  paraEnviar,
  resumir,
  type Operacao,
  type Resumo,
  type TipoOperacao,
} from "@/lib/fila-offline"
import { atualizar, EVENTO_MUDANCA, guardar, listar, remover } from "@/lib/fila-offline-db"

// A fila pode ser DESLIGADA por empresa (lib/funcoes.ts). O interruptor mora
// aqui, num sinalizador de módulo que o layout acerta uma vez, porque `semRede`
// já é o portão de TODO lugar que enfileira — barrar aqui desliga a fila
// inteira sem tocar em nenhum dos botões.
//
// Barra na ENTRADA, e não na sincronização: recusar depois de o técnico ter
// concluído a OS sem sinal perderia o trabalho dele. Desligada, o botão
// simplesmente exige rede, como era antes de a fila existir.
let filaLigada = true

export function definirFilaLigada(ligada: boolean) {
  filaLigada = ligada
}

/** Há rede agora? `navigator.onLine` mente pra mais (diz online em rede sem
 *  saída), nunca pra menos — então serve pra decidir "com certeza NÃO tem".
 *
 *  Com a fila desligada devolve `false` sempre: quem pergunta usa isto para
 *  decidir "enfileirar ou ir direto", e a resposta passa a ser sempre "vá
 *  direto". */
export function semRede(): boolean {
  if (!filaLigada) return false
  return typeof navigator !== "undefined" && navigator.onLine === false
}

function novoId(): string {
  // randomUUID exige contexto seguro; em http local cai no reserva.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function enfileirar(
  tipo: TipoOperacao,
  orderId: string,
  dados: Operacao["dados"]
): Promise<void> {
  await guardar(novaOperacao(tipo, orderId, dados, novoId(), Date.now()))
}

/**
 * Envia o que dá, e trata cada veredito.
 *
 * Devolve quantas saíram da fila, pra a tela poder avisar o técnico de que o
 * trabalho chegou — a confirmação é a metade que falta da promessa.
 */
export async function enviarPendentes(): Promise<{ enviadas: number; travadas: number }> {
  const fila = await listar()
  const lote = paraEnviar(fila)
  if (lote.length === 0) return { enviadas: 0, travadas: resumir(fila).travadas }

  let respostas
  try {
    respostas = await sincronizar(lote)
  } catch {
    // Servidor inalcançável: conta tentativa em todas e tenta de novo depois.
    for (const op of lote) {
      await atualizar({ ...op, tentativas: op.tentativas + 1, ultimoErro: "semResposta" })
    }
    return { enviadas: 0, travadas: resumir(await listar()).travadas }
  }

  let enviadas = 0
  for (const r of respostas) {
    const op = lote.find((o) => o.id === r.id)
    if (!op) continue

    const acao = decidir(r.veredito, op.tentativas)
    if (acao === "remover") {
      await remover(op.id)
      enviadas++
    } else {
      const motivo =
        r.veredito.estado === "recusada" || r.veredito.estado === "falhou"
          ? r.veredito.motivo
          : null
      await atualizar({
        ...op,
        // "travar" força o teto pra a operação parar de tentar e ficar visível.
        tentativas: acao === "travar" ? Number.MAX_SAFE_INTEGER : op.tentativas + 1,
        ultimoErro: motivo,
      })
    }
  }

  return { enviadas, travadas: resumir(await listar()).travadas }
}

// ─── O repositório observável ────────────────────────────────────────────────
//
// A fila mora fora do React (IndexedDB), então o primitivo certo é
// useSyncExternalStore — o mesmo que o OfflineBanner já usa, e pelo mesmo
// motivo: com useState + useEffect a atualização vira setState dentro de
// efeito, que dispara renderização em cascata.
//
// O estado é guardado aqui no módulo, e não em cada componente, porque
// getSnapshot precisa ser SÍNCRONO — e ler IndexedDB não é. A leitura
// acontece fora e deposita o resultado aqui.

const VAZIO: Estado = { pendentes: 0, travadas: 0, total: 0, sincronizando: false }
type Estado = Resumo & { sincronizando: boolean }

let atual: Estado = VAZIO
const ouvintes = new Set<() => void>()

function igual(a: Estado, b: Estado): boolean {
  return (
    a.pendentes === b.pendentes &&
    a.travadas === b.travadas &&
    a.total === b.total &&
    a.sincronizando === b.sincronizando
  )
}

/**
 * Troca o estado e avisa quem observa.
 *
 * Só troca quando algo REALMENTE mudou: getSnapshot precisa devolver a mesma
 * referência enquanto o valor for o mesmo, senão o React entende como estado
 * novo a cada render e entra em laço infinito.
 */
function definir(proximo: Estado) {
  if (igual(atual, proximo)) return
  atual = proximo
  ouvintes.forEach((f) => f())
}

async function recarregarEstado(sincronizando = atual.sincronizando) {
  definir({ ...resumir(await listar()), sincronizando })
}

let sincronizacaoEmCurso: Promise<void> | null = null

/**
 * Tenta enviar. Uma de cada vez.
 *
 * Sem essa trava, abrir duas abas ou receber "online" duas vezes mandaria o
 * mesmo lote em paralelo. A idempotência do servidor salvaria do estrago, mas
 * a segunda chamada contaria tentativa à toa e poderia travar operação boa.
 */
export function tentarSincronizar(): Promise<void> {
  if (sincronizacaoEmCurso) return sincronizacaoEmCurso
  if (semRede()) return recarregarEstado()

  sincronizacaoEmCurso = (async () => {
    definir({ ...atual, sincronizando: true })
    try {
      await enviarPendentes()
    } finally {
      await recarregarEstado(false)
      sincronizacaoEmCurso = null
    }
  })()
  return sincronizacaoEmCurso
}

function assinar(callback: () => void): () => void {
  ouvintes.add(callback)

  const aoVoltar = () => void tentarSincronizar()
  const aoMudar = () => void recarregarEstado()
  window.addEventListener("online", aoVoltar)
  window.addEventListener(EVENTO_MUDANCA, aoMudar)

  // Ao assinar é o momento de olhar a fila pela primeira vez. Ao voltar a rede
  // é o momento óbvio; ao ABRIR a aba também, porque o técnico pode ter
  // fechado o app no subsolo e reaberto já com sinal — e aí o evento "online"
  // nunca dispara.
  void tentarSincronizar()

  return () => {
    ouvintes.delete(callback)
    window.removeEventListener("online", aoVoltar)
    window.removeEventListener(EVENTO_MUDANCA, aoMudar)
  }
}

// No servidor a fila não existe: devolver o vazio evita divergência de
// hidratação, e o valor real aparece assim que o componente monta.
const noServidor = () => VAZIO

/** Observa a fila para a tela mostrar o pendente. */
export function useFilaOffline(): Estado {
  return useSyncExternalStore(assinar, () => atual, noServidor)
}
