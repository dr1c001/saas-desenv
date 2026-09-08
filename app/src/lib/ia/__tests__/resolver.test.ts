import { describe, expect, it } from "vitest"
import {
  comoPerguntar,
  mesmoNumero,
  normalizar,
  numeroFalado,
  resolverUnico,
} from "@/lib/ia/resolver"

// A regra de maior consequência da assistente: na dúvida, não escolhe.
// Escolher sozinho acerta quase sempre e, quando erra, conclui a OS errada ou
// apaga o cliente errado — justo as operações que não têm desfazer.

const clientes = [
  { id: "1", nome: "João Silva" },
  { id: "2", nome: "João Souza" },
  { id: "3", nome: "Maria Antônia" },
]
const nome = (c: { nome: string }) => c.nome

describe("achar um registro pelo que a pessoa falou", () => {
  it("acha o único que serve", () => {
    const r = resolverUnico("maria", clientes, nome)
    expect(r.tipo).toBe("um")
    if (r.tipo === "um") expect(r.item.id).toBe("3")
  })

  it("com dois candidatos, DEVOLVE AS OPÇÕES em vez de escolher", () => {
    // O teste central. "Conclui a do João" com dois Joões não pode virar uma
    // escolha silenciosa.
    const r = resolverUnico("joão", clientes, nome)
    expect(r.tipo).toBe("varios")
    if (r.tipo === "varios") expect(r.opcoes.map((o) => o.id)).toEqual(["1", "2"])
  })

  it("o nome exato vence o parcial", () => {
    // "João Silva" e "João Silva Júnior" cadastrados: quem falou o nome inteiro
    // e certo não pode ser obrigado a desambiguar o que não era ambíguo.
    const comJunior = [...clientes, { id: "4", nome: "João Silva Júnior" }]
    const r = resolverUnico("João Silva", comJunior, nome)
    expect(r.tipo).toBe("um")
    if (r.tipo === "um") expect(r.item.id).toBe("1")
  })

  it("dois cadastros com o mesmo nome escrito igual são ambíguos", () => {
    // Aqui nem a pessoa nem o sistema têm como saber qual. Chutar é o pior
    // caminho possível.
    const duplicado = [
      { id: "1", nome: "João Silva" },
      { id: "9", nome: "João Silva" },
    ]
    expect(resolverUnico("joão silva", duplicado, nome).tipo).toBe("varios")
  })

  it("ignora acento e caixa", () => {
    expect(resolverUnico("MARIA ANTONIA", clientes, nome).tipo).toBe("um")
    expect(resolverUnico("joao souza", clientes, nome).tipo).toBe("um")
  })

  it("ignora espaço sobrando", () => {
    expect(resolverUnico("  maria   antônia ", clientes, nome).tipo).toBe("um")
  })

  it("quem não existe não vira ninguém", () => {
    expect(resolverUnico("Pedro", clientes, nome)).toEqual({ tipo: "nenhum" })
  })

  it("busca vazia não casa com o primeiro da lista", () => {
    // Sem esta guarda, uma transcrição que veio vazia pegaria um cliente
    // qualquer — e a assistente agiria sobre ele.
    expect(resolverUnico("", clientes, nome)).toEqual({ tipo: "nenhum" })
    expect(resolverUnico("   ", clientes, nome)).toEqual({ tipo: "nenhum" })
  })

  it("lista vazia não quebra", () => {
    expect(resolverUnico("joão", [], nome)).toEqual({ tipo: "nenhum" })
  })
})

describe("o número da OS, do jeito que sai da fala", () => {
  it("aceita as formas que o reconhecimento produz", () => {
    expect(numeroFalado("24")).toBe("24")
    expect(numeroFalado("OS 24")).toBe("24")
    expect(numeroFalado("#24")).toBe("24")
    expect(numeroFalado("número 24")).toBe("24")
  })

  it("zero à esquerda é o mesmo número", () => {
    expect(numeroFalado("0024")).toBe("24")
    expect(mesmoNumero("0024", "24")).toBe(true)
    expect(mesmoNumero("OS #0024", "24")).toBe(true)
  })

  it("sem dígito nenhum, não acha nada", () => {
    // Melhor não achar do que casar com uma ordem qualquer.
    expect(numeroFalado("aquela ali")).toBeNull()
    expect(numeroFalado("")).toBeNull()
    expect(mesmoNumero("aquela", "24")).toBe(false)
  })

  it("zero continua sendo zero", () => {
    expect(numeroFalado("0")).toBe("0")
    expect(numeroFalado("000")).toBe("0")
  })

  it("números diferentes não se confundem", () => {
    expect(mesmoNumero("24", "42")).toBe(false)
  })
})

describe("o texto que manda a assistente perguntar", () => {
  it("traz as opções, para dar uma pergunta útil", () => {
    // "Não consegui identificar" não ajuda ninguém. "O João Silva ou o João
    // Souza?" resolve na hora.
    const t = comoPerguntar("cliente", ["João Silva", "João Souza"])
    expect(t).toContain("João Silva")
    expect(t).toContain("João Souza")
    expect(t).toContain("PERGUNTE")
  })

  it("manda explicitamente NÃO escolher sozinho", () => {
    expect(comoPerguntar("cliente", ["a", "b"])).toContain("Não escolha sozinho")
  })

  it("com muitas opções, corta e diz quantas ficaram", () => {
    const muitos = Array.from({ length: 12 }, (_, i) => `Cliente ${i}`)
    const t = comoPerguntar("cliente", muitos)
    expect(t).toContain("e mais 4")
    expect(t).not.toContain("Cliente 11")
  })
})

describe("normalizar", () => {
  it("tira acento, caixa e espaço", () => {
    expect(normalizar("  JOÃO   da Silva ")).toBe("joao da silva")
    expect(normalizar("Antônio")).toBe("antonio")
  })
})
