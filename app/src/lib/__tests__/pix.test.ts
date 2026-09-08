import { describe, expect, it } from "vitest"
import {
  campo,
  chaveValida,
  cobrancaPix,
  codigoIntegro,
  crc16,
  gerarCodigoPix,
  limparTexto,
  normalizarChave,
} from "@/lib/pix"

describe("CRC — a parte que faz o banco aceitar ou recusar", () => {
  it("bate com a constante oficial do algoritmo", () => {
    // Verificação canônica do CRC-16/CCITT-FALSE: o CRC de "123456789" é
    // 0x29B1. Esta constante é do próprio algoritmo, não de um exemplo de PIX
    // copiado de algum lugar — por isso vale mais que qualquer outro teste
    // aqui. CRC errado faz o app do banco RECUSAR o pagamento, e a gente só
    // descobriria com um cliente real tentando pagar.
    expect(crc16("123456789")).toBe(0x29b1)
  })

  it("string vazia devolve o valor inicial", () => {
    expect(crc16("")).toBe(0xffff)
  })

  it("muda quando um único caractere muda", () => {
    expect(crc16("PIX")).not.toBe(crc16("PIY"))
  })
})

describe("campo do BR Code", () => {
  it("monta id + tamanho de 2 dígitos + valor", () => {
    expect(campo("00", "01")).toBe("000201")
    expect(campo("59", "ACME")).toBe("5904ACME")
  })

  it("preenche o tamanho com zero à esquerda", () => {
    expect(campo("01", "a")).toBe("0101a")
  })
})

describe("limpeza de texto", () => {
  it("tira acento", () => {
    // Vários apps de banco engasgam com acento. "Manutenção" recusada é pior
    // que "Manutencao" feia.
    expect(limparTexto("Manutenção Predial", 25)).toBe("Manutencao Predial")
    expect(limparTexto("SERVIÇOOS", 25)).toBe("SERVICOOS")
  })

  it("corta no tamanho máximo do padrão", () => {
    expect(limparTexto("A".repeat(40), 25)).toHaveLength(25)
  })

  it("normaliza espaços", () => {
    expect(limparTexto("  Duas   palavras  ", 25)).toBe("Duas palavras")
  })
})

describe("chave PIX", () => {
  it("aceita CPF e CNPJ só com dígitos", () => {
    expect(normalizarChave("123.456.789-09", "CPF")).toBe("12345678909")
    expect(chaveValida("123.456.789-09", "CPF")).toBe(true)
    expect(chaveValida("12.345.678/0001-99", "CNPJ")).toBe(true)
  })

  it("põe telefone no formato internacional", () => {
    expect(normalizarChave("(19) 99280-2772", "TELEFONE")).toBe("+5519992802772")
    // Já com o 55 não duplica.
    expect(normalizarChave("5519992802772", "TELEFONE")).toBe("+5519992802772")
    expect(chaveValida("(19) 99280-2772", "TELEFONE")).toBe(true)
  })

  it("aceita e-mail em minúsculo", () => {
    expect(normalizarChave("Contato@Empresa.COM.BR", "EMAIL")).toBe("contato@empresa.com.br")
    expect(chaveValida("contato@empresa.com.br", "EMAIL")).toBe(true)
  })

  it("aceita chave aleatória no formato UUID", () => {
    expect(chaveValida("123e4567-e12b-12d1-a456-426655440000", "ALEATORIA")).toBe(true)
  })

  it("recusa o que está errado", () => {
    expect(chaveValida("123", "CPF")).toBe(false)
    expect(chaveValida("12345678909", "CNPJ")).toBe(false)
    expect(chaveValida("sem-arroba", "EMAIL")).toBe(false)
    expect(chaveValida("nao-e-uuid", "ALEATORIA")).toBe(false)
  })
})

describe("código copia e cola", () => {
  const base = {
    chave: "12345678909",
    tipoChave: "CPF" as const,
    recebedor: "Limpeza Ltda",
    cidade: "Piracicaba",
  }

  it("gera um código íntegro", () => {
    // Se o CRC fosse calculado sobre a parte errada da string, isto falharia
    // aqui em vez de no celular do cliente.
    expect(codigoIntegro(gerarCodigoPix({ ...base, valor: 450 }))).toBe(true)
  })

  it("começa com o indicador de formato e traz o domínio do BCB", () => {
    const c = gerarCodigoPix({ ...base, valor: 450 })
    expect(c.startsWith("000201")).toBe(true)
    expect(c).toContain("br.gov.bcb.pix")
  })

  it("leva o valor com duas casas", () => {
    expect(gerarCodigoPix({ ...base, valor: 450 })).toContain("5406450.00")
    expect(gerarCodigoPix({ ...base, valor: 1234.5 })).toContain("54071234.50")
  })

  it("omite o valor quando não há — o pagador digita", () => {
    const c = gerarCodigoPix({ ...base, valor: null })
    expect(codigoIntegro(c)).toBe(true)
    expect(c).not.toContain("5406")
  })

  it("usa *** quando não há identificador", () => {
    // 62 = dados adicionais, tamanho 07, contendo o subcampo 05 de tamanho 03
    // com valor "***" — que é o que o padrão define pra "sem identificador".
    expect(gerarCodigoPix({ ...base, valor: 10 })).toContain("62070503***")
  })

  it("leva o identificador da OS, sem pontuação", () => {
    // O identificador aparece no extrato de quem recebe — é como a empresa
    // liga o dinheiro que entrou à OS que o gerou.
    const c = gerarCodigoPix({ ...base, valor: 10, identificador: "OS2026-0042" })
    expect(c).toContain("OS20260042")
    expect(codigoIntegro(c)).toBe(true)
  })

  it("continua íntegro com acento no nome e na cidade", () => {
    // O caso que quebraria em produção: nome de empresa brasileira tem acento.
    const c = gerarCodigoPix({
      ...base, recebedor: "Manutenção Predial São José", cidade: "São Paulo", valor: 99.9,
    })
    expect(codigoIntegro(c)).toBe(true)
    expect(c).toContain("Manutencao Predial Sao")
    expect(c).toContain("Sao Paulo")
  })

  it("não estoura os limites de tamanho do padrão", () => {
    const c = gerarCodigoPix({
      ...base,
      recebedor: "Nome de empresa muito comprido que passa do limite",
      cidade: "Cidade com nome enorme demais",
      valor: 1,
    })
    expect(codigoIntegro(c)).toBe(true)
    // 59 = recebedor (25), 60 = cidade (15)
    expect(c).toMatch(/5925/)
    expect(c).toMatch(/6015/)
  })

  it("detecta código adulterado", () => {
    const c = gerarCodigoPix({ ...base, valor: 450 })
    const adulterado = c.replace("450.00", "950.00")
    expect(codigoIntegro(adulterado)).toBe(false)
  })
})

describe("cobrança a partir do cadastro da empresa", () => {
  const completo = {
    pixKey: "12345678909",
    pixKeyType: "CPF",
    pixReceiver: "Limpeza Ltda",
    pixCity: "Piracicaba",
  }

  it("gera quando está tudo configurado", () => {
    const c = cobrancaPix(completo, 200, "OS2026-0007")
    expect(c).not.toBeNull()
    expect(codigoIntegro(c!.codigo)).toBe(true)
    // Chave e recebedor saem prontos pra tela e pro papel.
    expect(c!.chave).toBe("12345678909")
    expect(c!.recebedor).toBe("Limpeza Ltda")
  })

  it("devolve null quando falta qualquer parte", () => {
    // Cada campo ausente tem que desligar a cobrança — meio código não existe.
    expect(cobrancaPix({ ...completo, pixKey: null }, 200)).toBeNull()
    expect(cobrancaPix({ ...completo, pixKeyType: null }, 200)).toBeNull()
    expect(cobrancaPix({ ...completo, pixReceiver: null }, 200)).toBeNull()
    expect(cobrancaPix({ ...completo, pixCity: null }, 200)).toBeNull()
  })

  it("devolve null quando o tipo salvo não existe", () => {
    // Defesa contra dado velho ou adulterado no banco: nada de gerar código
    // com um tipo que ninguém sabe normalizar.
    expect(cobrancaPix({ ...completo, pixKeyType: "PIXZINHO" }, 200)).toBeNull()
  })

  it("devolve null quando a chave não bate com o tipo", () => {
    expect(cobrancaPix({ ...completo, pixKeyType: "EMAIL" }, 200)).toBeNull()
  })

  it("não estoura quando não há valor", () => {
    const c = cobrancaPix(completo, null)
    expect(c).not.toBeNull()
    expect(codigoIntegro(c!.codigo)).toBe(true)
  })
})
