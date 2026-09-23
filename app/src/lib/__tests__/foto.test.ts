import { describe, expect, it } from "vitest"
import {
  caminhoDaFoto,
  caminhoPertenceAoTenant,
  extensaoDe,
  MAX_BYTES,
  MAX_FOTOS_POR_OS,
  nomeExibicao,
  validarFoto,
} from "@/lib/foto"

const jpeg = (bytes = 300_000) => ({ type: "image/jpeg", size: bytes })

describe("aceitação do arquivo", () => {
  it("aceita foto comum de celular já comprimida", () => {
    expect(validarFoto(jpeg(), 0)).toBeNull()
  })

  it("aceita png e webp", () => {
    expect(validarFoto({ type: "image/png", size: 1000 }, 0)).toBeNull()
    expect(validarFoto({ type: "image/webp", size: 1000 }, 0)).toBeNull()
  })

  it("recusa o que não é imagem", () => {
    // O campo aceita qualquer coisa se o usuário insistir no seletor de
    // arquivos; a recusa tem que ser do servidor, não do accept do input.
    expect(validarFoto({ type: "application/pdf", size: 1000 }, 0)).toBe("tipoNaoAceito")
    expect(validarFoto({ type: "video/mp4", size: 1000 }, 0)).toBe("tipoNaoAceito")
  })

  it("recusa arquivo vazio", () => {
    expect(validarFoto(jpeg(0), 0)).toBe("arquivoVazio")
  })

  it("recusa acima do teto por arquivo", () => {
    expect(validarFoto(jpeg(MAX_BYTES + 1), 0)).toBe("muitoGrande")
    expect(validarFoto(jpeg(MAX_BYTES), 0)).toBeNull()
  })

  it("recusa quando a OS já está no limite", () => {
    // Checado ANTES do tipo e do tamanho: se a OS está cheia, o motivo certo
    // é o limite, não "arquivo grande demais".
    expect(validarFoto(jpeg(), MAX_FOTOS_POR_OS)).toBe("limitePorOs")
    expect(validarFoto({ type: "application/pdf", size: 0 }, MAX_FOTOS_POR_OS)).toBe("limitePorOs")
    expect(validarFoto(jpeg(), MAX_FOTOS_POR_OS - 1)).toBeNull()
  })
})

describe("caminho no armazenamento", () => {
  it("começa pelo tenant, pra deixar o isolamento visível na estrutura", () => {
    expect(caminhoDaFoto("t1", "os9", "f5", "image/jpeg")).toBe("t1/os9/f5.jpg")
  })

  it("usa a extensão do tipo real, não do nome enviado", () => {
    expect(extensaoDe("image/png")).toBe("png")
    expect(extensaoDe("image/webp")).toBe("webp")
    expect(extensaoDe("image/jpeg")).toBe("jpg")
    // Tipo inesperado vira jpg em vez de quebrar: o arquivo já passou pela
    // validação, então aqui só falta dar um nome a ele.
    expect(extensaoDe("image/qualquer")).toBe("jpg")
  })

  it("reconhece caminho de outra empresa", () => {
    // Segunda barreira: a consulta ao banco ja filtra por tenant, mas caminho
    // e string vinda de linha de banco — e linha de banco pode ter sido
    // escrita errado por um bug futuro.
    expect(caminhoPertenceAoTenant("t1/os9/f5.jpg", "t1")).toBe(true)
    expect(caminhoPertenceAoTenant("t2/os9/f5.jpg", "t1")).toBe(false)
  })

  it("não se deixa enganar por prefixo parecido", () => {
    // "t1" nao pode casar com um tenant chamado "t10".
    expect(caminhoPertenceAoTenant("t10/os9/f5.jpg", "t1")).toBe(false)
  })
})

describe("nome de exibição", () => {
  it("numera a partir de 1, com zero à esquerda", () => {
    expect(nomeExibicao(0, "image/jpeg")).toBe("foto-01.jpg")
    expect(nomeExibicao(9, "image/png")).toBe("foto-10.png")
  })
})
