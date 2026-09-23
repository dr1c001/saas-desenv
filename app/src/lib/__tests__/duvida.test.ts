import { describe, expect, it } from "vitest"
import {
  esperaResposta,
  MAX_ABERTAS_POR_EMPRESA,
  MAX_CARACTERES,
  MAX_MENSAGENS,
  podeAbrirNova,
  podeEscrever,
  problemaNoTexto,
  resumo,
  statusApos,
  telaCanonica,
  temRespostaNova,
} from "@/lib/duvida"

describe("o texto da pergunta", () => {
  it("diz QUAL é o problema, e não só que há um", () => {
    // "Mensagem inválida" manda a pessoa adivinhar se escreveu demais ou de
    // menos — e ela acabou de escrever, então sabe que escreveu alguma coisa.
    expect(problemaNoTexto("")).toBe("vazio")
    expect(problemaNoTexto("   ")).toBe("vazio")
    expect(problemaNoTexto("oi")).toBe("curto")
    expect(problemaNoTexto("x".repeat(MAX_CARACTERES + 1))).toBe("longo")
  })

  it("uma pergunta de verdade passa", () => {
    expect(problemaNoTexto("Como eu emito nota fiscal?")).toBeNull()
  })

  it("conta o texto SEM os espaços das pontas", () => {
    // Senão dava para burlar o mínimo com espaço, e estourar o máximo por
    // causa de uma quebra de linha sobrando no fim do textarea.
    expect(problemaNoTexto("   oi   ")).toBe("curto")
    expect(problemaNoTexto(`  ${"x".repeat(MAX_CARACTERES)}  `)).toBeNull()
  })
})

describe("a tela em que a pessoa estava", () => {
  it("guarda a rota do CATÁLOGO, e não o caminho cru", () => {
    // O defeito que isto impede: `/service-orders/ckx9f2...` carrega o id de
    // uma OS de um cliente final. Ele apareceria no painel do dono da
    // plataforma, que não tem nada a ver com aquela OS — e seria texto livre
    // vindo de um endereço HTTP dentro de um campo do banco.
    expect(telaCanonica("/service-orders/ckx9f2abc123")).toEqual({
      rota: "/service-orders",
      codigo: "1.1",
    })
  })

  it("a tela em si também funciona", () => {
    expect(telaCanonica("/finance")).toEqual({ rota: "/finance", codigo: "3.1" })
  })

  it("pega a tela MAIS específica", () => {
    // `/settings` é prefixo de `/settings/fiscal`. Guardar a primeira faria o
    // dono achar que a pessoa estava em Configurações quando ela estava em
    // Fiscal — e a dúvida deixaria de fazer sentido.
    expect(telaCanonica("/settings/fiscal")?.codigo).toBe("3.4")
  })

  it("tela fora do catálogo devolve NULO, e nulo é honesto", () => {
    expect(telaCanonica("/inventado")).toBeNull()
    expect(telaCanonica("")).toBeNull()
    expect(telaCanonica(null)).toBeNull()
  })

  it("não aceita coisa que nem parece caminho", () => {
    // O valor vem do navegador; tratar como dado é o mínimo.
    expect(telaCanonica("javascript:alert(1)")).toBeNull()
    expect(telaCanonica("https://outro-site.com/service-orders")).toBeNull()
  })
})

describe("o ciclo da conversa", () => {
  it("o cliente falando deixa a conversa ESPERANDO o dono", () => {
    expect(statusApos("CLIENTE")).toBe("ABERTA")
    expect(esperaResposta("ABERTA")).toBe(true)
  })

  it("o dono falando devolve a bola ao cliente", () => {
    expect(statusApos("PLATAFORMA")).toBe("RESPONDIDA")
    expect(esperaResposta("RESPONDIDA")).toBe(false)
  })

  it("fechada não espera ninguém", () => {
    expect(esperaResposta("FECHADA")).toBe(false)
  })
})

describe("os limites", () => {
  it("três conversas abertas por empresa", () => {
    // Não é economia de linha no banco: é o painel continuar legível. Uma
    // empresa que abre quinze numa tarde afoga as das outras quatro.
    expect(podeAbrirNova(0)).toBe(true)
    expect(podeAbrirNova(MAX_ABERTAS_POR_EMPRESA - 1)).toBe(true)
    expect(podeAbrirNova(MAX_ABERTAS_POR_EMPRESA)).toBe(false)
  })

  it("conversa cheia não aceita mensagem DE NINGUÉM", () => {
    // Nem do dono. Um limite que vale só para um dos lados não é limite, é
    // obstáculo para o cliente.
    expect(podeEscrever(MAX_MENSAGENS - 1)).toBe(true)
    expect(podeEscrever(MAX_MENSAGENS)).toBe(false)
  })
})

describe("o cliente tem resposta nova?", () => {
  const antes = new Date("2026-09-03T10:00:00Z")
  const depois = new Date("2026-09-03T11:00:00Z")

  it("resposta do dono que ele ainda não leu", () => {
    expect(temRespostaNova(depois, "PLATAFORMA", null)).toBe(true)
    expect(temRespostaNova(depois, "PLATAFORMA", antes)).toBe(true)
  })

  it("já lida não é nova", () => {
    expect(temRespostaNova(antes, "PLATAFORMA", depois)).toBe(false)
  })

  it("a própria mensagem DELE nunca é resposta nova", () => {
    // Senão o cliente veria um aviso de "resposta nova" logo depois de
    // escrever, e o aviso perderia todo o sentido.
    expect(temRespostaNova(depois, "CLIENTE", null)).toBe(false)
  })
})

describe("o resumo da pergunta", () => {
  it("cabe numa linha de notificação", () => {
    const longo = "a".repeat(200)
    expect(resumo(longo).length).toBeLessThanOrEqual(90)
    expect(resumo(longo).endsWith("…")).toBe(true)
  })

  it("junta as quebras de linha", () => {
    // O textarea manda "\n\n" e a notificação mostra tudo numa linha só —
    // sem isto o corpo do push viria com buracos.
    expect(resumo("Como\n\n  emito   nota?")).toBe("Como emito nota?")
  })

  it("pergunta curta sai inteira, sem reticência", () => {
    expect(resumo("Como emito nota?")).toBe("Como emito nota?")
  })
})
