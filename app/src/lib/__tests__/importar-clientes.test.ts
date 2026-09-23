import { describe, expect, it } from "vitest"
import {
  analisarPlanilha,
  chavesDeDuplicidade,
  ImportacaoInvalida,
  mapearColunas,
  MAX_LINHAS,
  normalizar,
  soDigitos,
  type ClienteImportado,
} from "@/lib/importar-clientes"

const CABECALHO = ["Nome", "CPF/CNPJ", "E-mail", "Telefone", "Cidade"]
const linha = (...c: string[]) => c

describe("normalizar cabeçalho", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(normalizar("Endereço")).toBe("endereco")
    expect(normalizar("CPF / CNPJ")).toBe("cpfcnpj")
    expect(normalizar("  Razão Social  ")).toBe("razaosocial")
    expect(normalizar("E-mail")).toBe("email")
  })
})

describe("mapeamento de colunas", () => {
  it("reconhece os nomes que o cliente realmente usa", () => {
    const mapa = mapearColunas(["Razão Social", "CNPJ", "Fone", "Celular", "Município", "UF"])
    expect(mapa.name).toBe(0)
    expect(mapa.document).toBe(1)
    expect(mapa.phone).toBe(2)
    expect(mapa.whatsapp).toBe(3)
    expect(mapa.city).toBe(4)
    expect(mapa.state).toBe(5)
  })

  it("reconhece cabeçalho em inglês", () => {
    const mapa = mapearColunas(["Name", "Email", "Phone", "City"])
    expect(mapa.name).toBe(0)
    expect(mapa.email).toBe(1)
  })

  it("mantém a primeira coluna quando há duas com o mesmo papel", () => {
    // "Telefone" e "Telefone 2": a segunda não pode sobrescrever a primeira,
    // senão o número principal é o que se perde.
    const mapa = mapearColunas(["Nome", "Telefone", "Tel"])
    expect(mapa.phone).toBe(1)
  })

  it("ignora colunas que não reconhece", () => {
    const mapa = mapearColunas(["Nome", "Vendedor responsável", "Cor favorita"])
    expect(mapa.name).toBe(0)
    expect(Object.keys(mapa)).toEqual(["name"])
  })
})

describe("análise da planilha", () => {
  it("importa uma linha completa", () => {
    const r = analisarPlanilha([
      CABECALHO,
      linha("José da Silva", "123.456.789-09", "jose@x.com.br", "11987654321", "Piracicaba"),
    ])
    expect(r.erros).toEqual([])
    expect(r.clientes).toHaveLength(1)
    expect(r.clientes[0]).toMatchObject({
      name: "José da Silva",
      document: "123.456.789-09",
      email: "jose@x.com.br",
      city: "Piracicaba",
      status: "ACTIVE",
    })
  })

  it("recusa a planilha inteira quando não há coluna de nome", () => {
    // Sinal de planilha sem cabeçalho. Se seguisse em frente, a primeira linha
    // de dados seria consumida como título e um cliente sumiria calado.
    expect(() => analisarPlanilha([["João", "11999"], ["Maria", "11888"]])).toThrow(
      expect.objectContaining({ motivo: "semColunaNome" })
    )
  })

  it("recusa planilha só com cabeçalho", () => {
    expect(() => analisarPlanilha([CABECALHO])).toThrow(
      expect.objectContaining({ motivo: "semLinhas" })
    )
  })

  it("recusa acima do limite", () => {
    const muitas = [CABECALHO, ...Array.from({ length: MAX_LINHAS + 1 }, (_, i) => linha(`C ${i}`))]
    expect(() => analisarPlanilha(muitas)).toThrow(
      expect.objectContaining({ motivo: "excedeLimite" })
    )
  })

  it("pula a linha sem nome e continua nas outras", () => {
    // Uma linha ruim não pode derrubar as outras 799.
    const r = analisarPlanilha([CABECALHO, linha("", "1", "a@x.com"), linha("Ana Souza")])
    expect(r.clientes).toHaveLength(1)
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0].motivo).toBe("nomeInvalido")
  })

  it("numera a linha como o usuário vê no Excel", () => {
    // Cabeçalho é a 1, primeiro dado é a 2. Dizer "linha 1" pro que está na 2
    // transforma a correção num quebra-cabeça.
    const r = analisarPlanilha([CABECALHO, linha("Ana"), linha("")])
    expect(r.erros[0].linha).toBe(3)
  })

  it("importa o cliente e avisa quando o e-mail é inválido", () => {
    // Perder o cliente inteiro por um e-mail com erro de digitação é pior que
    // importar sem o e-mail e dizer qual linha conferir.
    const r = analisarPlanilha([CABECALHO, linha("Ana Souza", "", "ana@", "11999")])
    expect(r.clientes).toHaveLength(1)
    expect(r.clientes[0].email).toBeNull()
    expect(r.avisos[0]).toMatchObject({ motivo: "emailIgnorado", detalhe: "ana@" })
  })

  it("entende status em português e cai pra ACTIVE no desconhecido", () => {
    const r = analisarPlanilha([
      ["Nome", "Situação"],
      linha("Ana Souza", "Inativo"),
      linha("Bruno Lima", "Inadimplente"),
      linha("Carla Dias", "sei lá"),
    ])
    expect(r.clientes.map((c) => c.status)).toEqual(["INACTIVE", "DEFAULTER", "ACTIVE"])
    expect(r.avisos.some((a) => a.motivo === "statusDesconhecido")).toBe(true)
  })

  it("descarta duplicado por documento dentro do arquivo", () => {
    const r = analisarPlanilha([
      CABECALHO,
      linha("José da Silva", "123.456.789-09"),
      linha("J. da Silva", "12345678909"), // mesmo CPF, formatado diferente
    ])
    expect(r.clientes).toHaveLength(1)
    expect(r.duplicadosNoArquivo).toBe(1)
  })

  it("descarta duplicado por e-mail, ignorando caixa", () => {
    const r = analisarPlanilha([
      CABECALHO,
      linha("Ana", "", "ANA@X.COM"),
      linha("Ana Souza", "", "ana@x.com"),
    ])
    expect(r.clientes).toHaveLength(1)
  })

  it("NÃO trata nomes iguais como duplicado", () => {
    // "João Silva" repetido é normal. Usar nome como chave descartaria
    // clientes de verdade sem o usuário entender o motivo.
    const r = analisarPlanilha([CABECALHO, linha("João Silva"), linha("João Silva")])
    expect(r.clientes).toHaveLength(2)
    expect(r.duplicadosNoArquivo).toBe(0)
  })

  it("não usa documento curto demais como chave", () => {
    // Planilha com a coluna "documento" preenchida com "1", "2", "3" (um
    // contador) não pode fazer todo mundo virar duplicado um do outro.
    const r = analisarPlanilha([CABECALHO, linha("Ana", "1"), linha("Bruno", "2")])
    expect(r.clientes).toHaveLength(2)
  })

  it("remove espaços em volta dos valores", () => {
    const r = analisarPlanilha([CABECALHO, linha("  Ana Souza  ", " 123 ")])
    expect(r.clientes[0].name).toBe("Ana Souza")
  })

  it("aceita linha mais curta que o cabeçalho", () => {
    // Excel omite as células vazias do fim da linha.
    const r = analisarPlanilha([CABECALHO, linha("Ana Souza")])
    expect(r.clientes[0].city).toBeNull()
  })
})

describe("chave de duplicidade", () => {
  const base: ClienteImportado = {
    name: "X", document: null, email: null, phone: null, whatsapp: null, status: "ACTIVE",
    street: null, number: null, complement: null, district: null, city: null, state: null, zipCode: null,
  }

  it("normaliza o documento antes de comparar", () => {
    expect(chavesDeDuplicidade({ ...base, document: "123.456.789-09" })).toEqual(["doc:12345678909"])
  })

  it("não gera chave quando não há documento nem e-mail", () => {
    // Sem chave, não dá pra afirmar que é o mesmo cliente — importa e deixa o
    // usuário decidir depois.
    expect(chavesDeDuplicidade(base)).toEqual([])
  })

  it("soDigitos limpa a formatação", () => {
    expect(soDigitos("12.345.678/0001-99")).toBe("12345678000199")
  })
})

describe("erro tipado", () => {
  it("expõe o motivo pra tradução", () => {
    const erro = new ImportacaoInvalida("semColunaNome")
    expect(erro).toBeInstanceOf(Error)
    expect(erro.motivo).toBe("semColunaNome")
  })
})

describe("cobertura das traduções", () => {
  // Motivo sem tradução não quebra o build nem o teste de tipo: quebra na
  // tela, na frente do cliente, no exato momento em que ele já errou alguma
  // coisa na planilha e mais precisa da explicação.
  const MOTIVOS_FALHA = [
    // lib/planilha.ts — MotivoInvalida
    "formatoNaoSuportado", "arquivoVazio", "arquivoCorrompido",
    "xlsProtegidoOuAntigo", "semAbas",
    // este módulo — ImportacaoInvalida
    "semCabecalho", "semColunaNome", "excedeLimite", "semLinhas",
    // actions/clients.ts
    "semPermissao",
  ]
  const MOTIVOS_OCORRENCIA = [
    "nomeInvalido", "emailIgnorado", "statusDesconhecido", "duplicadoNoArquivo",
  ]

  for (const idioma of ["pt", "en"]) {
    it(`${idioma}: toda falha e toda ocorrência têm texto`, async () => {
      const { readFile } = await import("node:fs/promises")
      const msgs = JSON.parse(await readFile(`messages/${idioma}.json`, "utf8"))
      const bloco = msgs.clients.import

      const faltando = [
        ...MOTIVOS_FALHA.filter((m) => !bloco.reasons?.[m]).map((m) => `reasons.${m}`),
        ...MOTIVOS_OCORRENCIA.filter((m) => !bloco.occurrences?.[m]).map((m) => `occurrences.${m}`),
      ]

      expect(faltando, `sem tradução em ${idioma}: ${faltando.join(", ")}`).toEqual([])
    })

    it(`${idioma}: o modelo baixado tem título e exemplo de cada coluna`, async () => {
      // Se o cabeçalho do modelo divergir dos sinônimos, o arquivo que nós
      // mesmos entregamos deixa de ser importável.
      const { readFile } = await import("node:fs/promises")
      const msgs = JSON.parse(await readFile(`messages/${idioma}.json`, "utf8"))
      const { templateColumns, templateExample } = msgs.clients.import

      expect(Object.keys(templateColumns).sort()).toEqual(Object.keys(templateExample).sort())

      const naoReconhecidos = Object.values(templateColumns as Record<string, string>).filter(
        (titulo) => Object.keys(mapearColunas([titulo])).length === 0
      )
      expect(naoReconhecidos, `títulos do modelo que o mapeador não entende: ${naoReconhecidos}`).toEqual([])
    })
  }
})
