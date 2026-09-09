import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Editar uma OS não pode apagar quem a executou.
//
// ─── O defeito ───────────────────────────────────────────────────────────────
//
// `updateServiceOrder` grava `technicianId: technicianId || null`, e o campo é
// `optional()` no schema. O formulário de edição não tinha o campo — só o de
// criar tinha. Resultado: qualquer edição de OS (corrigir um valor, arrumar o
// título, trocar a data) apagava o responsável em silêncio.
//
// O estrago não era só um nome sumindo da tela:
//   - a OS saía da lista e do mapa daquele técnico;
//   - a comissão pendente era APAGADA junto, porque sem responsável não há a
//     quem pagar (ver `decidirComissao` em lib/comissao-db.ts);
//   - o PDF e o portal do cliente perdiam o "responsável";
//   - e não havia tela para devolver o técnico, porque o campo que faltava era
//     justamente o da edição.
//
// Achado ao conferir, contra o código, um texto de manual que descrevia isso
// como se fosse comportamento esperado (09/09/2026). Documentar um defeito com
// cara de regra é a forma mais duradoura de nunca consertá-lo.

let testDb: TestDatabase
const mockGetTenant = vi.fn()

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
    filtroDeFilialAtual: vi.fn().mockResolvedValue({}),
    checarAcao: vi.fn().mockResolvedValue(null),
    getAcoesPermitidas: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
    temFuncao: vi.fn().mockResolvedValue(false),
  }))
  vi.doMock("next/server", () => ({ after: (p: unknown) => p }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string) => chave,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/service-orders")

async function cenario() {
  const tenant = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  const dono = await testDb.db.user.create({
    data: { id: "dono", tenantId: tenant.id, name: "Adriel", email: "a@ex.com", role: "OWNER" },
  })
  const tecnico = await testDb.db.user.create({
    data: { id: "tec", tenantId: tenant.id, name: "Carlos", email: "c@ex.com", role: "TECHNICIAN" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: dono.id, role: "OWNER" })

  const cliente = await testDb.db.client.create({
    data: { tenantId: tenant.id, name: "Dona Maria" },
  })
  const os = await testDb.db.serviceOrder.create({
    data: {
      tenantId: tenant.id,
      clientId: cliente.id,
      technicianId: tecnico.id,
      number: 1,
      title: "Troca de compressor",
      status: "OPEN",
    },
  })
  return { tenant, dono, tecnico, cliente, os }
}

/** Os itens vão num JSON só, no campo `items` — é o que
 *  `service-order-edit-form.tsx` faz antes de submeter. Mandar
 *  `items[0].description` faria a Action ler zero itens, zerar o total, e a
 *  comissão sumiria por motivo legítimo (OS de R$ 0 não comissiona) escondendo
 *  o defeito que este arquivo persegue. */
const ITENS = JSON.stringify([{ description: "Compressor", quantity: 1, unitPrice: 1200 }])

/** O formulário de edição, como ele chega na Action. */
function formulario(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

/** `updateServiceOrder` termina em `redirect()`, que o setup dos testes
 *  transforma em exceção. Sucesso aqui é justamente esse redirect. */
async function editar(id: string, campos: Record<string, string>) {
  const { updateServiceOrder } = await acoes()
  await expect(updateServiceOrder(id, {}, formulario(campos))).rejects.toThrow(
    `REDIRECT:/service-orders/${id}`
  )
}

describe("editar a OS não apaga quem a executou", () => {
  it("o responsável CONTINUA lá depois de mexer só no título", async () => {
    // O caso do dia a dia: alguém corrige um erro de digitação no título.
    // Nada nesse gesto diz "tire o Carlos desta OS".
    const { cliente, os, tecnico } = await cenario()

    await editar(os.id, {
      title: "Troca do compressor",
      clientId: cliente.id,
      technicianId: tecnico.id,
      items: ITENS,
    })

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.technicianId).toBe(tecnico.id)
  })

  it("trocar de responsável continua funcionando", async () => {
    // O campo não pode ser só decorativo: quem edita precisa poder passar a OS
    // para outra pessoa.
    const { tenant, cliente, os } = await cenario()
    const outro = await testDb.db.user.create({
      data: { id: "tec2", tenantId: tenant.id, name: "Rita", email: "r@ex.com", role: "TECHNICIAN" },
    })

    await editar(os.id, {
      title: "Troca de compressor",
      clientId: cliente.id,
      technicianId: outro.id,
      items: ITENS,
    })

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.technicianId).toBe(outro.id)
  })

  it("formulário que NÃO manda o campo não mexe no responsável", async () => {
    // A reprodução exata do defeito. O navegador não envia o que não está no
    // formulário, então a Action recebia `technicianId` ausente e gravava
    // `null` — apagava sem ninguém ter pedido.
    //
    // A correção mora aqui, e não só na tela: toda exportação de um arquivo
    // "use server" é um endereço HTTP que qualquer um pode chamar. Campo que
    // não veio significa "não mexe"; para esvaziar, manda-se vazio.
    const { cliente, os, tecnico } = await cenario()

    await editar(os.id, {
      title: "Troca de compressor",
      clientId: cliente.id,
      items: ITENS,
    })

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.technicianId).toBe(tecnico.id)
  })

  it("a comissão pendente sobrevive a uma edição dessas", async () => {
    // O prejuízo concreto: sem responsável não há a quem pagar, e
    // `sincronizarComissaoDaOs` apaga a conta a pagar. O técnico executou,
    // alguém corrigiu o título da OS, e a comissão dele evaporou.
    const { cliente, os, tecnico, tenant } = await cenario()
    await testDb.db.serviceOrder.update({
      where: { id: os.id },
      data: { status: "DONE", totalAmount: 1200, commissionPct: 10, concludedAt: new Date() },
    })
    const { reconciliarComissao } = await import("@/lib/comissao-db")
    await reconciliarComissao(testDb.db, tenant.id, os.id)

    const comissoes = async () =>
      (await testDb.db.expense.findMany({ select: { orderId: true } })).filter(
        (e) => e.orderId === os.id
      ).length

    expect(await comissoes()).toBe(1)

    await editar(os.id, {
      title: "Troca de compressor (revisado)",
      clientId: cliente.id,
      items: ITENS,
    })

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.technicianId).toBe(tecnico.id)
    expect(await comissoes()).toBe(1)
  })

  it("deixar o responsável EM BRANCO ainda esvazia — de propósito", async () => {
    // "Sem responsável" é um estado legítimo: a OS entrou e ninguém foi
    // designado ainda. O defeito nunca foi permitir isso; foi fazer isso
    // sozinho, sem ninguém ter pedido.
    const { cliente, os } = await cenario()

    await editar(os.id, {
      title: "Troca de compressor",
      clientId: cliente.id,
      technicianId: "",
      items: ITENS,
    })

    const depois = await testDb.db.serviceOrder.findUnique({ where: { id: os.id } })
    expect(depois?.technicianId).toBeNull()
  })
})

describe("o formulário de edição oferece o campo", () => {
  // Teste estrutural, e não de comportamento: o defeito não estava na Action —
  // ela sempre soube gravar o técnico. Estava na AUSÊNCIA do campo na tela, que
  // fazia o navegador mandar `technicianId` vazio em toda edição. Um teste da
  // Action sozinho passa com a tela quebrada, que foi exatamente o que
  // aconteceu por semanas.
  it("service-order-edit-form.tsx tem um select de responsável", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/service-orders/service-order-edit-form.tsx", "utf-8")
    )

    expect(fonte).toContain('name="technicianId"')
    // E precisa vir preenchido com quem já está na OS: um select vazio manda
    // string vazia e reproduz o defeito inteiro pela tela nova.
    expect(fonte).toMatch(/defaultValue=\{order\.technicianId/)
  })

  it("a tela de edição passa a equipe para o formulário", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/(dashboard)/service-orders/[id]/edit/page.tsx", "utf-8")
    )

    expect(fonte).toContain("getTeamMembers")
    expect(fonte).toContain("teamMembers=")
  })
})
