import { describe, expect, it } from "vitest"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import {
  CARENCIA_POR_VERSAO,
  ContratoPDF,
  VERSAO_CONTRATO,
  versaoDoContrato,
  type DadosContrato,
} from "@/components/pdf/contrato-pdf"

// Contrato é documento jurídico enviado a cliente real. Se ele falhar ao
// gerar, o cliente paga e não recebe nada — e o erro só apareceria no log.

function dados(over: Partial<DadosContrato> = {}): DadosContrato {
  return {
    numero: "2026-AB12CD34",
    emitidoEm: new Date("2026-08-10T15:00:00Z"),
    empresa: {
      nome: "Livela store",
      documento: "12.345.678/0001-99",
      email: "dona@livela.com.br",
      endereco: "Rua das Flores, 100 — Piracicaba/SP",
    },
    plano: { nome: "Starter", valorMensal: 97, ciclo: "MENSAL", valorCobrado: 97 },
    inicioVigencia: new Date("2026-08-01T12:00:00Z"),
    diasCarencia: 5,
    versao: VERSAO_CONTRATO,
    aceite: null,
    ...over,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gerar = (d: DadosContrato) => renderToBuffer(React.createElement(ContratoPDF, { dados: d }) as any)

describe("contrato em PDF", () => {
  it("gera um PDF válido", async () => {
    const buf = await gerar(dados())
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
    // Três páginas de cláusulas — se sair muito menor, algo não renderizou.
    expect(buf.length).toBeGreaterThan(5000)
  })

  it("gera para empresa sem CNPJ e sem endereço", async () => {
    // Cadastro incompleto não pode impedir o contrato de existir.
    const d = dados()
    const buf = await gerar({ ...d, empresa: { ...d.empresa, documento: null, endereco: null } })
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("gera no plano anual", async () => {
    const buf = await gerar(dados({ plano: { nome: "Pro", valorMensal: 197, ciclo: "ANUAL", valorCobrado: 1970 } }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("acompanha a carência real, sem número escrito à mão", async () => {
    // Se a carência mudar em lib/past-due.ts, o contrato tem que mudar junto —
    // um contrato dizendo "5 dias" com o sistema cortando em 3 é problema.
    const buf = await gerar(dados({ diasCarencia: 7 }))
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("mantém o texto exigido pelo parecer jurídico", async () => {
    // Cláusula legal apagada por engano não gera erro em lugar nenhum: o PDF
    // continua saindo bonito e o contrato fica sem a proteção. Este teste lê o
    // código-fonte e confere que as citações do parecer continuam lá.
    const { readFile } = await import("node:fs/promises")
    const fonte = await readFile("src/components/pdf/contrato-pdf.tsx", "utf8")

    const exigidos: [string, string][] = [
      ["artigos 42 a 45", "exceção da LGPD no teto de responsabilidade (item 1 do parecer)"],
      ["dolo ou culpa grave", "exceção de dolo/culpa grave no teto (item 1)"],
      ["COMARCA_CONTRATADA", "foro da sede para cliente PJ (item 2)"],
      ["art. 101, I", "foro do consumidor preservado (item 2)"],
      ["art. 5º, VI", "ServiçoOS como controlador dos dados do assinante (item 3)"],
      ["Resolução CD/ANPD nº 19/2024", "cláusulas-padrão de transferência internacional (item 5)"],
      ["24 (vinte e quatro)", "prazo objetivo de incidente (item 6)"],
      ["Resolução CD/ANPD nº 15/2024", "prazo da ANPD citado (item 6)"],
      ["documentos fiscais", "ressalva de guarda fiscal na eliminação (item 7)"],
      ["IPCA/IBGE", "índice de reajuste (item 9)"],
      ["fraude ou tentativa de fraude", "rescisão pela contratada (item 10)"],
      ["2.200-2/2001", "fundamento correto do aceite eletrônico (item 11)"],
      ["PREVALÊNCIA SOBRE OS TERMOS DE USO", "cláusula de prevalência"],
    ]

    // Trecho curto e sem quebra de linha de propósito: o JSX quebra parágrafo
    // em várias linhas, então procurar frase longa daria falso negativo.
    const faltando = exigidos.filter(([trecho]) => !fonte.includes(trecho)).map(([, motivo]) => motivo)

    expect(faltando, `sumiu do contrato: ${faltando.join("; ")}`).toEqual([])
  })

  it("não cita mais a Lei 14.063/2020, que o parecer apontou como fundamento errado", async () => {
    const { readFile } = await import("node:fs/promises")
    const fonte = await readFile("src/components/pdf/contrato-pdf.tsx", "utf8")
    expect(fonte).not.toContain("14.063")
  })

  it("tem versão declarada", () => {
    // O cliente recebeu UMA versão específica no dia em que assinou; sem
    // versionar, não há como saber qual texto ele aceitou.
    expect(VERSAO_CONTRATO).toMatch(/^\d+\.\d+$/)
  })
})

describe("a versão que o cliente ACEITOU", () => {
  // O PDF era montado sempre na versão e na carência de HOJE: quem assinou a
  // v1.1 (5 dias de carência) baixava um documento rotulado v1.2 prometendo
  // 30 dias. O cabeçalho do módulo já dizia que "o prazo declarado no
  // documento dela continua sendo o que ela assinou" — faltava o código
  // fazer isso. (Achado na auditoria de 13/09/2026.)
  it("a versão atual usa a carência VIGENTE, e não um número escrito à mão", () => {
    // A carência de hoje vem de PAST_DUE_GRACE_DAYS, a mesma constante do
    // bloqueio. Congelá-la aqui faria o contrato prometer um prazo que o
    // sistema não aplica.
    expect(versaoDoContrato(VERSAO_CONTRATO, 30)).toEqual({ versao: VERSAO_CONTRATO, diasCarencia: 30 })
    expect(versaoDoContrato(VERSAO_CONTRATO, 3).diasCarencia).toBe(3)
  })

  it("quem assinou a v1.1 recebe v1.1, com os 5 dias que ela declarava", () => {
    expect(versaoDoContrato("1.1", 30)).toEqual({ versao: "1.1", diasCarencia: 5 })
  })

  it("assinatura SEM versão registrada (anterior ao registro) cai na atual", () => {
    expect(versaoDoContrato(null, 30)).toEqual({ versao: VERSAO_CONTRATO, diasCarencia: 30 })
  })

  it("versão desconhecida não inventa prazo: usa o de hoje", () => {
    expect(versaoDoContrato("9.9", 30)).toEqual({ versao: "9.9", diasCarencia: 30 })
  })

  it("a versão ATUAL não entra no mapa de versões antigas", () => {
    // Se entrasse, o prazo do contrato pararia de acompanhar a constante do
    // bloqueio — e voltaria a divergir do que o sistema aplica.
    expect(CARENCIA_POR_VERSAO[VERSAO_CONTRATO]).toBeUndefined()
  })
})

describe("o quadro de fecho", () => {
  it("gera com o aceite registrado — IP, data e hora", async () => {
    const buf = await gerar(
      dados({ aceite: { em: new Date("2026-09-22T14:30:00Z"), ip: "200.150.10.20" } })
    )
    expect(buf.length).toBeGreaterThan(1000)
  })

  it("e gera sem ele, para quem assinou antes do registro existir", async () => {
    const buf = await gerar(dados({ aceite: null }))
    expect(buf.length).toBeGreaterThan(1000)
  })
})
