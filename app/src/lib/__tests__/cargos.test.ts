import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ALL_TABS } from "@/lib/abas"
import {
  abasPadraoDe,
  ABAS_PADRAO,
  CARGOS,
  CARGOS_ADMINISTRATIVOS,
  CARGOS_ATRIBUIVEIS,
  CARGOS_CONFIGURAVEIS,
  ehAdministrativo,
  ehCargo,
} from "@/lib/cargos"

describe("o catálogo e o banco falam a mesma língua", () => {
  it("todo cargo existe no enum do Prisma", () => {
    // O teste que sustenta os `as never` em actions/team.ts. Sem ele, aquele
    // cast é uma promessa vazia: um cargo que existe no TypeScript e não no
    // enum do banco passa por toda a validação e explode na hora de gravar,
    // com o convite já enviado por e-mail.
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8")
    const bloco = schema.slice(schema.indexOf("enum UserRole {"))
    const noBanco = bloco.slice(0, bloco.indexOf("}")).match(/^\s+([A-Z_]+)$/gm) ?? []
    const nomes = new Set(noBanco.map((l) => l.trim()))
    expect(CARGOS.filter((c) => !nomes.has(c))).toEqual([])
  })

  it("todo valor do enum do banco tem um cargo", () => {
    // O outro lado: um valor no banco sem cargo no catálogo é alguém que
    // consegue existir e para quem nenhuma tela sabe configurar permissão.
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8")
    const bloco = schema.slice(schema.indexOf("enum UserRole {"))
    const noBanco = (bloco.slice(0, bloco.indexOf("}")).match(/^\s+([A-Z_]+)$/gm) ?? []).map((l) =>
      l.trim()
    )
    expect(noBanco.filter((n) => !ehCargo(n))).toEqual([])
  })
})

describe("quem pode o quê", () => {
  it("dono e administrador mandam em tudo", () => {
    expect(ehAdministrativo("OWNER")).toBe(true)
    expect(ehAdministrativo("ADMIN")).toBe(true)
  })

  it("nenhum cargo novo entrou como administrativo", () => {
    // A lista tem de ficar CURTA. Cada cargo aqui é um cargo cujo acesso
    // ninguém consegue restringir depois — nem o dono da empresa.
    expect([...CARGOS_ADMINISTRATIVOS].sort()).toEqual(["ADMIN", "OWNER"])
  })

  it("gerente NÃO é administrativo", () => {
    // Parece candidato até a primeira empresa que quer um gerente que não mexe
    // na cobrança. Ele é configurável como os outros.
    expect(ehAdministrativo("GERENTE")).toBe(false)
    expect(CARGOS_CONFIGURAVEIS).toContain("GERENTE")
  })

  it("proprietário não se distribui", () => {
    // Dois donos é problema de cobrança e de responsabilidade, não de menu.
    expect(CARGOS_ATRIBUIVEIS).not.toContain("OWNER")
    expect(CARGOS_ATRIBUIVEIS).toContain("ADMIN")
  })

  it("o que é configurável exclui quem já pode tudo", () => {
    for (const c of CARGOS_ADMINISTRATIVOS) expect(CARGOS_CONFIGURAVEIS).not.toContain(c)
  })
})

describe("as abas que cada cargo vê antes de configurarem", () => {
  it("todo cargo tem um padrão declarado", () => {
    for (const c of CARGOS) expect(ABAS_PADRAO[c], c).toBeDefined()
  })

  it("todo padrão usa abas que existem", () => {
    // Slug digitado errado aqui vira um cargo que abre o sistema com o menu
    // menor do que devia, sem nada acusar.
    const reais = new Set(ALL_TABS.map((t) => t.slug))
    for (const c of CARGOS) {
      const invalidas = ABAS_PADRAO[c].filter((s) => !reais.has(s))
      expect(invalidas, c).toEqual([])
    }
  })

  it("o padrão do técnico NÃO mudou", () => {
    // Toda empresa que já restringiu seus técnicos depende deste valor. Mexer
    // aqui muda o menu de gente que está trabalhando agora.
    expect(ABAS_PADRAO.TECHNICIAN).toEqual(["dashboard", "service-orders", "schedule"])
  })

  it("cada cargo operacional vê o que é o trabalho dele", () => {
    // O defeito que isto evita: convidar um financeiro e ele abrir o sistema
    // em ordens de serviço, sem ver o financeiro — e a empresa concluir que o
    // cargo não funciona, quando faltava só configuração.
    expect(abasPadraoDe("FINANCEIRO")).toContain("finance")
    expect(abasPadraoDe("LOGISTICA")).toContain("parts")
    expect(abasPadraoDe("ATENDIMENTO")).toContain("schedule")
    expect(abasPadraoDe("COMERCIAL")).toContain("quotes")
  })

  it("cargo desconhecido cai no MAIS restrito, não no mais amplo", () => {
    // Errar para o lado de dar acesso demais é o erro caro.
    expect(abasPadraoDe("INVENTADO")).toEqual(ABAS_PADRAO.TECHNICIAN)
  })

  it("nenhum padrão inclui a cobrança da assinatura", () => {
    // Billing é a conta do dono com o ServiçoOS, e não trabalho da empresa.
    for (const c of CARGOS) expect(ABAS_PADRAO[c], c).not.toContain("billing")
  })
})
