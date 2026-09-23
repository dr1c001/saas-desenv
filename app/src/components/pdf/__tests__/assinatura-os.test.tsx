import { describe, expect, it } from "vitest"
import React from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import { ServiceOrderPDF } from "@/components/pdf/service-order-pdf"

// O defeito que estes testes travam: a assinatura do CLIENTE era colhida na
// tela do celular, gravada no banco, e o PDF imprimia uma LINHA EM BRANCO por
// cima dela. Três das onze OS em produção tinham assinatura guardada e nenhuma
// saiu impressa.
//
// Testar o texto do rótulo não pegaria isso — o rótulo sempre esteve lá. O que
// se prova aqui é que a IMAGEM entra no arquivo, que é o que faltava.

/** Dois PNGs DIFERENTES, de propósito.
 *
 *  O react-pdf deduplica imagem idêntica: embutir o mesmo arquivo duas vezes
 *  não faz o PDF crescer, porque as duas referências apontam para o mesmo
 *  recurso. Com o mesmo PNG dos dois lados, o teste de "as duas entram" passaria
 *  a medir nada. */
const ASSINATURA_CLIENTE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII="
const ASSINATURA_TECNICO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEklEQVR4nGP4z8AAQVDqPwMDAEHSBfsl0XwmAAAAAElFTkSuQmCC"

const BASE = {
  number: 42,
  title: "Troca da bomba",
  description: null,
  conclusionNote: "Bomba trocada e testada.",
  status: "DONE",
  totalAmount: 450,
  createdAt: new Date("2026-08-01T12:00:00Z"),
  scheduledAt: null,
  concludedAt: new Date("2026-08-02T12:00:00Z"),
  client: { name: "Padaria Central", document: null, phone: null, email: null, address: null },
  items: [],
}

function gerar(order: Record<string, unknown>) {
  return renderToBuffer(
    React.createElement(ServiceOrderPDF, {
      order: { ...BASE, ...order },
      companyName: "Bombas Ltda",
      logoUrl: null,
      companyPhone: null,
      companyAddress: null,
      companyWebsite: null,
      locale: "pt" as const,
    } as never) as never
  )
}

describe("as assinaturas no PDF da ordem de serviço", () => {
  it("a assinatura do CLIENTE entra no arquivo, não só o rótulo", async () => {
    const semAssinatura = await gerar({ clientSignatureUrl: null, technician: null })
    const comAssinatura = await gerar({ clientSignatureUrl: ASSINATURA_CLIENTE, technician: null })

    // O PDF com a imagem embutida é maior. Se fossem iguais, a assinatura teria
    // sido ignorada — que é exatamente o que acontecia antes.
    expect(comAssinatura.length).toBeGreaterThan(semAssinatura.length)
  })

  it("a assinatura de QUEM EXECUTOU entra no arquivo", async () => {
    // O outro lado do documento: quem recebeu assina que recebeu, quem fez
    // assina que fez. Nenhum dos dois era impresso.
    const semAssinatura = await gerar({
      clientSignatureUrl: null,
      technician: { name: "Beto", signatureUrl: null },
    })
    const comAssinatura = await gerar({
      clientSignatureUrl: null,
      technician: { name: "Beto", signatureUrl: ASSINATURA_TECNICO },
    })

    expect(comAssinatura.length).toBeGreaterThan(semAssinatura.length)
  })

  it("as duas juntas entram, e não uma no lugar da outra", async () => {
    const soCliente = await gerar({
      clientSignatureUrl: ASSINATURA_CLIENTE,
      technician: { name: "Beto", signatureUrl: null },
    })
    const asDuas = await gerar({
      clientSignatureUrl: ASSINATURA_CLIENTE,
      technician: { name: "Beto", signatureUrl: ASSINATURA_TECNICO },
    })

    expect(asDuas.length).toBeGreaterThan(soCliente.length)
  })

  it("OS sem nenhuma assinatura continua gerando o documento", async () => {
    // A regra que impede o remédio de virar doença: ninguém fica sem PDF por
    // não ter desenhado a assinatura ainda. Sai a linha para assinar à mão.
    const buf = await gerar({ clientSignatureUrl: null, technician: null })
    expect(buf.length).toBeGreaterThan(1000)
  })

  it("responsável sem assinatura gravada não quebra o documento", async () => {
    const buf = await gerar({
      clientSignatureUrl: ASSINATURA_CLIENTE,
      technician: { name: "Beto", signatureUrl: null },
    })
    expect(buf.length).toBeGreaterThan(1000)
  })
})
