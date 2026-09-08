import { describe, expect, it } from "vitest"
import { escopoDe, filialParaNovo, filialValida, filtroDeFilial } from "@/lib/filial"

describe("quem enxerga o quê", () => {
  it("dono e administrador veem tudo por padrão", () => {
    expect(escopoDe({ role: "OWNER", branchId: null, temFiliais: true })).toEqual({ tipo: "tudo" })
    expect(escopoDe({ role: "ADMIN", branchId: "f1", temFiliais: true })).toEqual({ tipo: "tudo" })
  })

  it("dono pode filtrar por uma filial na tela", () => {
    expect(escopoDe({ role: "OWNER", branchId: null, temFiliais: true }, "f2")).toEqual({
      tipo: "filial",
      branchId: "f2",
    })
  })

  it("técnico vinculado vê a filial dele", () => {
    expect(escopoDe({ role: "TECHNICIAN", branchId: "f1", temFiliais: true })).toEqual({
      tipo: "filial",
      branchId: "f1",
    })
  })

  it("o filtro da tela NÃO vale para quem está preso a uma filial", () => {
    // Se valesse, bastaria trocar o parâmetro na URL para ler a filial
    // vizinha — o seletor de tela viraria a autorização.
    expect(escopoDe({ role: "TECHNICIAN", branchId: "f1", temFiliais: true }, "f2")).toEqual({
      tipo: "filial",
      branchId: "f1",
    })
  })

  it("técnico SEM filial continua vendo tudo", () => {
    // É o comportamento de hoje. Qualquer outra coisa deixaria a equipe
    // inteira sem dados no dia em que alguém criasse a primeira filial.
    expect(escopoDe({ role: "TECHNICIAN", branchId: null, temFiliais: true })).toEqual({ tipo: "tudo" })
    expect(escopoDe({ role: "TECHNICIAN", branchId: null, temFiliais: true }, "f2")).toEqual({ tipo: "tudo" })
  })
})

describe("o filtro que vai para a consulta", () => {
  it("ver tudo não filtra nada", () => {
    expect(filtroDeFilial({ tipo: "tudo" })).toEqual({})
  })

  it("ver uma filial inclui SEMPRE o que não tem filial", () => {
    // A regra que impede a base histórica de sumir da tela quando a empresa
    // cadastra a primeira unidade.
    expect(filtroDeFilial({ tipo: "filial", branchId: "f1" })).toEqual({
      AND: [{ OR: [{ branchId: "f1" }, { branchId: null }] }],
    })
  })

  it("NÃO usa OR no nível de cima — colidiria com a busca por texto", () => {
    // As consultas de cliente e de OS já têm um `OR` no topo, da pesquisa.
    // Espalhar outro por cima substituiria o da busca em silêncio: a pesquisa
    // pararia de filtrar e a listagem devolveria a base inteira, parecendo
    // funcionar. É por isso que o filtro vem dentro de `AND`.
    const filtro = filtroDeFilial({ tipo: "filial", branchId: "f1" })
    expect(Object.keys(filtro)).toEqual(["AND"])
    expect("OR" in filtro).toBe(false)
  })
})

describe("a filial de um registro novo", () => {
  it("herda de onde faz sentido, e não de quem digitou", () => {
    // A OS pega a do cliente: um atendente da matriz cadastrando OS para um
    // cliente da filial não muda de quem é aquele cliente.
    expect(filialParaNovo("f-cliente", "f-autor")).toBe("f-cliente")
  })

  it("cai na do autor quando não há de onde herdar", () => {
    expect(filialParaNovo(null, "f-autor")).toBe("f-autor")
    expect(filialParaNovo(undefined, "f-autor")).toBe("f-autor")
  })

  it("sem nenhuma das duas, fica sem filial — visível para todos", () => {
    // E não escondido de todos, que é o outro caminho possível e o errado.
    expect(filialParaNovo(null, null)).toBeNull()
  })
})

describe("filial escolhida no formulário", () => {
  it("aceita só filial ativa da própria empresa", () => {
    // Sem conferir, um id de filial de OUTRA empresa viraria o branchId do
    // registro — e ele sumiria das telas das duas.
    expect(filialValida("f1", ["f1", "f2"])).toBe("f1")
    expect(filialValida("f-de-outra-empresa", ["f1", "f2"])).toBeNull()
  })

  it("vazio significa sem filial, não erro", () => {
    expect(filialValida(null, ["f1"])).toBeNull()
    expect(filialValida("", ["f1"])).toBeNull()
    expect(filialValida(undefined, ["f1"])).toBeNull()
  })
})

describe("o recurso é do plano Enterprise", () => {
  it("sem o recurso, todo mundo vê tudo — inclusive quem está vinculado", () => {
    // O caso que importa: a empresa cai de Enterprise para Pro. As colunas
    // continuam gravadas, mas a divisão para de valer. Sem isso, a equipe
    // ficaria presa a uma separação que ninguém mais consegue administrar —
    // a tela que cria e vincula filial some junto com o plano.
    expect(escopoDe({ role: "TECHNICIAN", branchId: "f1", temFiliais: false })).toEqual({
      tipo: "tudo",
    })
  })

  it("sem o recurso, nem o filtro do dono aplica", () => {
    expect(escopoDe({ role: "OWNER", branchId: null, temFiliais: false }, "f2")).toEqual({
      tipo: "tudo",
    })
  })

  it("voltar para o Enterprise restaura a divisão sem recadastrar nada", () => {
    // O vínculo nunca foi apagado — só deixou de ser consultado.
    const pessoa = { role: "TECHNICIAN", branchId: "f1" }
    expect(escopoDe({ ...pessoa, temFiliais: false })).toEqual({ tipo: "tudo" })
    expect(escopoDe({ ...pessoa, temFiliais: true })).toEqual({ tipo: "filial", branchId: "f1" })
  })
})
