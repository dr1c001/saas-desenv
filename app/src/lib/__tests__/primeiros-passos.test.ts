import { describe, expect, it } from "vitest"
import { primeirosPassos, type RetratoDaEmpresa } from "@/lib/primeiros-passos"

const vazia: RetratoDaEmpresa = {
  temTelefone: false,
  temDocumento: false,
  temLogo: false,
  clientes: 0,
  ordens: 0,
  temPix: false,
  temTermos: false,
  dispensado: false,
}

const completa: RetratoDaEmpresa = {
  temTelefone: true,
  temDocumento: true,
  temLogo: true,
  clientes: 12,
  ordens: 30,
  temPix: true,
  temTermos: true,
  dispensado: false,
}

const feito = (r: RetratoDaEmpresa, chave: string) =>
  primeirosPassos(r).passos.find((p) => p.chave === chave)!.feito

describe("primeiros passos", () => {
  it("empresa recém-criada vê tudo por fazer", () => {
    const p = primeirosPassos(vazia)
    expect(p.visivel).toBe(true)
    expect(p.concluidos).toBe(0)
    expect(p.total).toBe(6)
    expect(p.proximo).toBe("dadosDaEmpresa")
  })

  it("empresa que já roda não vê o painel", () => {
    // O painel some sozinho por consequência da detecção — não existe caso
    // especial pra "cliente antigo", e ninguém veterano é convidado a criar
    // sua primeira OS.
    const p = primeirosPassos(completa)
    expect(p.visivel).toBe(false)
    expect(p.concluidos).toBe(6)
    expect(p.proximo).toBeNull()
  })

  it("some quando a empresa fecha na mão, mesmo com passo pendente", () => {
    expect(primeirosPassos({ ...vazia, dispensado: true }).visivel).toBe(false)
  })

  it("dados da empresa exigem telefone E documento", () => {
    // Meio preenchido não é preenchido: os dois saem impressos no documento.
    expect(feito({ ...vazia, temTelefone: true }, "dadosDaEmpresa")).toBe(false)
    expect(feito({ ...vazia, temDocumento: true }, "dadosDaEmpresa")).toBe(false)
    expect(feito({ ...vazia, temTelefone: true, temDocumento: true }, "dadosDaEmpresa")).toBe(true)
  })

  it("um cliente já basta pra fechar o passo de clientes", () => {
    expect(feito({ ...vazia, clientes: 1 }, "clientes")).toBe(true)
  })

  it("uma OS já basta pra fechar o passo da primeira OS", () => {
    expect(feito({ ...vazia, ordens: 1 }, "primeiraOs")).toBe(true)
  })

  it("o próximo passo pula o que já foi feito", () => {
    const r = { ...vazia, temTelefone: true, temDocumento: true, temLogo: true }
    expect(primeirosPassos(r).proximo).toBe("clientes")
  })

  it("passo pulado no meio continua aparecendo como pendente", () => {
    // Quem configurou o PIX antes de cadastrar cliente não deve ver o PIX
    // pedido de novo — mas o cliente continua pendente.
    const r = { ...vazia, temPix: true }
    const p = primeirosPassos(r)
    expect(feito(r, "pix")).toBe(true)
    expect(p.proximo).toBe("dadosDaEmpresa")
    expect(p.concluidos).toBe(1)
    expect(p.visivel).toBe(true)
  })

  it("todo passo aponta pra um destino", () => {
    // Passo sem link é passo que a pessoa lê e não sabe onde cumprir.
    for (const passo of primeirosPassos(vazia).passos) {
      expect(passo.href.startsWith("/")).toBe(true)
    }
  })

  it("a ordem dos passos é estável", () => {
    // A tela numera os passos; se a ordem dançasse entre carregamentos, o
    // "passo 3" de hoje seria outro amanhã.
    expect(primeirosPassos(vazia).passos.map((p) => p.chave)).toEqual([
      "dadosDaEmpresa",
      "logo",
      "clientes",
      "primeiraOs",
      "pix",
      "termos",
    ])
  })
})
