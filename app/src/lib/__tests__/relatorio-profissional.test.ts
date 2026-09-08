import { describe, expect, it } from "vitest"
import {
  agruparPorProfissional,
  type OsDoPeriodo,
  type Profissional,
} from "@/lib/relatorio-profissional"

const SEM = "Sem responsável"

const os = (p: Partial<OsDoPeriodo> = {}): OsDoPeriodo => ({
  technicianId: "u1",
  totalAmount: 100,
  createdAt: new Date("2026-08-01T12:00:00Z"),
  concludedAt: new Date("2026-08-03T12:00:00Z"),
  npsScore: null,
  ...p,
})

const equipe: Profissional[] = [
  { id: "u1", name: "Ana", emCampo: true },
  { id: "u2", name: "Bruno", emCampo: true },
]

describe("relatório por profissional", () => {
  it("soma valor e conta serviços de cada um", () => {
    const linhas = agruparPorProfissional(
      [os({ totalAmount: 300 }), os({ totalAmount: 200 }), os({ technicianId: "u2", totalAmount: 400 })],
      equipe,
      SEM
    )
    expect(linhas.map((l) => [l.nome, l.concluidas, l.total])).toEqual([
      ["Ana", 2, 500],
      ["Bruno", 1, 400],
    ])
  })

  it("mostra quem não fechou nada, com zero", () => {
    // Zero é informação: é justamente o que o dono quer enxergar.
    const linhas = agruparPorProfissional([os()], equipe, SEM)
    const bruno = linhas.find((l) => l.nome === "Bruno")!
    expect(bruno.concluidas).toBe(0)
    expect(bruno.total).toBe(0)
    expect(bruno.ticketMedio).toBe(0)
    expect(bruno.diasMedios).toBeNull()
  })

  it("serviço sem responsável vira uma linha própria", () => {
    // Se sumisse, a soma da tela não bateria com o financeiro — e aí o dono
    // para de confiar no relatório inteiro, com razão.
    const linhas = agruparPorProfissional(
      [os({ totalAmount: 100 }), os({ technicianId: null, totalAmount: 700 })],
      equipe,
      SEM
    )
    expect(linhas[0].nome).toBe(SEM)
    expect(linhas[0].id).toBeNull()
    expect(linhas.reduce((s, l) => s + l.total, 0)).toBe(800)
  })

  it("não inventa a linha 'sem responsável' quando não há nenhum", () => {
    const linhas = agruparPorProfissional([os()], equipe, SEM)
    expect(linhas.some((l) => l.id === null)).toBe(false)
  })

  it("mantém o histórico de quem saiu da equipe", () => {
    // O trabalho foi feito e o dinheiro entrou. Sumir com isso ao desligar a
    // pessoa faria o total do período mudar sozinho depois do fato.
    const linhas = agruparPorProfissional([os({ technicianId: "sumiu", totalAmount: 250 })], equipe, SEM)
    const orfa = linhas.find((l) => l.id === "sumiu")!
    expect(orfa.total).toBe(250)
  })

  it("o dono que atendeu aparece com o nome dele, não como sem responsável", () => {
    // O dono tem papel OWNER, então não está na lista de campo. Se o nome não
    // fosse resolvido, ele viraria uma segunda linha "Sem responsável" — e o
    // relatório mostraria duas linhas com o mesmo rótulo.
    const pessoas: Profissional[] = [
      ...equipe,
      { id: "dono", name: "Carlos", emCampo: false },
    ]
    const linhas = agruparPorProfissional([os({ technicianId: "dono", totalAmount: 900 })], pessoas, SEM)
    const carlos = linhas.find((l) => l.id === "dono")!
    expect(carlos.nome).toBe("Carlos")
    expect(carlos.total).toBe(900)
  })

  it("quem não atende em campo não vira linha zerada permanente", () => {
    const pessoas: Profissional[] = [
      ...equipe,
      { id: "adm", name: "Financeiro", emCampo: false },
    ]
    const linhas = agruparPorProfissional([os()], pessoas, SEM)
    expect(linhas.some((l) => l.id === "adm")).toBe(false)
  })

  it("calcula ticket médio", () => {
    const linhas = agruparPorProfissional(
      [os({ totalAmount: 100 }), os({ totalAmount: 200 })],
      [{ id: "u1", name: "Ana", emCampo: true }],
      SEM
    )
    expect(linhas[0].ticketMedio).toBe(150)
  })

  it("mede os dias entre abertura e conclusão", () => {
    const linhas = agruparPorProfissional(
      [
        os({ createdAt: new Date("2026-08-01T00:00:00Z"), concludedAt: new Date("2026-08-03T00:00:00Z") }),
        os({ createdAt: new Date("2026-08-01T00:00:00Z"), concludedAt: new Date("2026-08-05T00:00:00Z") }),
      ],
      [{ id: "u1", name: "Ana", emCampo: true }],
      SEM
    )
    expect(linhas[0].diasMedios).toBe(3)
  })

  it("não deixa data invertida virar tempo negativo", () => {
    // Acontece com importação e ajuste manual. Contar negativo faria a pessoa
    // parecer mais rápida do que foi.
    const linhas = agruparPorProfissional(
      [os({ createdAt: new Date("2026-08-10T00:00:00Z"), concludedAt: new Date("2026-08-02T00:00:00Z") })],
      [{ id: "u1", name: "Ana", emCampo: true }],
      SEM
    )
    expect(linhas[0].diasMedios).toBe(0)
  })

  it("faz a média só das notas que existem", () => {
    const linhas = agruparPorProfissional(
      [os({ npsScore: 10 }), os({ npsScore: 8 }), os({ npsScore: null })],
      [{ id: "u1", name: "Ana", emCampo: true }],
      SEM
    )
    expect(linhas[0].nota).toBe(9)
    // A contagem vai junto: "9,0" de duas respostas não é "9,0" de cinquenta.
    expect(linhas[0].respostas).toBe(2)
  })

  it("nota zero conta — não é 'sem avaliação'", () => {
    // 0 é a pior nota possível, e é exatamente a que o dono precisa ver.
    const linhas = agruparPorProfissional(
      [os({ npsScore: 0 }), os({ npsScore: 10 })],
      [{ id: "u1", name: "Ana", emCampo: true }],
      SEM
    )
    expect(linhas[0].nota).toBe(5)
    expect(linhas[0].respostas).toBe(2)
  })

  it("sem nenhuma avaliação, a nota é nula em vez de zero", () => {
    // Zero na coluna de nota seria lido como "péssimo" em vez de "ninguém
    // avaliou" — o oposto do que aconteceu.
    const linhas = agruparPorProfissional([os()], [{ id: "u1", name: "Ana", emCampo: true }], SEM)
    expect(linhas[0].nota).toBeNull()
    expect(linhas[0].respostas).toBe(0)
  })

  it("ordena por valor, com desempate estável", () => {
    const linhas = agruparPorProfissional(
      [os({ technicianId: "u2", totalAmount: 100 }), os({ technicianId: "u1", totalAmount: 100 })],
      equipe,
      SEM
    )
    // Mesmo valor e mesma quantidade: ordem alfabética, pra a tabela não
    // dançar de um carregamento pro outro.
    expect(linhas.map((l) => l.nome)).toEqual(["Ana", "Bruno"])
  })

  it("aguenta período sem nenhum serviço", () => {
    const linhas = agruparPorProfissional([], equipe, SEM)
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l) => l.concluidas === 0)).toBe(true)
  })
})
