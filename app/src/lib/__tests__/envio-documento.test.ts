import { describe, expect, it } from "vitest"
import {
  JANELA_DE_CLIQUE_DUPLO_MS,
  osPodeSerEnviada,
  pareceEmail,
  problemaNoEnvio,
  textoDaOs,
  textoDoOrcamento,
} from "@/lib/envio-documento"

// As regras de mandar um documento ao cliente, sem banco.
//
// Cada caso aqui é um e-mail que sai em nome da empresa para um terceiro e que
// não dá para trazer de volta.

const agora = new Date("2026-09-05T14:00:00Z")

const ok = {
  email: "cliente@exemplo.com",
  token: "tok-123",
  enviadoEm: null,
  agora,
}

describe("dá para enviar?", () => {
  it("com e-mail e link, sim", () => {
    expect(problemaNoEnvio(ok)).toBeNull()
  })

  it("cliente cadastrado NÃO garante cliente com e-mail", () => {
    // A regra nova ("só faz orçamento com cliente cadastrado") não resolve o
    // envio: Client.email é opcional. Sem isto, a pessoa cadastraria o cliente
    // como o sistema mandou e o botão de enviar falharia sem dizer por quê.
    expect(problemaNoEnvio({ ...ok, email: null })).toBe("semEmail")
    expect(problemaNoEnvio({ ...ok, email: "   " })).toBe("semEmail")
  })

  it("telefone digitado no campo de e-mail é recusado", () => {
    // O engano comum: o cadastro tem um campo de contato e alguém cola o
    // telefone. Mandar para "11999998888" é uma falha do provedor que chega
    // como erro técnico, e não como "confira a ficha do cliente".
    expect(problemaNoEnvio({ ...ok, email: "11999998888" })).toBe("emailInvalido")
  })

  it("sem token não envia, em vez de mandar um link quebrado", () => {
    // Este é o defeito que existe hoje no envio por WhatsApp: o token é
    // nulável e a rota interpola direto, produzindo ".../q/null".
    expect(problemaNoEnvio({ ...ok, token: null })).toBe("semLink")
  })

  it("clique duplo não manda dois e-mails", () => {
    // Não há tabela de log de e-mail nem id de mensagem para deduplicar. A
    // defesa possível é o próprio sentAt.
    const haPouco = new Date(agora.getTime() - 5_000)
    expect(problemaNoEnvio({ ...ok, enviadoEm: haPouco })).toBe("enviadoAgoraMesmo")
  })

  it("mas REENVIAR de propósito continua permitido", () => {
    // "Não chegou, manda de novo" é pedido comum. Travar isso seria inventar
    // uma recusa que ninguém pediu.
    const ontem = new Date(agora.getTime() - 24 * 3600 * 1000)
    expect(problemaNoEnvio({ ...ok, enviadoEm: ontem })).toBeNull()
  })

  it("a janela do clique duplo é curta", () => {
    // Longa demais viraria trava de reenvio disfarçada.
    expect(JANELA_DE_CLIQUE_DUPLO_MS).toBeLessThanOrEqual(60_000)
  })

  it("o e-mail que falta vem ANTES do link que falta", () => {
    // A ordem das mensagens é a ordem em que a pessoa consegue consertar. Só
    // ela pode cadastrar o e-mail; o token é problema do sistema.
    expect(problemaNoEnvio({ ...ok, email: null, token: null })).toBe("semEmail")
  })
})

describe("a OS só vai depois de assinada", () => {
  it("concluída e assinada, pode", () => {
    // "quando estiver completa E ASSINADA" é condição do pedido.
    expect(osPodeSerEnviada({ status: "DONE", assinaturaUrl: "data:image/png;base64,x" })).toBe(true)
    expect(osPodeSerEnviada({ status: "INVOICED", assinaturaUrl: "data:image/png;base64,x" })).toBe(true)
  })

  it("concluída SEM assinatura, não", () => {
    // A OS assinada é o comprovante do serviço aceito. Mandar antes entrega ao
    // cliente um documento que ainda vai mudar — e o sistema deixa concluir de
    // novo, então mudaria mesmo.
    expect(osPodeSerEnviada({ status: "DONE", assinaturaUrl: null })).toBe(false)
  })

  it("assinada mas ainda em andamento, não", () => {
    // A assinatura pode ser coletada antes de concluir: a rota de assinatura
    // não exige status DONE.
    expect(osPodeSerEnviada({ status: "IN_PROGRESS", assinaturaUrl: "data:x" })).toBe(false)
    expect(osPodeSerEnviada({ status: "OPEN", assinaturaUrl: "data:x" })).toBe(false)
  })

  it("cancelada nunca vai", () => {
    expect(osPodeSerEnviada({ status: "CANCELLED", assinaturaUrl: "data:x" })).toBe(false)
  })
})

describe("o que conta como e-mail", () => {
  it("aceita endereço comum", () => {
    for (const e of ["a@b.co", "joao.silva@empresa.com.br", "contato+os@x.io"]) {
      expect(pareceEmail(e), e).toBe(true)
    }
  })

  it("recusa o que claramente não é", () => {
    for (const e of ["", "semarroba.com", "a@b", "a@@b.com", "com espaço@b.com", "@b.com", "a@"]) {
      expect(pareceEmail(e), e).toBe(false)
    }
  })

  it("é frouxa de propósito", () => {
    // Regra apertada demais recusa endereço válido e esquisito, e aí a pessoa
    // não consegue mandar para um cliente que existe. Quem decide de verdade é
    // o servidor de e-mail.
    expect(pareceEmail("o'brien@empresa-de-servicos.com.br")).toBe(true)
  })
})

describe("o texto que o cliente lê", () => {
  const dados = {
    empresa: "Polar Clima",
    numero: "ORC20260012",
    cliente: "Auto Posto Rodovia",
    validade: new Date("2026-09-20T12:00:00Z"),
    link: "https://servicoos.com.br/q/tok-123",
  }

  it("traz empresa, número, cliente e link", () => {
    const texto = textoDoOrcamento(dados)
    expect(texto).toContain("Polar Clima")
    expect(texto).toContain("ORC20260012")
    expect(texto).toContain("Auto Posto Rodovia")
    expect(texto).toContain(dados.link)
  })

  it("o link fica sozinho na linha", () => {
    // Enterrado no meio de um parágrafo, ele não é visto no celular — e ele é
    // a única coisa que a pessoa precisa clicar.
    const linhas = textoDoOrcamento(dados).split("\n")
    expect(linhas).toContain(dados.link)
  })

  it("diz a validade quando existe, e não inventa quando não existe", () => {
    expect(textoDoOrcamento(dados)).toContain("20/09/2026")
    const semValidade = textoDoOrcamento({ ...dados, validade: null })
    expect(semValidade).not.toContain("Válido")
  })

  it("a data sai no fuso do negócio", () => {
    // Uma validade gravada às 23h de Brasília sairia com a data do dia
    // seguinte se formatada em UTC.
    const tarde = textoDoOrcamento({ ...dados, validade: new Date("2026-09-20T02:00:00Z") })
    expect(tarde).toContain("19/09/2026")
  })

  it("o texto da OS fala de serviço concluído e assinado", () => {
    const texto = textoDaOs({
      empresa: "Polar Clima",
      numero: "OS20260042",
      cliente: "Auto Posto Rodovia",
      link: "https://servicoos.com.br/p/tok-9",
    })
    expect(texto).toContain("OS20260042")
    expect(texto).toContain("assinado")
    expect(texto.split("\n")).toContain("https://servicoos.com.br/p/tok-9")
  })

  it("não promete o que o sistema não cumpre", () => {
    // O remetente é um noreply. Um texto dizendo "responda este e-mail" seria
    // convite para a resposta sumir — a resposta vai por reply-to, que é outra
    // coisa e nem sempre está configurada.
    const texto = textoDoOrcamento(dados)
    expect(texto.toLowerCase()).not.toContain("responda este e-mail")
  })
})
