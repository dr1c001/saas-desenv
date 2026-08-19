import { describe, expect, it } from "vitest"
import { eventosDaMudanca, type RetratoDaOs } from "@/lib/historico-os"

const base: RetratoDaOs = {
  status: "OPEN",
  responsavel: "Ana",
  agendadoEm: "2026-08-20T13:00:00.000Z",
  valor: 250,
  conclusao: null,
  garantiaDias: null,
}

const tipos = (a: RetratoDaOs, b: RetratoDaOs) => eventosDaMudanca(a, b).map((e) => e.tipo)

describe("histórico da OS", () => {
  it("nada mudou, nada é registrado", () => {
    // Salvar a OS sem tocar em nada não pode poluir a linha do tempo — é o
    // que mantém o histórico legível quando a discussão aparecer.
    expect(eventosDaMudanca(base, { ...base })).toEqual([])
  })

  it("registra a troca de status com o código, para a tela traduzir", () => {
    const eventos = eventosDaMudanca(base, { ...base, status: "DONE" })
    expect(eventos).toEqual([{ tipo: "STATUS", antes: "OPEN", depois: "DONE" }])
  })

  it("registra a troca de responsável pelo NOME", () => {
    // Guardar o id faria a linha do tempo virar "responsável mudou para
    // cmr04..." no dia em que a pessoa saísse da empresa.
    const eventos = eventosDaMudanca(base, { ...base, responsavel: "Bruno" })
    expect(eventos).toEqual([{ tipo: "RESPONSAVEL", antes: "Ana", depois: "Bruno" }])
  })

  it("registra quando o responsável é removido", () => {
    const eventos = eventosDaMudanca(base, { ...base, responsavel: null })
    expect(eventos[0]).toMatchObject({ tipo: "RESPONSAVEL", antes: "Ana", depois: null })
  })

  it("campo vazio e nulo são a mesma coisa", () => {
    // Um campo limpo na tela chega como string vazia. Registrar 'de "" para
    // null' seria ruído puro.
    expect(eventosDaMudanca({ ...base, responsavel: "" }, { ...base, responsavel: null })).toEqual([])
    expect(eventosDaMudanca({ ...base, responsavel: "  " }, { ...base, responsavel: null })).toEqual([])
  })

  it("valor é comparado como número, não como texto", () => {
    // "100" e "100.00" são o mesmo dinheiro. Comparar como string geraria um
    // evento a cada gravação, e em um mês o histórico ficaria ilegível.
    expect(eventosDaMudanca(base, { ...base, valor: 250.0 })).toEqual([])
    expect(eventosDaMudanca(base, { ...base, valor: 250.004 })).toEqual([])
  })

  it("registra mudança real de valor", () => {
    const eventos = eventosDaMudanca(base, { ...base, valor: 300 })
    expect(eventos).toEqual([{ tipo: "VALOR", antes: "250", depois: "300" }])
  })

  it("da conclusão guarda só QUE mudou, não o texto", () => {
    // São parágrafos inteiros; duplicá-los incharia a tabela sem ajudar
    // ninguém — o texto atual está na própria OS.
    const eventos = eventosDaMudanca(base, { ...base, conclusao: "Trocada a bomba." })
    expect(eventos).toEqual([{ tipo: "CONCLUSAO", antes: null, depois: null }])
  })

  it("registra a garantia, e zero é diferente de vazio", () => {
    // Zero é "sem garantia", uma escolha; vazio é "usa o padrão da empresa".
    expect(tipos(base, { ...base, garantiaDias: 0 })).toEqual(["GARANTIA"])
    expect(eventosDaMudanca({ ...base, garantiaDias: 0 }, { ...base, garantiaDias: null })).toEqual([
      { tipo: "GARANTIA", antes: "0", depois: null },
    ])
  })

  it("registra reagendamento", () => {
    const eventos = eventosDaMudanca(base, { ...base, agendadoEm: "2026-08-25T13:00:00.000Z" })
    expect(eventos[0].tipo).toBe("AGENDAMENTO")
  })

  it("várias mudanças de uma vez viram vários eventos", () => {
    const eventos = tipos(base, {
      ...base,
      status: "DONE",
      responsavel: "Bruno",
      valor: 400,
      conclusao: "Pronto",
    })
    expect(eventos).toEqual(["STATUS", "RESPONSAVEL", "VALOR", "CONCLUSAO"])
  })

  it("a ordem dos eventos é estável", () => {
    // A tela numera e agrupa; ordem dançando entre gravações confundiria quem
    // lê o histórico em busca de uma mudança específica.
    const mudado = { ...base, status: "DONE", valor: 400, garantiaDias: 90 }
    expect(tipos(base, mudado)).toEqual(tipos(base, mudado))
    expect(tipos(base, mudado)).toEqual(["STATUS", "VALOR", "GARANTIA"])
  })
})
