import { describe, expect, it } from "vitest"
import { abaDaRota, DESTINOS } from "@/lib/codigos-abas"

// Qual aba governa cada rota.
//
// ─── O defeito que isto sustenta ─────────────────────────────────────────────
//
// A permissão por aba era só de MENU: `getAllowedTabs` tinha um consumidor no
// sistema inteiro — o layout — e o resultado só virava prop da barra lateral.
// Desmarcar "Clientes" para o técnico tirava o item do menu e nada mais; ele
// digitava /clients e recebia a carteira inteira.
//
// Esta função é o que o layout usa para barrar a rota. Os casos abaixo são as
// três decisões dela, e cada um já quebrou em algum sistema:
// prefixo mais longo, segmento inteiro, e desconhecido libera.
//
// (Achado na auditoria de 13/09/2026.)

describe("prefixo mais longo vence", () => {
  it("uma sub-rota de configurações não herda a aba da raiz", () => {
    // /settings/permissions tem destino próprio (5.4.1). Casar com /settings
    // primeiro daria a aba errada — e, como as telas de configuração têm
    // `aba: null`, daria "liberado" para uma tela que tem dono.
    expect(abaDaRota("/settings/permissions")).toBe(abaDaRota("/settings"))
  })

  it("a rota exata casa com o próprio destino", () => {
    expect(abaDaRota("/clients")).toBe("clients")
    expect(abaDaRota("/service-orders")).toBe("service-orders")
    expect(abaDaRota("/balanco")).toBe("balanco")
  })

  it("uma tela filha herda a aba da mãe", () => {
    // /clients/abc123 e /clients/new são a mesma aba de /clients — é assim que
    // a trava alcança as telas de detalhe e de criar, que não têm destino
    // próprio no catálogo.
    expect(abaDaRota("/clients/cmr04abc")).toBe("clients")
    expect(abaDaRota("/service-orders/new")).toBe("service-orders")
    expect(abaDaRota("/service-orders/abc/edit")).toBe("service-orders")
  })
})

describe("compara o segmento inteiro", () => {
  it("não confunde rotas que começam igual", () => {
    // Sem a checagem do separador, "/servicos" casaria com "/service-orders"
    // pelo prefixo — e uma rota nova herdaria a trava de outra em silêncio.
    expect(abaDaRota("/servicos")).toBeNull()
    expect(abaDaRota("/clientside")).toBeNull()
  })
})

describe("rota desconhecida LIBERA", () => {
  it("devolve null para o que não está no catálogo", () => {
    // Deliberado: o catálogo não cobre tudo. Barrar o não-mapeado
    // transformaria esta função numa lista de bloqueio silenciosa, quebrando
    // telas ao acrescentar destinos. O erro possível aqui é liberar demais, e
    // ele é visível; o inverso trava gente no meio do trabalho.
    expect(abaDaRota("/ajuda")).toBeNull()
    expect(abaDaRota("/")).toBeNull()
    expect(abaDaRota("/rota-que-nao-existe")).toBeNull()
  })
})

describe("ruído de URL não atrapalha", () => {
  it("ignora a query e a barra no fim", () => {
    expect(abaDaRota("/clients?q=maria")).toBe("clients")
    expect(abaDaRota("/clients/")).toBe("clients")
  })
})

describe("o catálogo continua coerente", () => {
  it("toda rota com aba é alcançável por esta função", () => {
    // Guarda contra um destino novo entrar com uma rota que o casamento não
    // encontra — o que faria a trava silenciosamente não valer para ele.
    for (const d of DESTINOS) {
      if (!d.aba) continue
      expect(abaDaRota(d.rota)).toBe(d.aba)
    }
  })
})
