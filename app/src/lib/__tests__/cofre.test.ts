import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { cifrar, cofreConfigurado, decifrar, decifrarTexto } from "@/lib/cofre"

// O que está aqui protege o CERTIFICADO DIGITAL das empresas clientes — a
// identidade jurídica delas. Um erro neste módulo não dá erro visível: dá um
// arquivo ilegível descoberto no dia em que alguém precisa emitir uma nota, ou
// pior, um certificado gravado sem cifra nenhuma.

const CHAVE_ORIGINAL = process.env.CERT_ENCRYPTION_KEY

beforeAll(() => {
  process.env.CERT_ENCRYPTION_KEY = "chave-de-teste-com-mais-de-32-caracteres-aqui"
})

afterAll(() => {
  if (CHAVE_ORIGINAL === undefined) delete process.env.CERT_ENCRYPTION_KEY
  else process.env.CERT_ENCRYPTION_KEY = CHAVE_ORIGINAL
})

describe("ida e volta", () => {
  it("texto volta igual", () => {
    const senha = "SenhaDoCertificado#2026"
    expect(decifrarTexto(cifrar(senha))).toBe(senha)
  })

  it("arquivo binário volta byte a byte", () => {
    // O .pfx é binário. Passar por string corromperia silenciosamente.
    const arquivo = Buffer.from([0x30, 0x82, 0x00, 0xff, 0x0a, 0x0d, 0x1a])
    expect(decifrar(cifrar(arquivo)).equals(arquivo)).toBe(true)
  })

  it("arquivo grande volta inteiro", () => {
    const grande = Buffer.alloc(64 * 1024, 7)
    expect(decifrar(cifrar(grande)).equals(grande)).toBe(true)
  })
})

describe("o que fica guardado", () => {
  it("NÃO contém o conteúdo original", () => {
    // A garantia central: um dump do banco não entrega nada.
    const senha = "SenhaMuitoSecreta123"
    const guardado = cifrar(senha)
    expect(guardado).not.toContain(senha)
    expect(Buffer.from(guardado, "utf8").includes(Buffer.from(senha))).toBe(false)
  })

  it("cifrar a MESMA coisa duas vezes dá resultados diferentes", () => {
    // IV sorteado a cada chamada. Sem isso, dois tenants com a mesma senha
    // teriam o mesmo texto cifrado — e quem olhasse o banco saberia disso.
    expect(cifrar("igual")).not.toBe(cifrar("igual"))
  })

  it("as duas versões decifram para o mesmo valor", () => {
    expect(decifrarTexto(cifrar("igual"))).toBe(decifrarTexto(cifrar("igual")))
  })
})

describe("adulteração e chave errada", () => {
  it("mexer no conteúdo cifrado faz FALHAR, não devolver lixo", () => {
    // AES-GCM autentica além de cifrar. Devolver lixo silenciosamente seria
    // pior: o erro apareceria adiante, sem relação com a causa.
    const g = cifrar("original")
    const [iv, tag] = g.split(".")
    const adulterado = [iv, tag, Buffer.from("outracoisa").toString("base64")].join(".")
    expect(() => decifrar(adulterado)).toThrow()
  })

  it("formato inesperado falha com mensagem clara", () => {
    expect(() => decifrar("qualquer-coisa")).toThrow(/formato inesperado/i)
  })

  it("chave trocada não decifra o que foi cifrado com a anterior", () => {
    const g = cifrar("segredo")
    const anterior = process.env.CERT_ENCRYPTION_KEY
    process.env.CERT_ENCRYPTION_KEY = "outra-chave-completamente-diferente-com-32+"
    expect(() => decifrar(g)).toThrow()
    process.env.CERT_ENCRYPTION_KEY = anterior
  })
})

describe("chave ausente ou fraca", () => {
  it("recusa funcionar sem chave, em vez de guardar em claro", () => {
    // O modo de falha perigoso seria "sem chave, grava sem cifra".
    const anterior = process.env.CERT_ENCRYPTION_KEY
    delete process.env.CERT_ENCRYPTION_KEY
    expect(() => cifrar("x")).toThrow(/CERT_ENCRYPTION_KEY/)
    expect(cofreConfigurado()).toBe(false)
    process.env.CERT_ENCRYPTION_KEY = anterior
  })

  it("recusa chave curta demais", () => {
    const anterior = process.env.CERT_ENCRYPTION_KEY
    process.env.CERT_ENCRYPTION_KEY = "curta"
    expect(() => cifrar("x")).toThrow(/CERT_ENCRYPTION_KEY/)
    expect(cofreConfigurado()).toBe(false)
    process.env.CERT_ENCRYPTION_KEY = anterior
  })

  it("com chave boa, diz que está configurado", () => {
    expect(cofreConfigurado()).toBe(true)
  })
})
