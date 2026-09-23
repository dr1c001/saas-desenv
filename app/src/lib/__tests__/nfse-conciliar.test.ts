import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { MAX_CONSULTAS } from "@/lib/nfse-status"

/** O `take` da consulta, em lib/nfse-conciliar.ts. O defeito só aparece
 *  quando ele está cheio — por isso o número precisa estar aqui. */
const MAX_POR_RODADA = 30

// A metade que faltava da emissão. Sem esta rotina, a OS ficava marcada como
// FATURADA mesmo quando a prefeitura rejeitava a nota — receita lançada no
// financeiro, documento fiscal nenhum, e ninguém sabendo.

let testDb: TestDatabase
const mockGetInvoice = vi.fn()
const mockNotificar = vi.fn()
const mockArquivar = vi.fn()
const mockPendencia = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/nfeio", () => ({ nfeio: { getInvoice: mockGetInvoice } }))
  vi.doMock("@/lib/notificar", () => ({ notificar: mockNotificar }))
  // `arquivarNota` fala com rede e storage; `faltouArquivar` é regra pura e
  // fica REAL — é ela que decide se o documento entrou.
  vi.doMock("@/lib/arquivo-da-nota", async () => ({
    ...(await vi.importActual<typeof import("@/lib/arquivo-da-nota")>("@/lib/arquivo-da-nota")),
    arquivarNota: mockArquivar,
  }))
  vi.doMock("@/lib/pendencia", () => ({ avisarPendenciaUmaVez: mockPendencia }))
  vi.doMock("@/lib/resend", () => ({ avisarPendenciaDeConfiguracao: vi.fn() }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetInvoice.mockReset()
  mockNotificar.mockReset().mockResolvedValue(undefined)
  mockArquivar.mockReset().mockResolvedValue({ pdf: true, xml: true })
  mockPendencia.mockReset().mockResolvedValue(true)
})

async function osComNota(nfseStatus: string | null, nfseChecks = 0) {
  const tenant = await testDb.db.tenant.create({
    data: { name: "Empresa", nfeioCompanyId: "co-1" },
  })
  const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C" } })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id, clientId: cliente.id, number: 1, title: "Troca da bomba",
      status: "INVOICED", nfseId: "nf-1", nfseStatus, nfseChecks,
      nfseIssuedAt: new Date("2026-08-20T12:00:00Z"),
    },
  })
  return { tenant, os }
}

const releu = (id: string) => testDb.db.serviceOrder.findUnique({ where: { id } })

describe("conciliação das notas pendentes", () => {
  it("a nota que a prefeitura aceitou ganha número e link do PDF", async () => {
    // O link ficava NULO porque o PDF não existe no instante da emissão — só
    // depois de a prefeitura aceitar.
    const { os } = await osComNota("Processing")
    mockGetInvoice.mockResolvedValue({
      id: "nf-1", flowStatus: "Issued", number: "2026/123", pdf: { url: "https://x/nota.pdf" },
    })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.emitidas).toBe(1)
    const depois = await releu(os.id)
    expect(depois!.nfseNumber).toBe("2026/123")
    expect(depois!.nfseUrl).toBe("https://x/nota.pdf")
  })

  it("nota RECUSADA avisa o escritório", async () => {
    // O ponto inteiro da rotina: recusa precisa chegar em alguém. Antes a OS
    // ficava faturada e a nota simplesmente não existia.
    const { os, tenant } = await osComNota("Processing")
    mockGetInvoice.mockResolvedValue({ id: "nf-1", flowStatus: "IssueFailed" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.rejeitadas).toBe(1)
    expect(mockNotificar).toHaveBeenCalledWith(
      expect.objectContaining({ evento: "notaRejeitada", tenantId: tenant.id })
    )
    expect((await releu(os.id))!.nfseStatus).toBe("IssueFailed")
  })

  it("nota já resolvida não é consultada de novo", async () => {
    await osComNota("Issued")
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.consultadas).toBe(0)
    expect(mockGetInvoice).not.toHaveBeenCalled()
  })

  it("desiste depois do teto de tentativas", async () => {
    // Nota parada há um mês precisa de alguém olhando, não de mais uma
    // consulta diária para sempre.
    const { MAX_CONSULTAS } = await import("@/lib/nfse-status")
    await osComNota("Processing", MAX_CONSULTAS)
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    expect((await conciliarNotasPendentes()).consultadas).toBe(0)
    expect(mockGetInvoice).not.toHaveBeenCalled()
  })

  it("erro na consulta CONTA a tentativa", async () => {
    // Senão uma nota cujo id o emissor não reconhece seria consultada todo
    // dia, para sempre.
    const { os } = await osComNota("Processing")
    mockGetInvoice.mockRejectedValue(new Error("404"))
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.erros).toBe(1)
    expect((await releu(os.id))!.nfseChecks).toBe(1)
  })

  it("estado desconhecido continua pendente, e não vira 'deu certo'", async () => {
    await osComNota("Processing")
    mockGetInvoice.mockResolvedValue({ id: "nf-1", flowStatus: "EstadoNovoDoEmissor" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.emitidas).toBe(0)
    expect(r.rejeitadas).toBe(0)
    expect(mockNotificar).not.toHaveBeenCalled()
  })

  it("OS sem nota não entra na conciliação", async () => {
    const t = await testDb.db.tenant.create({ data: { name: "E" } })
    const c = await testDb.db.client.create({ data: { tenantId: t.id, name: "C" } })
    await testDb.db.serviceOrder.create({
      data: { tenantId: t.id, clientId: c.id, number: 1, title: "Sem nota" },
    })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    expect((await conciliarNotasPendentes()).consultadas).toBe(0)
  })
})

describe("coerência entre o filtro do banco e a regra", () => {
  it("todo estado tratado como final pelo filtro é final pela regra", async () => {
    // O filtro usa a grafia do emissor para não trazer nota resolvida do
    // banco. Se as duas listas divergirem, nota resolvida volta a ser
    // consultada (barato) ou pendente para de ser (caro).
    const { estadosFinaisConferem } = await import("@/lib/nfse-conciliar")
    expect(estadosFinaisConferem()).toBe(true)
  })
})

describe("o emissor pendurado não segura o cron", () => {
  // Até 15/09/2026 a consulta não tinha timeout: 30 consultas a um emissor
  // mudo seguravam a função até a Vercel matá-la — e o fechamento do CronRun
  // e o aviso ao fundador vêm DEPOIS, então a falha apagava o próprio alarme.
  // (Achado na auditoria de 13/09/2026.)
  const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })

  it("ao primeiro TIMEOUT a rodada para — as outras 29 iam bater no mesmo muro", async () => {
    const { tenant } = await osComNota("Processing")
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C2" } })
    for (let n = 2; n <= 3; n++) {
      await testDb.db.serviceOrder.create({
        data: {
          tenantId: tenant.id, clientId: cliente.id, number: n, title: "Outra",
          status: "INVOICED", nfseId: `nf-${n}`, nfseStatus: "Processing", nfseChecks: 0,
          nfseIssuedAt: new Date(`2026-08-2${n}T12:00:00Z`),
        },
      })
    }
    mockGetInvoice.mockRejectedValue(timeout())
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(mockGetInvoice).toHaveBeenCalledTimes(1)
    expect(r.erros).toBe(1)
    // E a nota não leva a culpa: o timeout não conta como tentativa dela.
    const todas = await testDb.db.serviceOrder.findMany({ where: { tenantId: tenant.id } })
    expect(todas.every((o) => o.nfseChecks === 0)).toBe(true)
  })

  it("o orçamento de tempo esgotado encerra a rodada antes da próxima consulta", async () => {
    const { tenant } = await osComNota("Processing")
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C2" } })
    for (let n = 2; n <= 3; n++) {
      await testDb.db.serviceOrder.create({
        data: {
          tenantId: tenant.id, clientId: cliente.id, number: n, title: "Outra",
          status: "INVOICED", nfseId: `nf-${n}`, nfseStatus: "Processing", nfseChecks: 0,
          nfseIssuedAt: new Date(`2026-08-2${n}T12:00:00Z`),
        },
      })
    }
    // Relógio FALSO: cada consulta "custa" 5 s — o timeout da nfe.io. Nada
    // aqui depende de quanto o banco demora, então o resultado é sempre o
    // mesmo. Com o relógio de parede, uma consulta lenta do pglite derrubava
    // o teste sozinha.
    let relogio = new Date("2026-09-22T12:00:00Z").getTime()
    mockGetInvoice.mockImplementation(async () => {
      relogio += 5_000
      return { id: "nf", flowStatus: "Processing" }
    })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes(8_000, () => relogio)

    // A primeira passa (relógio em 0 do orçamento); a segunda vê 5 s de 8 s e
    // passa; a terceira vê 10 s e é cortada.
    expect(r.consultadas).toBe(2)
    expect(mockGetInvoice).toHaveBeenCalledTimes(2)
  })

  it("a reserva presa (`reservando:`) não é consultada, e NÃO ocupa vaga na fila", async () => {
    // Ela não é id de nota (perguntar é receber 404) e nunca incrementa
    // nfseChecks — ficaria na fila para sempre. Sai da consulta pelo WHERE.
    const { tenant } = await osComNota("Processing")
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C2" } })
    const presa = await testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id, clientId: cliente.id, number: 9, title: "Presa",
        status: "INVOICED", nfseId: "reservando:abc", nfseStatus: null, nfseChecks: 0,
      },
    })
    mockGetInvoice.mockResolvedValue({ id: "nf-1", flowStatus: "Processing" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(mockGetInvoice).toHaveBeenCalledTimes(1) // só a nota de verdade
    // Avisa UMA VEZ, por OS — e NÃO conta erro do cron todos os dias até o
    // suporte destravar. Foi esse o defeito do vigia de DMARC (15 a 22/09).
    expect(r.erros).toBe(0)
    expect(mockPendencia).toHaveBeenCalledTimes(1)
    expect(mockPendencia.mock.calls[0][0].chave).toBe(`nfse:reserva-presa:${presa.id}`)
    // E ela não some do radar: nfseChecks fica em zero.
    expect((await releu(presa.id))!.nfseChecks).toBe(0)
  })
})

describe("a nota abandonada não estrangula a fila", () => {
  // O defeito: a consulta pega as 30 mais antigas não-finais, e
  // `devePerguntar` descartava em MEMÓRIA as que já passaram de 30 consultas.
  // Trinta abandonadas enchiam as trinta vagas — e o `orderBy` mais-antigas-
  // primeiro garante que fiquem sempre na frente. Nenhuma nota da plataforma
  // era consultada nunca mais. (Achado na auditoria de 13/09/2026; mesmo
  // defeito da fila do NPS.)
  async function nota(nfseChecks: number, iso: string, numero: number) {
    const tenant = await testDb.db.tenant.create({ data: { name: "E", nfeioCompanyId: "co-1" } })
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C" } })
    return testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id, clientId: cliente.id, number: numero, title: "T",
        status: "INVOICED", nfseId: `nf-${numero}`, nfseStatus: "Processing",
        nfseChecks, nfseIssuedAt: new Date(iso),
      },
    })
  }

  it("TRINTA abandonadas não tomam as trinta vagas: a nota nova é atendida", async () => {
    // O cenário exato do defeito, e o único que o prova: com duas notas não há
    // disputa por vaga nenhuma, e o `continue` em memória dá o mesmo resultado
    // do filtro no banco. É preciso ENCHER o `take`.
    //
    // As abandonadas são as mais ANTIGAS — o `orderBy` as põe na frente, então
    // antes do filtro elas ocupavam as trinta vagas e a nota nova nunca era
    // consultada. Nenhuma nota da plataforma seria, nunca mais.
    const tenant = await testDb.db.tenant.create({ data: { name: "E", nfeioCompanyId: "co-1" } })
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C" } })
    const lote = Array.from({ length: MAX_POR_RODADA }, (_, i) => ({
      tenantId: tenant.id, clientId: cliente.id, number: 100 + i, title: "Abandonada",
      status: "INVOICED" as const, nfseId: `velha-${i}`, nfseStatus: "Processing",
      nfseChecks: MAX_CONSULTAS, nfseIssuedAt: new Date(`2026-08-${String(1 + (i % 28)).padStart(2, "0")}T12:00:00Z`),
    }))
    await testDb.db.serviceOrder.createMany({ data: lote })
    const nova = await testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id, clientId: cliente.id, number: 999, title: "Nova",
        status: "INVOICED", nfseId: "nf-nova", nfseStatus: "Processing",
        nfseChecks: 0, nfseIssuedAt: new Date("2026-09-20T12:00:00Z"),
      },
    })
    mockGetInvoice.mockResolvedValue({ id: "nf-nova", flowStatus: "Processing" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.consultadas).toBe(1)
    expect(mockGetInvoice.mock.calls[0][1]).toBe(nova.nfseId)
  })

  it("ao ESGOTAR as tentativas, avisa uma vez — e não vira erro diário", async () => {
    await nota(29, "2026-09-01T12:00:00Z", 3)
    mockGetInvoice.mockResolvedValue({ id: "nf-3", flowStatus: "Processing" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(mockPendencia).toHaveBeenCalledTimes(1)
    expect(mockPendencia.mock.calls[0][0].chave).toMatch(/^nfse:abandonada:/)
    expect(r.erros).toBe(0)
  })

  it("quem ainda tem tentativas não vira pendência", async () => {
    await nota(5, "2026-09-01T12:00:00Z", 4)
    mockGetInvoice.mockResolvedValue({ id: "nf-4", flowStatus: "Processing" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    await conciliarNotasPendentes()

    expect(mockPendencia).not.toHaveBeenCalled()
  })

  it("nota que RESOLVEU na última tentativa não é chamada de abandonada", async () => {
    await nota(29, "2026-09-01T12:00:00Z", 5)
    mockGetInvoice.mockResolvedValue({ id: "nf-5", flowStatus: "Issued", number: "2026/9" })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.emitidas).toBe(1)
    expect(mockPendencia).not.toHaveBeenCalled()
  })
})

describe("o documento que não entrou no arquivo", () => {
  // A prefeitura aceita, a OS é gravada com o estado final e sai da fila do
  // dia seguinte. Se o storage estiver fora naquele minuto, `arquivarNota`
  // engole a falha (ela nunca lança, de propósito) e o resultado era JOGADO
  // FORA: o XML — que é o documento que vale juridicamente, e que a empresa é
  // obrigada a guardar por cinco anos — sumia sem contagem e sem aviso, com o
  // cron marcando o dia como bom. (Achado na auditoria de 13/09/2026.)
  const aceita = () => {
    mockGetInvoice.mockResolvedValue({
      id: "nf-1", flowStatus: "Issued", number: "2026/123",
      pdf: { url: "https://x/nota.pdf" }, xml: { url: "https://x/nota.xml" },
    })
  }

  it("falha ao arquivar é CONTADA, e conta como erro do cron", async () => {
    const { os } = await osComNota("Processing")
    aceita()
    mockArquivar.mockResolvedValue({ pdf: true, xml: false })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.emitidas).toBe(1)
    expect(r.naoArquivadas).toBe(1)
    // Uma tarefa que o cron tentou e não conseguiu — diferente de pendência de
    // configuração, que não toca no `ok` (ver lib/pendencia.ts).
    expect(r.erros).toBe(1)
    // E o estado da nota continua VERDADEIRO: ela foi aceita mesmo.
    expect((await releu(os.id))!.nfseStatus).toBe("Issued")
  })

  it("o endereço do XML fica GRAVADO — sem ele o documento não tem de onde voltar", async () => {
    const { os } = await osComNota("Processing")
    aceita()
    mockArquivar.mockResolvedValue({ pdf: true, xml: false })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    await conciliarNotasPendentes()

    expect((await releu(os.id))!.nfseXmlUrl).toBe("https://x/nota.xml")
  })

  it("arquivando tudo, nada é contado", async () => {
    await osComNota("Processing")
    aceita()
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes()

    expect(r.naoArquivadas).toBe(0)
    expect(r.erros).toBe(0)
  })
})

describe("a segunda fase: o que ficou por arquivar volta amanhã", () => {
  const AGORA = new Date("2026-09-22T12:00:00Z").getTime()
  const relogio = () => AGORA

  async function osAceitaSemXml(diasAtras: number, comPdf = true) {
    const tenant = await testDb.db.tenant.create({ data: { name: "Empresa", nfeioCompanyId: "co-1" } })
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C" } })
    return testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id, clientId: cliente.id, number: 77, title: "Troca",
        status: "INVOICED", nfseId: "nf-9", nfseStatus: "Issued", nfseChecks: 1,
        nfseIssuedAt: new Date(AGORA - diasAtras * 86_400_000),
        nfseUrl: "https://x/nota.pdf",
        nfseXmlUrl: "https://x/nota.xml",
        nfsePdfPath: comPdf ? "notas-fiscais/t/o.pdf" : null,
      },
    })
  }

  it("tenta de novo, e NÃO consulta o emissor — usa o endereço guardado", async () => {
    await osAceitaSemXml(2)
    mockArquivar.mockResolvedValue({ pdf: false, xml: true })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes(10_000, relogio)

    expect(mockGetInvoice).not.toHaveBeenCalled()
    expect(mockArquivar).toHaveBeenCalledTimes(1)
    expect(mockArquivar.mock.calls[0][0]).toMatchObject({
      xmlUrl: "https://x/nota.xml",
      jaTemPdf: true,
    })
    // Deu certo: nada a contar.
    expect(r.naoArquivadas).toBe(0)
  })

  it("falhando de novo, conta de novo — o dono fica sabendo até o dia em que entrar", async () => {
    await osAceitaSemXml(2)
    mockArquivar.mockResolvedValue({ pdf: false, xml: false })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    const r = await conciliarNotasPendentes(10_000, relogio)

    expect(r.naoArquivadas).toBe(1)
    expect(r.erros).toBe(1)
  })

  it("passados 30 dias, para de insistir: a URL do emissor já expirou", async () => {
    await osAceitaSemXml(31)
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    await conciliarNotasPendentes(10_000, relogio)

    expect(mockArquivar).not.toHaveBeenCalled()
  })

  it("nota JÁ arquivada não volta", async () => {
    const tenant = await testDb.db.tenant.create({ data: { name: "E", nfeioCompanyId: "co-1" } })
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C" } })
    await testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id, clientId: cliente.id, number: 78, title: "T",
        status: "INVOICED", nfseId: "nf-8", nfseStatus: "Issued", nfseChecks: 1,
        nfseIssuedAt: new Date(AGORA - 86_400_000),
        nfseXmlUrl: "https://x/nota.xml",
        nfseXmlPath: "notas-fiscais/t/o.xml",
      },
    })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    await conciliarNotasPendentes(10_000, relogio)

    expect(mockArquivar).not.toHaveBeenCalled()
  })

  it("nota ANTIGA, sem endereço do XML guardado, não entra — não há de onde tirar", async () => {
    const tenant = await testDb.db.tenant.create({ data: { name: "E", nfeioCompanyId: "co-1" } })
    const cliente = await testDb.db.client.create({ data: { tenantId: tenant.id, name: "C" } })
    await testDb.db.serviceOrder.create({
      data: {
        tenantId: tenant.id, clientId: cliente.id, number: 79, title: "T",
        status: "INVOICED", nfseId: "nf-7", nfseStatus: "Issued", nfseChecks: 1,
        nfseIssuedAt: new Date(AGORA - 86_400_000),
        nfseUrl: "https://x/nota.pdf",
      },
    })
    const { conciliarNotasPendentes } = await import("@/lib/nfse-conciliar")

    await conciliarNotasPendentes(10_000, relogio)

    expect(mockArquivar).not.toHaveBeenCalled()
  })
})
