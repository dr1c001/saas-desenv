import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"
import { CARGOS_ATRIBUIVEIS } from "@/lib/cargos"

// A aba Equipe deixa de ser só "convidar e remover".
//
// ─── Os quatro defeitos ──────────────────────────────────────────────────────
//
// 1. O CONVITE ERA A ÚNICA PORTA, E ELA FECHAVA. O link do e-mail levava direto
//    ao /dashboard: a pessoa entrava pela sessão que o link criou e nunca
//    definia senha. Na volta, ia ao e-mail e clicava no link de novo — só que
//    os links do Supabase são de uso único e expiram. Quando expirava, o
//    integrante ficava trancado para fora da empresa que paga, e nem reconvidar
//    resolvia: `inviteTeamMember` recusa e-mail que já está na equipe. O único
//    caminho era REMOVER a pessoa (apagando o vínculo das OS e do histórico) e
//    convidar de novo.
//
// 2. O SELETOR DE CARGO DA LISTA OFERECIA DOIS DE OITO. A tela de convite já
//    montava os oito cargos a partir de `CARGOS_ATRIBUIVEIS` desde 24/08/2026;
//    o seletor da linha ficou com ADMIN e TECHNICIAN escritos à mão. Um gerente
//    ou um financeiro convidado corretamente aparecia com o cargo EM BRANCO —
//    nenhum item batia com o valor — e só podia virar técnico ou administrador.
//    Décima quinta aparição do mesmo padrão: recurso construído, cobrado e
//    inalcançável pela tela.
//
// 3. NÃO HAVIA COMO EDITAR O CADASTRO. Nome, documento, telefone e endereço
//    eram pedidos no convite e nunca mais podiam ser corrigidos.
//
// 4. NÃO HAVIA BUSCA. Com trinta pessoas (o teto do Enterprise), achar alguém
//    era rolar a lista.
//
// (Tudo relatado pelo dono da plataforma em 23/09/2026.)

let testDb: TestDatabase
const mockGetTenant = vi.fn()
let pedidos: { url: string; corpo: Record<string, unknown> | null }[] = []
let enviados: { para: string; link: string }[] = []
let confirmado = false

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
  vi.doMock("@/lib/auth", () => ({
    getTenant: mockGetTenant,
    requireActiveSubscription: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
    clientIp: vi.fn().mockResolvedValue("1.2.3.4"),
  }))
  vi.doMock("@/lib/resend", () => ({
    sendTeamInviteEmail: vi.fn(async (para: string, _n: string, _e: string, link: string) => {
      enviados.push({ para, link })
      return true
    }),
  }))
  vi.doMock("@/lib/i18n", () => ({ getTranslator: () => (c: string) => c }))
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }))
  vi.doMock("next-intl/server", () => ({
    getTranslations: async () => (chave: string, vars?: Record<string, unknown>) =>
      vars ? `${chave}:${JSON.stringify(vars)}` : chave,
  }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
  mockGetTenant.mockReset()
  pedidos = []
  enviados = []
  confirmado = false
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co"
  process.env.NEXT_PUBLIC_APP_URL = "https://servicoos.com.br"

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const corpo = init?.body ? JSON.parse(String(init.body)) : null
      pedidos.push({ url: String(url), corpo })
      // Consulta do estado da conta (já confirmou o e-mail?).
      if (String(url).includes("/admin/users/")) {
        return {
          ok: true,
          json: async () => (confirmado ? { email_confirmed_at: "2026-09-01T00:00:00Z" } : {}),
          text: async () => "",
        } as unknown as Response
      }
      return {
        ok: true,
        json: async () => ({ id: `sup-${pedidos.length}`, hashed_token: `tok-${pedidos.length}` }),
        text: async () => "",
      } as unknown as Response
    })
  )
})

async function empresa() {
  const plano = await testDb.db.plan.upsert({
    where: { slug: "pro" },
    update: {},
    create: { slug: "pro", name: "Pro", priceMonthly: 197, priceYearly: 1970, maxUsers: 10, features: [] },
  })
  const tenant = await testDb.db.tenant.create({
    data: { name: "Polar Clima", planId: plano.id, subscriptionStatus: "ACTIVE" },
  })
  const dono = await testDb.db.user.create({
    data: { id: `${tenant.id}-dono`, name: "Adriel", email: `dono.${tenant.id}@x.com`, tenantId: tenant.id, role: "OWNER" },
  })
  mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: dono.id, role: "OWNER", locale: "pt" })
  return { tenant, dono }
}

async function integrante(tenantId: string, dados: { nome: string; email: string; cargo: string }) {
  return testDb.db.user.create({
    data: {
      id: `${tenantId}-${dados.email}`,
      name: dados.nome,
      email: dados.email,
      tenantId,
      role: dados.cargo as never,
    },
  })
}

function convite(email: string, cargo = "TECHNICIAN") {
  const fd = new FormData()
  fd.set("name", "Nova Pessoa")
  fd.set("email", email)
  fd.set("role", cargo)
  return fd
}

const geracoes = () => pedidos.filter((p) => p.url.includes("generate_link"))

describe("o convite leva a pessoa a criar a PRÓPRIA senha", () => {
  it("o link do e-mail termina em /criar-senha, e não no painel", async () => {
    // O defeito nº 1 deste arquivo, na linha que o causava.
    await empresa()
    const { inviteTeamMember } = await import("@/actions/team")

    await inviteTeamMember({}, convite("novo@x.com"))

    expect(enviados).toHaveLength(1)
    expect(enviados[0].link).toContain("next=/criar-senha")
    expect(enviados[0].link).not.toContain("next=/dashboard")
  })

  it("e o link continua sendo o hashed_token, verificado no servidor", async () => {
    // Não é detalhe de implementação: o action_link do Supabase entrega a
    // sessão por FRAGMENTO de URL, que nunca chega ao servidor. Trocar um pelo
    // outro quebra o convite inteiro, e em silêncio.
    await empresa()
    const { inviteTeamMember } = await import("@/actions/team")

    await inviteTeamMember({}, convite("novo@x.com"))

    expect(enviados[0].link).toContain("/api/auth/confirm?token_hash=tok-")
    expect(enviados[0].link).toContain("type=invite")
  })
})

describe("quando o Supabase responde 200 com um erro no corpo", () => {
  it("ninguém entra na equipe — e a mensagem diz o motivo", async () => {
    // Acontece: o GoTrue devolve 200 com `{ msg: ... }` e nenhum id. Sem a
    // conferência, o `upsert` receberia `id: undefined` e a equipe ganharia
    // uma linha que não corresponde a conta nenhuma.
    const { tenant } = await empresa()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ msg: "Signups not allowed for this instance" }),
        text: async () => "",
      }) as unknown as Response)
    )
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("novo@x.com"))

    expect(r.success).toBeFalsy()
    expect(await testDb.db.user.count({ where: { tenantId: tenant.id } })).toBe(1)
    expect(enviados).toHaveLength(0)
    // E o dono lê O MOTIVO, não só "erro ao enviar convite". O texto do
    // Supabase vem entre parênteses, e nunca como chave de tradução: passá-lo
    // ao getTranslations mostraria "errors.Signups not allowed for this
    // instance" na tela.
    expect(r.message).toContain("errors.inviteFailed")
    expect(r.message).toContain("Signups not allowed for this instance")
  })
})

describe("reenviar o convite", () => {
  it("manda outro link para quem NUNCA confirmou — sem apagar ninguém", async () => {
    const { tenant } = await empresa()
    const m = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "FINANCEIRO" })
    const { reenviarConvite } = await import("@/actions/team")

    const r = await reenviarConvite(m.id)

    expect(r.success).toBe(true)
    expect(enviados.at(-1)!.para).toBe("rita@x.com")
    expect(enviados.at(-1)!.link).toContain("next=/criar-senha")
    expect(geracoes().at(-1)!.corpo!.type).toBe("invite")
    // O ponto: a pessoa continua lá, com o mesmo id — é o id que amarra OS,
    // histórico e localização.
    expect(await testDb.db.user.findUnique({ where: { id: m.id } })).not.toBeNull()
  })

  it("para quem JÁ entrou alguma vez, usa recovery — o GoTrue recusa convidar duas vezes", async () => {
    const { tenant } = await empresa()
    const m = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "GERENTE" })
    confirmado = true
    const { reenviarConvite } = await import("@/actions/team")

    const r = await reenviarConvite(m.id)

    expect(r.success).toBe(true)
    expect(geracoes().at(-1)!.corpo!.type).toBe("recovery")
    // E o destino é o mesmo: quem pede "reenviar convite" quer que a pessoa
    // consiga entrar, não descobrir de que tipo é o link.
    expect(enviados.at(-1)!.link).toContain("next=/criar-senha")
  })

  it("se o tipo escolhido for recusado, tenta o outro em vez de desistir", async () => {
    // A escolha depende de um campo do GoTrue (`email_confirmed_at`). Errá-la
    // deixaria o dono com um botão que só sabe falhar — o defeito que este
    // botão veio resolver.
    const { tenant } = await empresa()
    const m = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    let primeira = true
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const corpo = init?.body ? JSON.parse(String(init.body)) : null
        pedidos.push({ url: String(url), corpo })
        if (String(url).includes("/admin/users/")) {
          return { ok: true, json: async () => ({}), text: async () => "" } as unknown as Response
        }
        if (primeira) {
          primeira = false
          return {
            ok: false,
            status: 422,
            json: async () => ({ msg: "User already registered" }),
            text: async () => "User already registered",
          } as unknown as Response
        }
        return {
          ok: true,
          json: async () => ({ id: "sup-x", hashed_token: "tok-x" }),
          text: async () => "",
        } as unknown as Response
      })
    )
    const { reenviarConvite } = await import("@/actions/team")

    const r = await reenviarConvite(m.id)

    expect(r.success).toBe(true)
    expect(geracoes().map((g) => g.corpo!.type)).toEqual(["invite", "recovery"])
    expect(enviados.at(-1)!.link).toContain("type=recovery")
  })

  it("quem não é dono nem administrador não reenvia", async () => {
    const { tenant } = await empresa()
    const m = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "qualquer", role: "GERENTE", locale: "pt" })
    const { reenviarConvite } = await import("@/actions/team")

    const r = await reenviarConvite(m.id)

    expect(r.success).toBeFalsy()
    expect(enviados).toHaveLength(0)
  })

  it("e ninguém reenvia para integrante de OUTRA empresa", async () => {
    const outra = await empresa()
    const alheio = await integrante(outra.tenant.id, { nome: "Alheio", email: "alheio@x.com", cargo: "TECHNICIAN" })
    await empresa() // a sessão passa a ser da segunda empresa
    const { reenviarConvite } = await import("@/actions/team")

    const r = await reenviarConvite(alheio.id)

    expect(r.message).toContain("memberNotFound")
    expect(enviados).toHaveLength(0)
  })
})

describe("editar o cadastro de quem já está na equipe", () => {
  function formEdicao(memberId: string, campos: Record<string, string>) {
    const fd = new FormData()
    fd.set("memberId", memberId)
    for (const [k, v] of Object.entries(campos)) fd.set(k, v)
    return fd
  }

  it("grava nome, cargo, documento, telefone e endereço", async () => {
    const { tenant } = await empresa()
    const m = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    const { atualizarIntegrante } = await import("@/actions/team")

    const r = await atualizarIntegrante(
      {},
      formEdicao(m.id, {
        name: "Rita Souza",
        role: "FINANCEIRO",
        document: "123.456.789-00",
        phone: "(19) 99999-0000",
        street: "Rua das Flores",
        number: "42",
        city: "Piracicaba",
        state: "SP",
        zipCode: "13400-000",
      })
    )

    expect(r.success).toBe(true)
    const depois = await testDb.db.user.findUnique({
      where: { id: m.id },
      include: { userAddress: true },
    })
    expect(depois!.name).toBe("Rita Souza")
    expect(depois!.role).toBe("FINANCEIRO")
    expect(depois!.document).toBe("123.456.789-00")
    expect(depois!.userAddress!.city).toBe("Piracicaba")
  })

  it("o e-mail NÃO muda por aqui — é o login da pessoa no Supabase", async () => {
    // E é também o que fecha um caminho de escalada: com o e-mail editável, um
    // ADMIN trocaria o endereço do PROPRIETÁRIO pelo próprio, clicaria em
    // "Reenviar convite" e receberia na caixa dele um link para definir a senha
    // do dono. A trava de cargo sozinha não fecharia isso.
    const { tenant } = await empresa()
    const m = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    const { atualizarIntegrante } = await import("@/actions/team")

    await atualizarIntegrante({}, formEdicao(m.id, { name: "Rita", role: "TECHNICIAN", email: "outra@x.com" }))

    expect((await testDb.db.user.findUnique({ where: { id: m.id } }))!.email).toBe("rita@x.com")
  })

  it("ninguém rebaixa o DONO", async () => {
    // A mesma trava de updateTeamMemberRole. Sem ela, um administrador tira o
    // OWNER da empresa que paga — e o que acontece depois está escrito em
    // o-dono-nao-se-remove.test.ts.
    const { tenant, dono } = await empresa()
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "outro-admin", role: "ADMIN", locale: "pt" })
    const { atualizarIntegrante } = await import("@/actions/team")

    const r = await atualizarIntegrante({}, formEdicao(dono.id, { name: "Adriel", role: "TECHNICIAN" }))

    expect(r.success).toBeFalsy()
    expect((await testDb.db.user.findUnique({ where: { id: dono.id } }))!.role).toBe("OWNER")
  })

  it("e ninguém muda o PRÓPRIO cargo", async () => {
    const { tenant } = await empresa()
    const eu = await integrante(tenant.id, { nome: "Admin", email: "admin@x.com", cargo: "ADMIN" })
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: eu.id, role: "ADMIN", locale: "pt" })
    const { atualizarIntegrante } = await import("@/actions/team")

    const r = await atualizarIntegrante({}, formEdicao(eu.id, { name: "Admin", role: "GERENTE" }))

    expect(r.success).toBeFalsy()
    expect((await testDb.db.user.findUnique({ where: { id: eu.id } }))!.role).toBe("ADMIN")
  })

  it("mas cada um corrige o próprio nome e telefone", async () => {
    // A trava é sobre CARGO. Travar o cadastro inteiro faria a pessoa depender
    // do dono para corrigir o próprio telefone.
    const { tenant } = await empresa()
    const eu = await integrante(tenant.id, { nome: "Admin", email: "admin@x.com", cargo: "ADMIN" })
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: eu.id, role: "ADMIN", locale: "pt" })
    const { atualizarIntegrante } = await import("@/actions/team")

    const r = await atualizarIntegrante(
      {},
      formEdicao(eu.id, { name: "Admin Corrigido", role: "ADMIN", phone: "(19) 98888-0000" })
    )

    expect(r.success).toBe(true)
    const depois = await testDb.db.user.findUnique({ where: { id: eu.id } })
    expect(depois!.name).toBe("Admin Corrigido")
    expect(depois!.phone).toBe("(19) 98888-0000")
  })

  it("integrante de outra empresa não é editável", async () => {
    const outra = await empresa()
    const alheio = await integrante(outra.tenant.id, { nome: "Alheio", email: "alheio@x.com", cargo: "TECHNICIAN" })
    await empresa()
    const { atualizarIntegrante } = await import("@/actions/team")

    const r = await atualizarIntegrante({}, formEdicao(alheio.id, { name: "Invadido", role: "ADMIN" }))

    expect(r.success).toBeFalsy()
    expect((await testDb.db.user.findUnique({ where: { id: alheio.id } }))!.name).toBe("Alheio")
  })
})

describe("a busca da aba Equipe", () => {
  async function comEquipe() {
    const { tenant } = await empresa()
    await integrante(tenant.id, { nome: "Rita Souza", email: "rita@polar.com", cargo: "FINANCEIRO" })
    await integrante(tenant.id, { nome: "Carlos Lima", email: "carlos@polar.com", cargo: "TECHNICIAN" })
    return tenant
  }

  it("acha por nome, sem depender de maiúscula", async () => {
    await comEquipe()
    const { getTeamMembers } = await import("@/actions/team")

    // "SOUZA" só existe no NOME (o e-mail é rita@polar.com) e só em caixa
    // diferente. Buscar "rita" aqui não provaria nada: o filtro de e-mail
    // acharia sozinho, e um `contains` sem `mode: "insensitive"` passaria
    // despercebido — foi o que este teste deixou passar na primeira escrita.
    const achados = await getTeamMembers({ q: "SOUZA" })

    expect(achados.map((m) => m.name)).toEqual(["Rita Souza"])
  })

  it("acha por e-mail", async () => {
    await comEquipe()
    const { getTeamMembers } = await import("@/actions/team")

    expect((await getTeamMembers({ q: "carlos@" })).map((m) => m.name)).toEqual(["Carlos Lima"])
  })

  it("sem busca, traz a equipe inteira", async () => {
    await comEquipe()
    const { getTeamMembers } = await import("@/actions/team")

    expect(await getTeamMembers()).toHaveLength(3)
    // Espaço em branco não é busca: quem apaga o campo vê todo mundo de novo.
    expect(await getTeamMembers({ q: "   " })).toHaveLength(3)
  })

  it("e a busca NÃO atravessa empresas", async () => {
    const outra = await empresa()
    await integrante(outra.tenant.id, { nome: "Rita Alheia", email: "rita@outra.com", cargo: "ADMIN" })
    await comEquipe()
    const { getTeamMembers } = await import("@/actions/team")

    const achados = await getTeamMembers({ q: "rita" })

    expect(achados.map((m) => m.name)).toEqual(["Rita Souza"])
  })

  it("continua sem devolver as COORDENADAS de ninguém", async () => {
    // A trava de 13/09/2026 vale também no caminho novo: a busca não pode ser
    // a porta que devolve a localização que as outras três fecharam.
    const t = await comEquipe()
    const alguem = await testDb.db.user.findFirst({ where: { tenantId: t.id, role: "TECHNICIAN" } })
    await testDb.db.userLocation.create({
      data: { userId: alguem!.id, latitude: -22.7, longitude: -47.6 },
    })
    const { getTeamMembers } = await import("@/actions/team")

    const [achado] = await getTeamMembers({ q: "carlos" })

    expect(achado.location).not.toBeNull()
    expect(achado.location).not.toHaveProperty("latitude")
    expect(achado.location).not.toHaveProperty("longitude")
  })
})

describe("o seletor de cargo da lista oferece TODOS os cargos", () => {
  // Estrutural: o componente é client-side e o defeito era a LISTA DE OPÇÕES.
  // Montar React aqui provaria menos que ler a fonte — o que se quer travar é
  // que ninguém volte a escrever os cargos à mão. Mesma convenção de
  // cron-resumo.test.ts e a-aba-decide-o-cargo.test.ts.
  const ler = () =>
    import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/team/team-row-actions.tsx", "utf-8")
    )

  it("monta as opções a partir do catálogo, como a tela de convite", async () => {
    const fonte = await ler()
    expect(fonte).toContain("CARGOS_ATRIBUIVEIS.map")
  })

  it("e não sobrou nenhum cargo escrito à mão", async () => {
    const fonte = await ler()
    for (const cargo of CARGOS_ATRIBUIVEIS) {
      expect(fonte, cargo).not.toContain(`<SelectItem value="${cargo}">`)
    }
  })

  it("e na PRÓPRIA linha, cargo e remoção ficam desligados", async () => {
    // As duas Actions já recusavam (`memberId === userId`) e voltavam caladas:
    // os controles apareciam, a pessoa usava, e nada acontecia. O mesmo
    // "a tela promete e o código recusa" que esta aba veio corrigir.
    const fonte = await ler()
    expect(fonte).toContain("disabled={isPending || ehVoce}")
    expect(fonte).not.toMatch(/onValueChange=\{handleRoleChange\}\s+disabled=\{isPending\}/)
  })

  it("a mesma regra vale na tela de edição", async () => {
    const fonte = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/team/team-edit-form.tsx", "utf-8")
    )
    expect(fonte).toContain("CARGOS_ATRIBUIVEIS.map")
  })
})

describe("o que a revisão pré-deploy de 23/09/2026 encontrou", () => {
  // Cinco defeitos introduzidos junto com esta aba, todos da mesma classe:
  // a TELA barrava e a Server Action não — e Action é endereço HTTP próprio.

  it("getTeamMember NÃO entrega CPF, telefone e endereço a qualquer colega", async () => {
    // Devolve dado pessoal (LGPD). Nasceu só com tenant + assinatura, como as
    // leituras antigas deste arquivo; a única trava de cargo estava na página
    // /team/[id]/edit, que não protege a chamada HTTP direta. É a mesma porta
    // que a auditoria de 13/09/2026 fechou para as coordenadas de GPS.
    const { tenant } = await empresa()
    const outro = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "ADMIN" })
    await testDb.db.user.update({
      where: { id: outro.id },
      data: { document: "123.456.789-00", phone: "(19) 91111-1111" },
    })
    const bisbilhoteiro = await integrante(tenant.id, { nome: "Zé", email: "ze@x.com", cargo: "TECHNICIAN" })
    mockGetTenant.mockResolvedValue({
      tenantId: tenant.id, userId: bisbilhoteiro.id, role: "TECHNICIAN", locale: "pt",
    })
    const { getTeamMember } = await import("@/actions/team")

    expect(await getTeamMember(outro.id)).toBeNull()
  })

  it("mas cada um lê o PRÓPRIO cadastro — é o que a tela de edição carrega", async () => {
    const { tenant } = await empresa()
    const eu = await integrante(tenant.id, { nome: "Zé", email: "ze@x.com", cargo: "TECHNICIAN" })
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: eu.id, role: "TECHNICIAN", locale: "pt" })
    const { getTeamMember } = await import("@/actions/team")

    expect((await getTeamMember(eu.id))!.name).toBe("Zé")
  })

  it("reenviar convite NÃO tem o dono como alvo", async () => {
    // Um ADMIN disparava, até cinco vezes por hora, um e-mail oficial de "crie
    // sua senha" na caixa de quem paga. As duas Actions irmãs já recusavam
    // quando o alvo é OWNER; esta lia o cargo e não olhava.
    const { tenant, dono } = await empresa()
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: "outro-admin", role: "ADMIN", locale: "pt" })
    const { reenviarConvite } = await import("@/actions/team")

    const r = await reenviarConvite(dono.id)

    expect(r.success).toBeFalsy()
    expect(enviados).toHaveLength(0)
  })

  it("convidar com o e-mail em OUTRA CAIXA não rouba a pessoa de outra empresa", async () => {
    // O Supabase normaliza e-mail para minúsculas: "Rita@X.com" e "rita@x.com"
    // são a mesma conta lá, e o generate_link devolve o id que já existe. Com a
    // comparação sensível a caixa, a checagem não achava nada e o upsert — cujo
    // `where` é só o id — executava `update: { tenantId }`.
    const outra = await empresa()
    const vitima = await integrante(outra.tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    const nossa = await empresa()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        // O Supabase devolve o id da conta que JÁ existe.
        json: async () => ({ id: vitima.id, hashed_token: "tok-x" }),
        text: async () => "",
      }) as unknown as Response)
    )
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("Rita@X.com"))

    expect(r.success).toBeFalsy()
    const depois = await testDb.db.user.findUnique({ where: { id: vitima.id } })
    expect(depois!.tenantId).toBe(outra.tenant.id)
    expect(depois!.role).toBe("TECHNICIAN")
    expect(await testDb.db.user.count({ where: { tenantId: nossa.tenant.id } })).toBe(1)
  })

  // As duas travas do sequestro cobrem cenários DIFERENTES, e o teste acima
  // não distingue: com o Supabase devolvendo o id da vítima, qualquer uma das
  // duas basta. Os dois casos abaixo isolam cada uma.

  it("— só a comparação sem caixa salva: e-mail repetido, id NOVO", async () => {
    // Aqui o Supabase devolve um id inédito, então a trava por id não vê nada.
    // Sem a comparação sem caixa, nasceria uma SEGUNDA linha de User para a
    // mesma pessoa (o `@unique` do Postgres trata "Rita@X.com" e "rita@x.com"
    // como valores diferentes).
    const outra = await empresa()
    await integrante(outra.tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    const nossa = await empresa()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: "id-inedito-do-supabase", hashed_token: "tok-x" }),
        text: async () => "",
      }) as unknown as Response)
    )
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("Rita@X.com"))

    expect(r.success).toBeFalsy()
    expect(await testDb.db.user.count({ where: { tenantId: nossa.tenant.id } })).toBe(1)
  })

  it("— só a trava por id salva: e-mail DIFERENTE, mesma conta no Supabase", async () => {
    // O GoTrue pode mapear endereços distintos para a mesma conta (alias,
    // sub-endereçamento com +). A comparação por e-mail não acha nada, e o
    // `where: { id }` do upsert faria `update: { tenantId }` na vítima.
    const outra = await empresa()
    const vitima = await integrante(outra.tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    const nossa = await empresa()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: vitima.id, hashed_token: "tok-x" }),
        text: async () => "",
      }) as unknown as Response)
    )
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("rita+equipe@x.com"))

    expect(r.success).toBeFalsy()
    expect((await testDb.db.user.findUnique({ where: { id: vitima.id } }))!.tenantId).toBe(outra.tenant.id)
    expect(await testDb.db.user.count({ where: { tenantId: nossa.tenant.id } })).toBe(1)
  })

  it("editar o cadastro do DONO grava — o cargo ausente mantém o atual", async () => {
    // O <Select> desligado não submete, e o hidden que compensava mandava
    // role="OWNER", que CARGOS_ATRIBUIVEIS recusa de propósito: o zod derrubava
    // o formulário inteiro e corrigir o telefone do dono não gravava nada nem
    // dizia nada.
    const { tenant, dono } = await empresa()
    const { atualizarIntegrante } = await import("@/actions/team")
    const fd = new FormData()
    fd.set("memberId", dono.id)
    fd.set("name", "Adriel Wellington")
    fd.set("phone", "(19) 98888-0000")

    const r = await atualizarIntegrante({}, fd)

    expect(r.success).toBe(true)
    const depois = await testDb.db.user.findUnique({ where: { id: dono.id } })
    expect(depois!.name).toBe("Adriel Wellington")
    expect(depois!.phone).toBe("(19) 98888-0000")
    // E o cargo continua OWNER: ausente quer dizer "mantenha".
    expect(depois!.role).toBe("OWNER")
    expect(tenant).toBeTruthy()
  })

  it("e o cargo ausente NÃO vira brecha: o dono continua fora de alcance", async () => {
    const { tenant, dono } = await empresa()
    const eu = await integrante(tenant.id, { nome: "Admin", email: "admin@x.com", cargo: "ADMIN" })
    mockGetTenant.mockResolvedValue({ tenantId: tenant.id, userId: eu.id, role: "ADMIN", locale: "pt" })
    const { atualizarIntegrante } = await import("@/actions/team")
    const fd = new FormData()
    fd.set("memberId", dono.id)
    fd.set("name", "Adriel")
    fd.set("role", "TECHNICIAN")

    const r = await atualizarIntegrante({}, fd)

    expect(r.success).toBeFalsy()
    expect((await testDb.db.user.findUnique({ where: { id: dono.id } }))!.role).toBe("OWNER")
  })

  it("a falha do REENVIO não diz 'membro adicionado' — ninguém foi adicionado", async () => {
    const { tenant } = await empresa()
    const m = await integrante(tenant.id, { nome: "Rita", email: "rita@x.com", cargo: "TECHNICIAN" })
    const { reenviarConvite } = await import("@/actions/team")
    const resend = await import("@/lib/resend")
    vi.mocked(resend.sendTeamInviteEmail).mockRejectedValueOnce(new Error("Resend fora do ar"))

    const r = await reenviarConvite(m.id)

    expect(r.success).toBeFalsy()
    expect(r.message).toContain("resendEmailFailed")
    expect(r.message).not.toContain("inviteEmailFailed")
  })

  it("o motivo do GoTrue chega ao dono também quando a resposta é !res.ok", async () => {
    await empresa()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ msg: "User already registered" }),
        text: async () => JSON.stringify({ msg: "User already registered" }),
      }) as unknown as Response)
    )
    const { inviteTeamMember } = await import("@/actions/team")

    const r = await inviteTeamMember({}, convite("novo@x.com"))

    expect(r.message).toContain("User already registered")
  })
})
