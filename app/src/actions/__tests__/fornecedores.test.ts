import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// O cadastro de FORNECEDOR — quem vende peça para a empresa.
//
// O que se prova AQUI é o que envolve banco: gravar os campos novos, EDITAR sem
// apagar (que era impossível antes), avisar duplicata sem travar, e a diferença
// entre desativar e excluir — que é a diferença entre guardar a história do que
// se comprou e reescrevê-la.

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
  }))
  vi.doMock("@/lib/plan", () => ({
    requireRecurso: vi.fn().mockResolvedValue(undefined),
    temRecurso: vi.fn().mockResolvedValue(true),
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
})

const acoes = () => import("@/actions/fornecedores")

async function empresa(role = "OWNER") {
  const t = await testDb.db.tenant.create({ data: { name: "Polar Clima" } })
  mockGetTenant.mockResolvedValue({ tenantId: t.id, userId: "u1", role })
  return t
}

function form(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

const CNPJ = "11.222.333/0001-81"

describe("cadastrar", () => {
  it("grava a ficha inteira", async () => {
    const t = await empresa()
    const r = await (await acoes()).salvarFornecedor(
      null,
      {},
      form({
        name: "Frio Total",
        legalName: "Frio Total Distribuidora LTDA",
        document: CNPJ,
        category: "Refrigeração",
        contactName: "Seu Zé",
        contactPhone: "(11) 98888-7777",
        city: "São Paulo",
        state: "SP",
        paymentTerms: "30/60",
        leadTimeDays: "7",
        pixKey: "frio@total.com.br",
      })
    )
    expect(r.erro).toBeUndefined()

    const f = (await testDb.db.supplier.findUnique({ where: { id: r.id! } }))!
    expect(f.tenantId).toBe(t.id)
    expect(f.legalName).toBe("Frio Total Distribuidora LTDA")
    expect(f.category).toBe("Refrigeração")
    expect(f.contactName).toBe("Seu Zé")
    expect(f.paymentTerms).toBe("30/60")
    expect(f.leadTimeDays).toBe(7)
    // Nasce ativo: quem acabou de cadastrar quer comprar dele.
    expect(f.active).toBe(true)
  })

  it("guarda o documento COMO FOI DIGITADO e também só os dígitos", async () => {
    // O texto é o que a pessoa reconhece ao reler; os dígitos são a forma
    // comparável, que descobre o mesmo CNPJ cadastrado de dois jeitos.
    await empresa()
    const r = await (await acoes()).salvarFornecedor(null, {}, form({ name: "Frio", document: CNPJ }))
    const f = (await testDb.db.supplier.findUnique({ where: { id: r.id! } }))!
    expect(f.document).toBe(CNPJ)
    expect(f.documentDigits).toBe("11222333000181")
  })

  it("exige nome", async () => {
    await empresa()
    expect((await (await acoes()).salvarFornecedor(null, {}, form({ name: "F" }))).erro).toBe(
      "nomeObrigatorio"
    )
  })

  it("recusa documento PREENCHIDO e inválido", async () => {
    // Documento errado é pior que em branco: parece certo, e vai parar no
    // boleto e na nota.
    await empresa()
    const r = await (await acoes()).salvarFornecedor(
      null,
      {},
      form({ name: "Frio", document: "11.222.333/0001-82" })
    )
    expect(r.erro).toBe("documentoInvalido")
    expect(await testDb.db.supplier.count()).toBe(0)
  })

  it("documento VAZIO passa, porque o campo é opcional", async () => {
    // Recusar transformaria "ainda não tenho os dados" em "não posso cadastrar".
    await empresa()
    const r = await (await acoes()).salvarFornecedor(null, {}, form({ name: "Loja da esquina" }))
    expect(r.erro).toBeUndefined()
    expect((await testDb.db.supplier.findUnique({ where: { id: r.id! } }))!.documentDigits).toBeNull()
  })

  it("prazo de entrega inválido vira null, e não quebra", async () => {
    await empresa()
    const r = await (await acoes()).salvarFornecedor(
      null,
      {},
      form({ name: "Frio", leadTimeDays: "abc" })
    )
    expect((await testDb.db.supplier.findUnique({ where: { id: r.id! } }))!.leadTimeDays).toBeNull()
  })

  it("técnico não cadastra", async () => {
    await empresa("TECHNICIAN")
    expect((await (await acoes()).salvarFornecedor(null, {}, form({ name: "Frio" }))).erro).toBe(
      "semPermissao"
    )
  })
})

describe("editar — o que era impossível", () => {
  it("corrige o telefone sem apagar nada", async () => {
    // Antes disto, a única forma de corrigir um dado errado era APAGAR e
    // cadastrar de novo — e apagar levava junto a participação do fornecedor
    // em cotações já fechadas.
    await empresa()
    const a = await acoes()
    const r = await a.salvarFornecedor(null, {}, form({ name: "Frio Total", phone: "1199999" }))

    await a.salvarFornecedor(r.id!, {}, form({ name: "Frio Total", phone: "(11) 3333-4444" }))

    const f = (await testDb.db.supplier.findUnique({ where: { id: r.id! } }))!
    expect(f.phone).toBe("(11) 3333-4444")
    expect(await testDb.db.supplier.count()).toBe(1)
  })

  it("NÃO edita fornecedor de outra empresa", async () => {
    await empresa()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    const alheio = await testDb.db.supplier.create({
      data: { tenantId: outra.id, name: "Alheio" },
    })

    const r = await (await acoes()).salvarFornecedor(alheio.id, {}, form({ name: "Roubado" }))
    expect(r.erro).toBe("naoEncontrado")
    expect((await testDb.db.supplier.findUnique({ where: { id: alheio.id } }))!.name).toBe("Alheio")
  })
})

describe("o mesmo CNPJ duas vezes", () => {
  it("AVISA, e não trava", async () => {
    // Travar deixaria a pessoa sem saída no meio do cadastro, e há motivo
    // legítimo — matriz e filial do mesmo grupo. Mas o mesmo documento em duas
    // fichas divide o histórico de compras do fornecedor em duas.
    await empresa()
    const a = await acoes()
    await a.salvarFornecedor(null, {}, form({ name: "Frio Total", document: CNPJ }))
    const r = await a.salvarFornecedor(null, {}, form({ name: "Frio Total SP", document: CNPJ }))

    expect(r.erro).toBeUndefined()
    expect(r.aviso).toBe("documentoRepetido")
    expect(await testDb.db.supplier.count()).toBe(2)
  })

  it("editar o PRÓPRIO fornecedor não se acusa de duplicata", async () => {
    // Senão salvar a mesma ficha duas vezes avisaria que ela é cópia de si
    // mesma, e o aviso perderia o sentido.
    await empresa()
    const a = await acoes()
    const r = await a.salvarFornecedor(null, {}, form({ name: "Frio", document: CNPJ }))
    const r2 = await a.salvarFornecedor(r.id!, {}, form({ name: "Frio Total", document: CNPJ }))
    expect(r2.aviso).toBeUndefined()
  })
})

describe("desativar não é excluir", () => {
  it("desativado some das escolhas e mantém o histórico", async () => {
    await empresa()
    const a = await acoes()
    const r = await a.salvarFornecedor(null, {}, form({ name: "Frio Total" }))

    await a.alternarFornecedor(r.id!)
    const f = (await testDb.db.supplier.findUnique({ where: { id: r.id! } }))!
    expect(f.active).toBe(false)
    expect(f.deactivatedAt).not.toBeNull()

    // Some da lista de escolha, continua na listagem geral.
    expect(await a.getFornecedoresAtivos()).toHaveLength(0)
    expect(await a.getFornecedores()).toHaveLength(1)

    // E volta, limpando a data.
    await a.alternarFornecedor(r.id!)
    expect((await testDb.db.supplier.findUnique({ where: { id: r.id! } }))!.deactivatedAt).toBeNull()
  })

  it("fornecedor COM cotação não pode ser excluído", async () => {
    // O defeito que isto fecha: a chave estrangeira era CASCADE, então apagar
    // o fornecedor apagava em silêncio a participação dele em toda cotação e
    // os preços que ele deu.
    const t = await empresa()
    const a = await acoes()
    const r = await a.salvarFornecedor(null, {}, form({ name: "Frio Total" }))

    const cot = await testDb.db.quotation.create({
      data: { tenantId: t.id, number: 1, title: "Reposição" },
    })
    await testDb.db.quotationParticipant.create({
      data: { quotationId: cot.id, supplierId: r.id! },
    })

    expect((await a.excluirFornecedor(r.id!)).erro).toBe("temHistorico")
    expect(await testDb.db.supplier.count()).toBe(1)
    expect(await testDb.db.quotationParticipant.count()).toBe(1)
  })

  it("fornecedor COM compra também não", async () => {
    const t = await empresa()
    const a = await acoes()
    const r = await a.salvarFornecedor(null, {}, form({ name: "Frio Total" }))
    await testDb.db.purchaseOrder.create({
      data: { tenantId: t.id, number: 1, supplierId: r.id! },
    })

    expect((await a.excluirFornecedor(r.id!)).erro).toBe("temHistorico")
  })

  it("o banco RECUSA o apagão mesmo se alguém escapar da Action", async () => {
    // A trava de verdade. A regra na Action é a mensagem boa; a do banco é a
    // que vale para quem chamar o Prisma direto.
    const t = await empresa()
    const f = await testDb.db.supplier.create({ data: { tenantId: t.id, name: "Frio" } })
    const cot = await testDb.db.quotation.create({
      data: { tenantId: t.id, number: 1, title: "Reposição" },
    })
    await testDb.db.quotationParticipant.create({
      data: { quotationId: cot.id, supplierId: f.id },
    })

    await expect(testDb.db.supplier.delete({ where: { id: f.id } })).rejects.toThrow()
  })

  it("fornecedor SEM histórico o dono pode excluir", async () => {
    await empresa()
    const a = await acoes()
    const r = await a.salvarFornecedor(null, {}, form({ name: "Cadastrado por engano" }))
    expect((await a.excluirFornecedor(r.id!)).erro).toBeUndefined()
    expect(await testDb.db.supplier.count()).toBe(0)
  })

  it("administrador desativa, mas não exclui", async () => {
    await empresa("ADMIN")
    const a = await acoes()
    const r = await a.salvarFornecedor(null, {}, form({ name: "Frio" }))
    expect((await a.alternarFornecedor(r.id!)).erro).toBeUndefined()
    expect((await a.excluirFornecedor(r.id!)).erro).toBe("semPermissao")
  })
})

describe("a busca", () => {
  async function tres() {
    await empresa()
    const a = await acoes()
    await a.salvarFornecedor(null, {}, form({ name: "Frio Total", category: "Refrigeração", document: CNPJ }))
    await a.salvarFornecedor(null, {}, form({ name: "Refrisul", city: "Curitiba" }))
    await a.salvarFornecedor(null, {}, form({ name: "Elétrica ABC", contactName: "Dona Maria" }))
    return a
  }

  it("acha por nome, ramo, cidade e contato", async () => {
    const a = await tres()
    expect((await a.getFornecedores({ q: "frio" })).map((f) => f.name)).toEqual(["Frio Total"])
    expect((await a.getFornecedores({ q: "refriger" })).map((f) => f.name)).toEqual(["Frio Total"])
    expect((await a.getFornecedores({ q: "curitiba" })).map((f) => f.name)).toEqual(["Refrisul"])
    expect((await a.getFornecedores({ q: "maria" })).map((f) => f.name)).toEqual(["Elétrica ABC"])
  })

  it("acha por documento SEM depender da pontuação", async () => {
    const a = await tres()
    expect((await a.getFornecedores({ q: "11222333" })).map((f) => f.name)).toEqual(["Frio Total"])
  })

  it("filtra por situação", async () => {
    const a = await tres()
    const todos = await a.getFornecedores()
    await a.alternarFornecedor(todos[0].id)

    expect(await a.getFornecedores({ situacao: "INATIVO" })).toHaveLength(1)
    expect(await a.getFornecedores({ situacao: "ATIVO" })).toHaveLength(2)
  })

  it("não enxerga fornecedor de outra empresa", async () => {
    const a = await tres()
    const outra = await testDb.db.tenant.create({ data: { name: "Outra" } })
    await testDb.db.supplier.create({ data: { tenantId: outra.id, name: "Frio Alheio" } })

    expect((await a.getFornecedores({ q: "frio" })).map((f) => f.name)).toEqual(["Frio Total"])
  })
})
