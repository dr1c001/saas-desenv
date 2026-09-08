import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Arquivar a nota fiscal: o PDF e o XML no nosso storage.
//
// ─── O caso do dono ──────────────────────────────────────────────────────────
//
// "para que as notas fiquem salvas em PDF e fácil de ser baixada caso o cliente
//  da empresa queira novamente a nota."
//
// O sistema guardava só uma URL para o servidor do emissor. Ela expira, muda, e
// some no dia em que a empresa trocar de fornecedor — e é justamente aí que o
// cliente liga pedindo a nota de 2024.
//
// O XML importa MAIS que o PDF: juridicamente é ele que vale, e ele nem era
// lido, embora o emissor o devolva.

let testDb: TestDatabase
const mockEnviar = vi.fn()
const mockBaixar = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/storage", () => ({
    enviarArquivo: mockEnviar,
    baixarArquivo: mockBaixar,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockEnviar.mockReset().mockResolvedValue(undefined)
  mockBaixar.mockReset().mockResolvedValue(null)
  vi.unstubAllGlobals()
})

/** Uma resposta de download que parece documento de verdade. */
function respondeCom(conteudo: Buffer, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, arrayBuffer: async () => conteudo })) as unknown as typeof fetch
  )
}

async function cenario(opts: { nfseUrl?: string | null } = {}) {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Auto Posto Rodovia" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      number: 42,
      title: "Troca de compressor",
      clientId: cliente.id,
      status: "INVOICED",
      totalAmount: 2000,
      nfseId: "nf-1",
      nfseNumber: "2026000123",
      nfseStatus: "Issued",
      nfseUrl: opts.nfseUrl === undefined ? "https://emissor/nota.pdf" : opts.nfseUrl,
    },
  })
  return { tenant, os }
}

const lib = () => import("@/lib/arquivo-da-nota")
const documento = Buffer.alloc(4096, 7)

describe("arquivar quando a prefeitura aceita", () => {
  it("guarda o PDF e o XML, e grava os caminhos", async () => {
    const { tenant, os } = await cenario()
    respondeCom(documento)
    const { arquivarNota } = await lib()

    const r = await arquivarNota({
      tenantId: tenant.id,
      orderId: os.id,
      pdfUrl: "https://emissor/nota.pdf",
      xmlUrl: "https://emissor/nota.xml",
    })

    expect(r).toEqual({ pdf: true, xml: true })
    expect(mockEnviar).toHaveBeenCalledTimes(2)
    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.nfsePdfPath).toContain(os.id)
    expect(depois?.nfseXmlPath).toContain(os.id)
  })

  it("o XML é guardado — é ele que vale juridicamente", async () => {
    // Ele nem era lido antes, embora o emissor o devolva. O PDF é só uma
    // representação dele.
    const { tenant, os } = await cenario()
    respondeCom(documento)
    const { arquivarNota } = await lib()

    await arquivarNota({
      tenantId: tenant.id,
      orderId: os.id,
      pdfUrl: null,
      xmlUrl: "https://emissor/nota.xml",
    })

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.nfseXmlPath).toBeTruthy()
    expect(mockEnviar.mock.calls[0][2]).toBe("application/xml")
  })

  it("não refaz o que já está arquivado", async () => {
    // A conciliação diária passa pela mesma nota mais de uma vez; rebaixar o
    // documento a cada passada é chamada HTTP externa dentro do cron, à toa.
    const { tenant, os } = await cenario()
    respondeCom(documento)
    const { arquivarNota } = await lib()

    await arquivarNota({
      tenantId: tenant.id,
      orderId: os.id,
      pdfUrl: "https://emissor/nota.pdf",
      xmlUrl: "https://emissor/nota.xml",
      jaTemPdf: true,
      jaTemXml: true,
    })

    expect(mockEnviar).not.toHaveBeenCalled()
  })

  it("página de erro do emissor NÃO vira nota arquivada", async () => {
    // Arquivá-la seria pior que não arquivar nada: o sistema passaria a dizer
    // que tem a nota, e entregaria um arquivo quebrado ao cliente.
    const { tenant, os } = await cenario()
    respondeCom(Buffer.alloc(30))
    const { arquivarNota } = await lib()

    const r = await arquivarNota({
      tenantId: tenant.id,
      orderId: os.id,
      pdfUrl: "https://emissor/erro",
      xmlUrl: null,
    })

    expect(r.pdf).toBe(false)
    expect((await testDb.db.serviceOrder.findUnique({ where: { id: os.id } }))?.nfsePdfPath).toBeNull()
  })

  it("falha de rede não derruba a conciliação das outras notas", async () => {
    const { tenant, os } = await cenario()
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout") }) as unknown as typeof fetch)
    const { arquivarNota } = await lib()

    const r = await arquivarNota({
      tenantId: tenant.id,
      orderId: os.id,
      pdfUrl: "https://emissor/nota.pdf",
      xmlUrl: "https://emissor/nota.xml",
    })

    expect(r).toEqual({ pdf: false, xml: false })
  })

  it("falha do storage também não derruba nada", async () => {
    const { tenant, os } = await cenario()
    respondeCom(documento)
    mockEnviar.mockRejectedValue(new Error("bucket fora do ar"))
    const { arquivarNota } = await lib()

    await expect(
      arquivarNota({ tenantId: tenant.id, orderId: os.id, pdfUrl: "https://emissor/n.pdf", xmlUrl: null })
    ).resolves.toEqual({ pdf: false, xml: false })
  })
})

describe("baixar a nota depois — o caso do cliente que pede de novo", () => {
  it("serve o arquivo GUARDADO, sem falar com o emissor", async () => {
    const { tenant, os } = await cenario()
    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { nfsePdfPath: `notas-fiscais/${tenant.id}/${os.id}.pdf` },
    })
    mockBaixar.mockResolvedValue(documento)
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("nao deveria ser chamado") }) as unknown as typeof fetch)
    const { arquivoDaNota } = await lib()

    const a = await arquivoDaNota(tenant.id, os.id, "pdf")

    expect(a?.conteudo.length).toBe(4096)
    // O nome carrega o NÚMERO da nota: é como o cliente e a contabilidade a
    // identificam.
    expect(a?.nomeArquivo).toContain("2026000123")
  })

  it("nota ANTIGA é arquivada na primeira vez que alguém pede", async () => {
    // É assim que o histórico entra no arquivo: por quem pede, e não por uma
    // varredura que releria a base inteira de todo mundo no cron.
    const { tenant, os } = await cenario()
    respondeCom(documento)
    const { arquivoDaNota } = await lib()

    const a = await arquivoDaNota(tenant.id, os.id, "pdf")

    expect(a).not.toBeNull()
    expect(mockEnviar).toHaveBeenCalledTimes(1)
    expect((await testDb.db.serviceOrder.findUnique({ where: { id: os.id } }))?.nfsePdfPath).toBeTruthy()
  })

  it("caminho gravado com arquivo sumido cai para o emissor", async () => {
    // O storage perdeu, ou alguém apagou. A nota existe — devolver "não existe"
    // seria o sistema mentindo sobre um documento fiscal.
    const { tenant, os } = await cenario()
    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { nfsePdfPath: `notas-fiscais/${tenant.id}/${os.id}.pdf` },
    })
    mockBaixar.mockResolvedValue(null)
    respondeCom(documento)
    const { arquivoDaNota } = await lib()

    expect((await arquivoDaNota(tenant.id, os.id, "pdf"))?.conteudo.length).toBe(4096)
  })

  it("a nota de OUTRA empresa não é servida", async () => {
    // Ela tem o CNPJ e o faturamento da outra empresa dentro.
    //
    // O `respondeCom` aqui NÃO é enfeite: sem ele, o teste passava mesmo com o
    // filtro de tenant removido — a busca achava a OS alheia, tentava baixar do
    // emissor, o fetch de verdade falhava, e o `null` vinha da REDE em vez de
    // vir do guarda. Um teste que passa pelo motivo errado é pior que teste
    // nenhum: ele diz que a proteção existe.
    // (Achado por teste de mutação, 07/09/2026.)
    const { os } = await cenario()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    respondeCom(documento)
    const { arquivoDaNota } = await lib()

    expect(await arquivoDaNota(outra.id, os.id, "pdf")).toBeNull()
    // E não arquivou nada em nome da empresa errada.
    expect(mockEnviar).not.toHaveBeenCalled()
  })

  it("sem nota nenhuma, devolve null em vez de arquivo vazio", async () => {
    const { tenant, os } = await cenario({ nfseUrl: null })
    const { arquivoDaNota } = await lib()

    expect(await arquivoDaNota(tenant.id, os.id, "pdf")).toBeNull()
  })

  it("o XML antigo NÃO é recuperável, e o código não finge que é", async () => {
    // Só o PDF tem URL guardada em campo (`nfseUrl`); a do XML vem na resposta
    // do emissor e não era gravada. Nota emitida antes desta mudança perdeu o
    // XML — e devolver o PDF no lugar dele seria pior do que devolver nada.
    const { tenant, os } = await cenario()
    const { arquivoDaNota } = await lib()

    expect(await arquivoDaNota(tenant.id, os.id, "xml")).toBeNull()
  })
})
