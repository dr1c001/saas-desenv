// Backup lógico do banco: a parte que decide COMO, sem falar com o banco.
//
// "O Supabase faz backup" não é backup. Backup é o que já foi restaurado pelo
// menos uma vez — antes disso é só um arquivo que ninguém sabe se presta. Este
// módulo existe pra que a restauração seja testável: a ordem de carga e a
// serialização são as duas coisas que silenciosamente quebram um restore, e as
// duas moram aqui.
//
// A ordem das tabelas vem do CATÁLOGO do banco, nunca de uma lista escrita à
// mão. Essa lição já custou caro neste projeto: o reset() dos testes usava
// lista fixa e ficou defasado em seis tabelas sem ninguém notar — o teste não
// quebrava, só passava a enxergar lixo do teste anterior. Num restore o
// sintoma seria pior: a carga falha por chave estrangeira, ou pior ainda,
// alguém desliga a checagem "pra funcionar" e restaura dado inconsistente.

/**
 * Ordena as tabelas para inserção: pai antes de filho.
 *
 * Auto-referência (uma tabela que aponta pra ela mesma) é ignorada como
 * dependência — a linha é inserida e a FK se resolve dentro da própria tabela.
 * Sem essa exceção a tabela nunca sairia da fila e o backup pareceria
 * incompleto sem motivo aparente.
 *
 * Ciclo entre tabelas diferentes não trava a restauração: o que sobra é
 * devolvido no fim, em ordem alfabética, e quem chama decide o que fazer.
 * Travar seria a pior resposta possível na hora em que se está restaurando.
 */
export function ordemDeCarga(tabelas, arestas) {
  const restantes = new Set(tabelas)
  const dependencias = new Map()
  for (const t of tabelas) dependencias.set(t, new Set())

  for (const a of arestas) {
    // Auto-referência não é dependência entre tabelas.
    if (a.tabela === a.referencia) continue
    if (!restantes.has(a.tabela) || !restantes.has(a.referencia)) continue
    dependencias.get(a.tabela).add(a.referencia)
  }

  const ordem = []
  while (restantes.size > 0) {
    // Alfabética entre os prontos: ordem estável entre execuções faz dois
    // backups do mesmo banco gerarem o mesmo arquivo, o que torna possível
    // comparar um com o outro.
    const prontos = [...restantes]
      .filter((t) => [...dependencias.get(t)].every((d) => !restantes.has(d)))
      .sort()

    if (prontos.length === 0) {
      // Ciclo. Devolve o resto em ordem estável em vez de lançar.
      ordem.push(...[...restantes].sort())
      break
    }

    for (const t of prontos) {
      ordem.push(t)
      restantes.delete(t)
    }
  }

  return ordem
}

/** A ordem inversa serve pra apagar: filho antes de pai. */
export function ordemDeLimpeza(tabelas, arestas) {
  return [...ordemDeCarga(tabelas, arestas)].reverse()
}

/**
 * Converte um valor do Postgres para algo que sobrevive ao JSON.
 *
 * Os três que quebram um restore em silêncio:
 *  - Date vira string ISO (JSON.stringify já faria isso, mas explícito é
 *    melhor que implícito quando o dado é o backup).
 *  - BigInt não tem representação em JSON e lança na serialização.
 *  - Buffer/bytea precisa de base64, senão volta como objeto de bytes.
 */
export function paraJson(valor) {
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return { __tipo: "data", v: valor.toISOString() }
  if (typeof valor === "bigint") return { __tipo: "bigint", v: valor.toString() }
  if (valor instanceof Uint8Array) return { __tipo: "bytes", v: Buffer.from(valor).toString("base64") }
  if (Array.isArray(valor)) return valor.map(paraJson)
  return valor
}

/** O caminho de volta. Precisa ser o inverso exato de paraJson. */
export function doJson(valor) {
  if (valor === null || valor === undefined) return null
  if (Array.isArray(valor)) return valor.map(doJson)
  if (typeof valor === "object") {
    const o = valor
    if (o.__tipo === "data") return new Date(o.v)
    if (o.__tipo === "bigint") return BigInt(o.v)
    if (o.__tipo === "bytes") return Buffer.from(o.v, "base64")
  }
  return valor
}

/**
 * Compara o que o manifesto prometeu com o que o banco restaurado tem.
 *
 * É esta função que transforma "restaurei" em "conferi que restaurou". Sem
 * ela, uma carga que perdeu metade das linhas por erro de chave estrangeira
 * termina sem barulho nenhum.
 */
export function conferir(manifesto, contagens) {
  const fora = []
  for (const [tabela, esperado] of Object.entries(manifesto.linhas)) {
    const encontrado = contagens[tabela] ?? 0
    if (encontrado !== esperado) fora.push({ tabela, esperado, encontrado })
  }
  return fora
}

/**
 * A lista de colunas do SELECT, com data/hora convertida para TEXTO.
 *
 * Sem isto o backup CORROMPE silenciosamente: o driver lê uma coluna
 * `timestamp` (sem fuso) interpretando-a no fuso LOCAL, mas grava de volta em
 * UTC. Em Brasília isso desloca toda data em 3 horas — a cada ciclo de backup
 * e restauração. Descoberto pelo teste de ida e volta em 18/08/2026, que é
 * exatamente o motivo de esse teste existir.
 *
 * Convertendo no próprio Postgres, o valor viaja como o texto que o banco
 * guarda e volta pelo mesmo caminho. Nenhum fuso entra na conta.
 */
export function selectDeColunas(colunas) {
  const TEMPO = new Set([
    "timestamp without time zone",
    "timestamp with time zone",
    "date",
    "time without time zone",
    "time with time zone",
  ])
  return colunas
    .map((c) =>
      TEMPO.has(c.tipo)
        ? `"${c.nome}"::text as "${c.nome}"`
        : `"${c.nome}"`
    )
    .join(", ")
}

/**
 * Quais pastas de backup descartar, mantendo as `manter` mais recentes.
 *
 * Função PURA, e separada do script, porque ela APAGA: a decisão de "quais
 * somem" precisa ser testável sem um disco por perto. Um erro de sinal aqui
 * apagaria os recentes e guardaria os velhos, e só se descobriria no dia em
 * que o backup fosse preciso.
 *
 * Só considera pasta com nome de carimbo de tempo (2026-09-01T...): o que mais
 * estiver na pasta — um log, um backup renomeado à mão para "bom-nao-apagar" —
 * fica onde está.
 */
export function pastasParaDescartar(nomes, manter) {
  const doBackup = nomes
    .filter((n) => /^\d{4}-\d{2}-\d{2}T/.test(n))
    .sort()
  return doBackup.slice(0, Math.max(0, doBackup.length - manter))
}
