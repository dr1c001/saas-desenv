import { describe, expect, it } from "vitest"
import { ACOES, type Acao } from "@/lib/acoes"
import {
  ferramentaChamada,
  ferramentasPara,
  FERRAMENTAS,
  fraseDeConfirmacao,
  precisaConfirmar,
} from "@/lib/ia/ferramentas"

// Estes testes guardam a única coisa que não pode ceder: a assistente não pode
// fazer, por voz, nada que a pessoa não pudesse fazer clicando — e o que não se
// desfaz não sai sem alguém ver antes.

describe("o que não se desfaz sempre passa por confirmação", () => {
  it("toda ferramenta irreversível exige confirmação", () => {
    // O teste que importa. Reconhecimento de fala erra, e erra mais em obra.
    // "Cancela a última" mal ouvido, executado direto, é a OS errada apagada.
    const passariam = FERRAMENTAS.filter((f) => f.risco === "irreversivel" && !precisaConfirmar(f))
    expect(passariam.map((f) => f.nome)).toEqual([])
  })

  it("emitir nota fiscal é irreversível", () => {
    // Emitir NFS-e é ato perante a prefeitura, em nome da empresa. Se algum dia
    // alguém reclassificar isto como "escrita" para tirar um clique do caminho,
    // este teste quebra e obriga a conversa a acontecer.
    const f = ferramentaChamada("emitir_nota_fiscal")!
    expect(f.risco).toBe("irreversivel")
    expect(precisaConfirmar(f)).toBe(true)
  })

  it("apagar OS e apagar cliente são irreversíveis", () => {
    expect(ferramentaChamada("excluir_ordem")!.risco).toBe("irreversivel")
    expect(ferramentaChamada("excluir_cliente")!.risco).toBe("irreversivel")
  })

  it("ler nunca pede confirmação", () => {
    // Confirmar leitura treinaria a pessoa a clicar "sim" sem ler — e aí a
    // confirmação que importa também vira reflexo.
    for (const f of FERRAMENTAS.filter((f) => f.risco === "leitura")) {
      expect(precisaConfirmar(f), f.nome).toBe(false)
    }
  })

  it("ajuste de estoque confirma, mesmo sendo escrita", () => {
    // AJUSTE DEFINE o saldo. Entender "ajusta pra oito" como oito de entrada
    // dá números diferentes, e ninguém percebe até o inventário seguinte.
    expect(precisaConfirmar(ferramentaChamada("movimentar_estoque")!)).toBe(true)
  })
})

describe("a frase que a pessoa lê antes de confirmar", () => {
  it("mostra o número da OS, não um id", () => {
    const f = fraseDeConfirmacao("excluir_ordem", { numero: "0024" })
    expect(f).toContain("0024")
    expect(f.toLowerCase()).toContain("apagar")
  })

  it("distingue concluir de concluir E FATURAR", () => {
    // A diferença entre as duas é dinheiro entrando no financeiro. Uma
    // confirmação que não distinguisse as duas seria pior que nenhuma.
    const so = fraseDeConfirmacao("concluir_ordem", { numero: "1", faturar_agora: false })
    const fat = fraseDeConfirmacao("concluir_ordem", { numero: "1", faturar_agora: true })
    expect(so).not.toEqual(fat)
    expect(fat.toUpperCase()).toContain("FATURAR")
  })

  it("no ajuste, diz que DEFINE o saldo", () => {
    const f = fraseDeConfirmacao("movimentar_estoque", {
      peca: "Filtro",
      tipo: "AJUSTE",
      quantidade: 8,
    })
    expect(f).toContain("DEFINIR")
    expect(f).toContain("Filtro")
  })

  it("toda ferramenta que confirma tem frase própria", () => {
    // Sem isto, uma ferramenta nova cairia no texto genérico "Executar
    // excluir_cliente", que a pessoa não tem como conferir.
    const genericas = FERRAMENTAS.filter(precisaConfirmar).filter((f) =>
      fraseDeConfirmacao(f.nome, {}).startsWith("Executar ")
    )
    expect(genericas.map((f) => f.nome)).toEqual([])
  })
})

describe("a assistente não dá poder que a pessoa não tem", () => {
  it("técnico sem permissão de concluir não recebe a ferramenta", () => {
    const semConcluir = ACOES.filter((a) => a !== "os.concluir")
    const nomes = ferramentasPara(false, semConcluir).map((f) => f.nome)
    expect(nomes).not.toContain("concluir_ordem")
    expect(nomes).toContain("criar_ordem")
  })

  it("técnico não recebe nenhuma ferramenta de administrador", () => {
    const nomes = ferramentasPara(false, ACOES).map((f) => f.nome)
    expect(nomes).not.toContain("emitir_nota_fiscal")
    expect(nomes).not.toContain("excluir_cliente")
    expect(nomes).not.toContain("situacao_financeira")
  })

  it("técnico sem ação nenhuma liberada só consegue ler e navegar", () => {
    const nomes = ferramentasPara(false, [])
    expect(nomes.every((f) => f.risco === "leitura")).toBe(true)
    expect(nomes.map((f) => f.nome)).toContain("abrir_tela")
  })

  it("administrador recebe tudo", () => {
    expect(ferramentasPara(true, []).length).toBe(FERRAMENTAS.length)
  })
})

describe("o catálogo é coerente", () => {
  it("não repete nome", () => {
    const nomes = FERRAMENTAS.map((f) => f.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
  })

  it("toda ação declarada existe no catálogo de permissões", () => {
    // Um nome de ação digitado errado aqui viraria uma ferramenta que nunca
    // aparece para técnico nenhum, sem nada acusar.
    const conhecidas = new Set<string>(ACOES)
    const invalidas = FERRAMENTAS.filter((f) => f.acao && !conhecidas.has(f.acao)).map((f) => f.nome)
    expect(invalidas).toEqual([])
  })

  it("toda ferramenta tem descrição que o modelo consiga usar", () => {
    for (const f of FERRAMENTAS) {
      expect(f.descricao.length, f.nome).toBeGreaterThan(30)
      expect(f.parametros.type, f.nome).toBe("object")
    }
  })

  it("todo parâmetro obrigatório está declarado nas propriedades", () => {
    // Exigir um parâmetro que não existe no schema faz a API recusar a
    // ferramenta inteira, e a assistente perde a habilidade em silêncio.
    for (const f of FERRAMENTAS) {
      for (const req of f.parametros.required ?? []) {
        expect(Object.keys(f.parametros.properties), `${f.nome}.${req}`).toContain(req)
      }
    }
  })

  it("nome desconhecido não vira ferramenta", () => {
    expect(ferramentaChamada("apagar_tudo")).toBeNull()
  })
})

describe("as ferramentas de escrita cobrem as ações liberáveis", () => {
  it("toda ação que o técnico pode ter tem alguma ferramenta, ou está fora de propósito", () => {
    // Nem toda ação precisa de voz. Mas a lista do que ficou de fora tem de ser
    // uma DECISÃO, e não um esquecimento — por isso está escrita aqui.
    const foraDePropositoPorEnquanto: Acao[] = [
      "os.editar", // mexer em item e valor por voz é onde o erro custa caro
      "cliente.equipamento", // marca, modelo e número de série ditados erram muito
    ]
    const cobertas = new Set(FERRAMENTAS.map((f) => f.acao).filter(Boolean))
    const sobrando = ACOES.filter(
      (a) => !cobertas.has(a) && !foraDePropositoPorEnquanto.includes(a)
    )
    expect(sobrando).toEqual([])
  })
})
