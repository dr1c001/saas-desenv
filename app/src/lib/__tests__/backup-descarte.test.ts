import { describe, expect, it } from "vitest"
// Importado do .mjs de propósito: a regra tem de ser testada no MESMO arquivo
// que o backup usa, e não numa cópia que pode divergir dele.
import { pastasParaDescartar } from "../../../scripts/_backup-lib.mjs"

// A regra que APAGA backup.
//
// O backup passou a rodar sozinho (tarefa semanal), e backup automático sem
// descarte enche o disco — e, aqui, enche o OneDrive, que sincroniza a pasta.
//
// Mas descarte é a única parte deste sistema que destrói o que deveria
// proteger. Um erro de sinal aqui apaga os recentes e guarda os velhos, e só
// se descobre no dia em que o backup for preciso — que é o pior dia possível
// para descobrir qualquer coisa.

const nomes = (...n: string[]) => n

describe("mantém os mais recentes", () => {
  it("com menos backups que o limite, não descarta nada", () => {
    const p = nomes("2026-09-01T10-00-00Z", "2026-09-08T10-00-00Z")
    expect(pastasParaDescartar(p, 8)).toEqual([])
  })

  it("exatamente no limite, não descarta nada", () => {
    const p = Array.from({ length: 8 }, (_, i) => `2026-09-0${i + 1}T10-00-00Z`)
    expect(pastasParaDescartar(p, 8)).toEqual([])
  })

  it("acima do limite, descarta os MAIS ANTIGOS", () => {
    // O teste que pega a inversão de sinal. Se a ordem estivesse trocada, isto
    // devolveria os dois mais novos — e o dono ficaria com dois meses de
    // backup velho e nenhum recente.
    const p = nomes(
      "2026-07-01T10-00-00Z",
      "2026-07-08T10-00-00Z",
      "2026-09-01T10-00-00Z"
    )
    expect(pastasParaDescartar(p, 1)).toEqual([
      "2026-07-01T10-00-00Z",
      "2026-07-08T10-00-00Z",
    ])
  })

  it("a ordem de entrada não importa", () => {
    // `readdirSync` não promete ordem. Se a função dependesse disso, o
    // descarte seria diferente em máquinas diferentes.
    const baguncado = nomes(
      "2026-09-01T10-00-00Z",
      "2026-07-01T10-00-00Z",
      "2026-08-01T10-00-00Z"
    )
    expect(pastasParaDescartar(baguncado, 1)).toEqual([
      "2026-07-01T10-00-00Z",
      "2026-08-01T10-00-00Z",
    ])
  })
})

describe("não toca no que não é backup", () => {
  it("ignora arquivos e pastas com outro nome", () => {
    // Alguém renomear uma pasta para "bom-nao-apagar" é o gesto mais natural
    // do mundo para proteger uma cópia. O descarte tem de respeitar isso.
    const p = nomes(
      "bom-nao-apagar",
      "_ultima-execucao.log",
      "antes-da-migracao",
      "2026-07-01T10-00-00Z",
      "2026-09-01T10-00-00Z"
    )
    expect(pastasParaDescartar(p, 1)).toEqual(["2026-07-01T10-00-00Z"])
  })

  it("com nenhuma pasta de backup, não descarta nada", () => {
    expect(pastasParaDescartar(nomes("readme.txt", "outra-coisa"), 1)).toEqual([])
  })

  it("lista vazia não quebra", () => {
    expect(pastasParaDescartar([], 8)).toEqual([])
  })
})

describe("limites de guarda", () => {
  it("manter 0 descarta todos os backups, e só eles", () => {
    const p = nomes("2026-09-01T10-00-00Z", "guardado-a-mao")
    expect(pastasParaDescartar(p, 0)).toEqual(["2026-09-01T10-00-00Z"])
  })

  it("manter negativo não descarta MAIS que tudo", () => {
    // `slice(0, n)` com n maior que o tamanho é inofensivo, mas o `Math.max`
    // existe para o cálculo nunca virar um índice negativo — que em `slice`
    // conta do FIM e devolveria os recentes.
    const p = nomes("2026-09-01T10-00-00Z", "2026-09-08T10-00-00Z")
    expect(pastasParaDescartar(p, -5)).toEqual(p)
  })
})
