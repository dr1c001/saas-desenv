import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A exportação do art. 18 levava 11 tabelas, e os três documentos prometiam
// "todos os dados".
//
// Ficavam de fora vinte modelos com `tenantId` — contratos recorrentes,
// estoque, patrimônio, fornecedores, cotações, compras, filiais — e o RASTRO
// DE GPS da equipe, que escapou porque `UserLocation` é chaveado por `userId`.
// É o dado mais sensível da relação entre empregador e técnico, e o que um
// pedido do art. 18 costuma querer. (Achado na auditoria de 13/09/2026.)
//
// ─── Por que ESTRUTURAL ──────────────────────────────────────────────────────
//
// O defeito não é um valor errado: é uma tabela ESQUECIDA. Um teste com banco
// provaria que o que está lá funciona — e passaria feliz com vinte tabelas
// fora, que é exatamente o que aconteceu por dois meses. O que precisa ser
// travado é a lista COMPLETA contra o schema, e o único lugar onde ela existe
// é o schema. Mesma tática de cron-resumo.test.ts (contadores × resumo
// gravado) e de sw-estrategia.test.ts (rotas × cópia no sw.js).

const RAIZ = process.cwd()
const SCHEMA = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8")
const FONTE = readFileSync(join(RAIZ, "src/actions/data-export.ts"), "utf8")

/** Todo modelo do schema que pertence a UMA empresa. */
function modelosDaEmpresa(): string[] {
  const modelos = [...SCHEMA.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
  return modelos
    .filter(([, , corpo]) => /^\s*tenantId\s/m.test(corpo))
    .map(([, nome]) => nome)
    .sort()
}

/** O nome da propriedade do Prisma Client: `ServiceOrder` → `serviceOrder`. */
const comoNoPrisma = (modelo: string) => modelo[0].toLowerCase() + modelo.slice(1)

/**
 * Modelos que NÃO entram, e o motivo de cada um.
 *
 * Lista fechada de propósito: tirar uma tabela da exportação tem de ser uma
 * decisão consciente, escrita, e não o caminho fácil para o teste parar de
 * reclamar.
 */
const FORA_DA_EXPORTACAO: Record<string, string> = {
  // O alarme interno do ServiçoOS sobre esta empresa (atraso, cancelamento).
  // É dado da plataforma sobre o cliente, não dado do cliente.
  PlatformAlert: "alarme interno da plataforma",
}

describe("a exportação leva TUDO que é da empresa", () => {
  it("nenhum modelo com tenantId fica de fora sem motivo escrito", () => {
    const esquecidos = modelosDaEmpresa().filter(
      (m) => !(m in FORA_DA_EXPORTACAO) && !FONTE.includes(`prisma.${comoNoPrisma(m)}.`)
    )

    expect(
      esquecidos,
      `Estes modelos pertencem a uma empresa e NÃO são exportados — um pedido ` +
        `do art. 18 receberia menos do que os documentos prometem: ${esquecidos.join(", ")}`
    ).toEqual([])
  })

  it("o RASTRO DE GPS vai junto, mesmo não tendo tenantId", () => {
    // `UserLocation` é chaveado por usuário: nenhuma varredura por `tenantId`
    // o encontraria, e foi assim que ele ficou de fora.
    expect(FONTE).toContain("prisma.userLocation.findMany")
    expect(FONTE).toContain("where: { user: { tenantId } }")
    expect(FONTE).toContain("latitude")
    expect(FONTE).toContain("localizacoesDaEquipe")
  })

  it("o ACEITE DOS TERMOS vai junto, e também não tem tenantId", () => {
    // Terceiro modelo da mesma família do rastro de GPS: `TermsAcceptance` é
    // chaveado por usuário e por e-mail, e a linha nasce ANTES de existir User
    // ou Tenant (ver o model no schema). Nenhuma varredura por `tenantId` o
    // encontraria — e é o documento que prova que o cliente aceitou, e em que
    // versão. Pedido do art. 18 sem ele entrega menos do que os documentos
    // prometem.
    expect(FONTE).toContain("prisma.termsAcceptance.findMany")
    expect(FONTE).toContain("termsVersion")
    // NO OBJETO DE RETORNO, e não só declarado: procurar o nome solto passa
    // verde com a variável criada e nunca devolvida.
    expect(FONTE).toMatch(/assinaturas: subscriptions,[\s\S]{0,40}aceiteDosTermos,/)
  })

  it("a lista de exceções não cresce por descuido", () => {
    expect(Object.keys(FORA_DA_EXPORTACAO)).toEqual(["PlatformAlert"])
  })
})

describe("mas SEGREDO nunca sai", () => {
  it("o hash da chave de API não é exportado", () => {
    // Exportar credencial transformaria um pedido de portabilidade num
    // vazamento. Do que é seguro dizer — que existe, quando foi criada — vai
    // o metadado.
    const bloco = FONTE.slice(FONTE.indexOf("prisma.apiKey"), FONTE.indexOf("prisma.fiscalCertificate"))
    expect(bloco).not.toContain("hash")
    expect(bloco).toContain("prefix")
  })

  it("o certificado A1 e a senha dele não são exportados", () => {
    const bloco = FONTE.slice(
      FONTE.indexOf("prisma.fiscalCertificate"),
      FONTE.indexOf("prisma.offlineOperation")
    )
    expect(bloco).not.toContain("arquivo")
    expect(bloco).not.toContain("senha")
    expect(bloco).toContain("validoAte")
  })

  it("a exportação continua sendo só do dono", () => {
    expect(FONTE).toContain('if (role !== "OWNER")')
  })
})
