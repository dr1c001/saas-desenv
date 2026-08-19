import { describe, expect, it } from "vitest"
// Importa o MESMO arquivo que os scripts de backup e restauracao usam.
// Duas copias da ordem de carga divergiriam — e o sintoma seria descoberto
// justamente na hora de restaurar, que e a pior hora possivel.
import {
  conferir,
  doJson,
  ordemDeCarga,
  ordemDeLimpeza,
  paraJson,
} from "../../../scripts/_backup-lib.mjs"

type Manifesto = {
  geradoEm: string
  migration: string | null
  linhas: Record<string, number>
  ordem: string[]
}

describe("ordem de carga", () => {
  it("põe o pai antes do filho", () => {
    const ordem = ordemDeCarga(
      ["ServiceOrder", "Client", "Tenant"],
      [
        { tabela: "ServiceOrder", referencia: "Client" },
        { tabela: "ServiceOrder", referencia: "Tenant" },
        { tabela: "Client", referencia: "Tenant" },
      ]
    )
    expect(ordem.indexOf("Tenant")).toBeLessThan(ordem.indexOf("Client"))
    expect(ordem.indexOf("Client")).toBeLessThan(ordem.indexOf("ServiceOrder"))
  })

  it("auto-referência não trava a tabela na fila", () => {
    // Sem essa exceção a tabela nunca sairia da fila e o backup pareceria
    // incompleto sem motivo aparente.
    const ordem = ordemDeCarga(["Categoria"], [{ tabela: "Categoria", referencia: "Categoria" }])
    expect(ordem).toEqual(["Categoria"])
  })

  it("ciclo entre tabelas não derruba a restauração", () => {
    // Travar seria a pior resposta possível na hora em que se está
    // restaurando. Devolve tudo, e quem chama decide.
    const ordem = ordemDeCarga(
      ["A", "B"],
      [
        { tabela: "A", referencia: "B" },
        { tabela: "B", referencia: "A" },
      ]
    )
    expect([...ordem].sort()).toEqual(["A", "B"])
  })

  it("ignora chave estrangeira para tabela fora da lista", () => {
    // Tabela do Supabase (auth.users) referenciada pelo schema público não
    // pode fazer a nossa tabela nunca ficar pronta.
    const ordem = ordemDeCarga(["User"], [{ tabela: "User", referencia: "auth_users" }])
    expect(ordem).toEqual(["User"])
  })

  it("é estável entre execuções", () => {
    // Dois backups do mesmo banco geram o mesmo arquivo, o que permite
    // comparar um com o outro.
    const tabelas = ["Z", "M", "A"]
    expect(ordemDeCarga(tabelas, [])).toEqual(ordemDeCarga(tabelas, []))
    expect(ordemDeCarga(tabelas, [])).toEqual(["A", "M", "Z"])
  })

  it("a limpeza é o inverso: filho antes de pai", () => {
    const arestas = [{ tabela: "Filho", referencia: "Pai" }]
    expect(ordemDeLimpeza(["Pai", "Filho"], arestas)).toEqual(["Filho", "Pai"])
  })
})

describe("serialização", () => {
  it("data sobrevive à ida e volta", () => {
    const d = new Date("2026-08-18T12:34:56.789Z")
    const voltou = doJson(JSON.parse(JSON.stringify(paraJson(d))))
    expect(voltou).toBeInstanceOf(Date)
    expect((voltou as Date).toISOString()).toBe(d.toISOString())
  })

  it("bigint sobrevive — e sem ele o JSON.stringify lançaria", () => {
    const voltou = doJson(JSON.parse(JSON.stringify(paraJson(123456789012345678n))))
    expect(voltou).toBe(123456789012345678n)
  })

  it("bytes sobrevivem em base64", () => {
    const b = new Uint8Array([0, 1, 250, 255])
    const voltou = doJson(JSON.parse(JSON.stringify(paraJson(b)))) as Buffer
    expect([...voltou]).toEqual([0, 1, 250, 255])
  })

  it("null continua null, e não vira objeto", () => {
    expect(paraJson(null)).toBeNull()
    expect(doJson(null)).toBeNull()
    expect(paraJson(undefined)).toBeNull()
  })

  it("array de datas sobrevive item a item", () => {
    const v = [new Date("2026-01-01T00:00:00.000Z"), null]
    const voltou = doJson(JSON.parse(JSON.stringify(paraJson(v)))) as unknown[]
    expect(voltou[0]).toBeInstanceOf(Date)
    expect(voltou[1]).toBeNull()
  })

  it("texto e número passam intactos", () => {
    expect(doJson(paraJson("oi"))).toBe("oi")
    expect(doJson(paraJson(42))).toBe(42)
    expect(doJson(paraJson(true))).toBe(true)
  })

  it("JSON do banco não é confundido com marcador", () => {
    // O campo customValues é JSON livre do cliente. Um objeto qualquer não
    // pode ser interpretado como marcador de tipo.
    const v = { cor: "azul", n: 3 }
    expect(doJson(paraJson(v))).toEqual(v)
  })
})

describe("conferência do restore", () => {
  const manifesto: Manifesto = {
    geradoEm: "2026-08-18T12:00:00.000Z",
    migration: "20260818000004_add_historico_os",
    linhas: { Tenant: 4, Client: 5, ServiceOrder: 10 },
    ordem: ["Tenant", "Client", "ServiceOrder"],
  }

  it("silencia quando bate tudo", () => {
    expect(conferir(manifesto, { Tenant: 4, Client: 5, ServiceOrder: 10 })).toEqual([])
  })

  it("aponta tabela que perdeu linha", () => {
    // É o caso que este módulo existe pra impedir: uma carga que falhou por
    // chave estrangeira e terminou sem barulho nenhum.
    expect(conferir(manifesto, { Tenant: 4, Client: 5, ServiceOrder: 7 })).toEqual([
      { tabela: "ServiceOrder", esperado: 10, encontrado: 7 },
    ])
  })

  it("tabela ausente conta como zero, não como ausente", () => {
    const fora = conferir(manifesto, { Tenant: 4, Client: 5 })
    expect(fora).toEqual([{ tabela: "ServiceOrder", esperado: 10, encontrado: 0 }])
  })

  it("também aponta linha a MAIS", () => {
    // Restaurar por cima de um banco que não estava vazio é erro tão grave
    // quanto perder linha, e passa despercebido se só se procurar falta.
    expect(conferir(manifesto, { Tenant: 4, Client: 9, ServiceOrder: 10 })).toEqual([
      { tabela: "Client", esperado: 5, encontrado: 9 },
    ])
  })
})
