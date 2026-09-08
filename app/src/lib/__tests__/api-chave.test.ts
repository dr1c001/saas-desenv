import { describe, expect, it } from "vitest"
import {
  chaveConfere,
  chaveDoCabecalho,
  gerarChave,
  hashDaChave,
  mascarar,
  prefixoDe,
} from "@/lib/api-chave"

describe("gerar", () => {
  it("o prefixo gerado é o mesmo que se lê de volta da chave", () => {
    // Se divergirem, a busca no banco não acha a linha e TODA chave é recusada.
    const { chave, prefixo } = gerarChave()
    expect(prefixoDe(chave)).toBe(prefixo)
  })

  it("o hash gravado confere com a chave gerada", () => {
    const { chave, hash } = gerarChave()
    expect(chaveConfere(chave, hash)).toBe(true)
  })

  it("duas chaves nunca são iguais", () => {
    const chaves = new Set(Array.from({ length: 200 }, () => gerarChave().chave))
    expect(chaves.size).toBe(200)
  })

  it("prefixos também não colidem — é chave única no banco", () => {
    const prefixos = new Set(Array.from({ length: 200 }, () => gerarChave().prefixo))
    expect(prefixos.size).toBe(200)
  })

  it("a chave não aparece dentro do próprio hash", () => {
    // Proteção contra alguém trocar o hash por algo reversível sem perceber.
    const { chave, hash } = gerarChave()
    expect(hash).not.toContain(chave.split("_")[2])
    expect(hash).toHaveLength(64)
  })
})

describe("conferir", () => {
  it("chave errada não passa", () => {
    const { hash } = gerarChave()
    expect(chaveConfere(gerarChave().chave, hash)).toBe(false)
  })

  it("um caractere trocado não passa", () => {
    const { chave, hash } = gerarChave()
    const adulterada = chave.slice(0, -1) + (chave.slice(-1) === "a" ? "b" : "a")
    expect(chaveConfere(adulterada, hash)).toBe(false)
  })

  it("hash de tamanho errado não derruba nem passa", () => {
    // timingSafeEqual LANÇA quando os tamanhos diferem. Uma linha corrompida no
    // banco viraria erro 500 em vez de recusa — e 500 numa rota de autenticação
    // é a diferença entre "sua chave é inválida" e "a API caiu".
    const { chave } = gerarChave()
    expect(chaveConfere(chave, "abc")).toBe(false)
    expect(chaveConfere(chave, "")).toBe(false)
  })

  it("hash é estável para a mesma entrada", () => {
    expect(hashDaChave("sos_abc_def")).toBe(hashDaChave("sos_abc_def"))
  })
})

describe("formato", () => {
  it("recusa o que não parece chave, sem ir ao banco", () => {
    for (const ruim of [
      "",
      "abc",
      "sos_curto_x",
      "outro_123456789012_" + "a".repeat(32),
      "sos_123456789012",
      "sos_123456789012_curto",
      "sos_123456789012_" + "a".repeat(33),
      "sos_1234567890123_" + "a".repeat(32),
      "sos_123456789012_" + "a".repeat(32) + "_extra",
    ]) {
      expect(prefixoDe(ruim), ruim).toBeNull()
    }
  })

  it("aceita a chave bem formada", () => {
    expect(prefixoDe("sos_123456789012_" + "a".repeat(32))).toBe("123456789012")
  })
})

describe("cabeçalho", () => {
  it("lê o Bearer", () => {
    expect(chaveDoCabecalho("Bearer sos_abc")).toBe("sos_abc")
    expect(chaveDoCabecalho("bearer sos_abc")).toBe("sos_abc")
  })

  it("recusa outros esquemas e o vazio", () => {
    expect(chaveDoCabecalho(null)).toBeNull()
    expect(chaveDoCabecalho("")).toBeNull()
    expect(chaveDoCabecalho("Basic abc")).toBeNull()
    expect(chaveDoCabecalho("Bearer")).toBeNull()
    expect(chaveDoCabecalho("sos_abc")).toBeNull()
  })
})

describe("mostrar na tela", () => {
  it("mascarada mostra o prefixo e esconde o segredo", () => {
    const { chave, prefixo } = gerarChave()
    const mascarada = mascarar(prefixo)
    expect(mascarada).toContain(prefixo)
    expect(mascarada).not.toContain(chave.split("_")[2])
  })
})
