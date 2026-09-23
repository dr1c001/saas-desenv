import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Não havia caminho na tela para criar o PRIMEIRO item de checklist.
//
// O cartão só era renderizado com `os.checklist.length > 0` — e o campo de
// "adicionar item" mora DENTRO dele. Numa OS nova o cartão não existia, então
// não havia de onde criar o primeiro item de checklist de OS nenhuma. O
// recurso é vendido a partir do Pro (`requireRecurso(tenantId, "checklist")`
// em actions/checklist.ts) e o manual o apresenta como parte da OS: construído,
// cobrado e inalcançável — a décima terceira vez que este projeto encontra esse
// mesmo formato de defeito. (Achado na auditoria de 13/09/2026.)
//
// ─── Por que ESTRUTURAL ──────────────────────────────────────────────────────
//
// A tela é Server Component e monta uma dúzia de dependências (getTenant,
// permissões, fotos, peças, histórico). O defeito era UMA CONDIÇÃO, e é ela
// que este teste trava. Mesma convenção de operadores-declarados.test.ts.

const RAIZ = process.cwd()
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8")

const TELA = ler("src/app/(dashboard)/service-orders/[id]/page.tsx")
const COMPONENTE = ler("src/components/service-orders/checklist.tsx")
const ACTION = ler("src/actions/checklist.ts")

describe("o cartão do checklist", () => {
  it("NÃO depende mais de já existir item", () => {
    // A condição que escondia o único lugar onde se cria o primeiro item.
    expect(TELA).not.toContain("{os.checklist.length > 0 ? (")
    expect(TELA).toContain("{temChecklist ? (")
  })

  it("aparece para quem TEM o recurso, mesmo com a lista vazia", () => {
    expect(TELA).toMatch(/temChecklist =[\s\S]{0,80}temRecurso\(tenantId, "checklist"\)/)
  })

  it("e continua aparecendo para quem rebaixou o plano e ainda tem itens", () => {
    // A Action barra CRIAR item novo, mas deixa marcar e apagar os que já
    // existem; esconder o cartão deixaria a lista presa na tela, sem como
    // limpar — o próprio comentário da Action diz isso.
    expect(TELA).toContain("|| os.checklist.length > 0")
    expect(ACTION).toContain('requireRecurso(tenantId, "checklist")')
  })
})

describe("o campo de adicionar item", () => {
  it("vive dentro do componente, e é por isso que esconder o cartão o matava", () => {
    expect(COMPONENTE).toContain("checklist.addPlaceholder")
    expect(COMPONENTE).toContain("addChecklistItem")
  })

  it("só some quando a OS está fechada para edição", () => {
    // `readonly` é passado pela tela em INVOICED/CANCELLED.
    expect(COMPONENTE).toMatch(/\{!readonly && \([\s\S]{0,400}checklist\.addPlaceholder/)
    expect(TELA).toMatch(/readonly=\{os\.status === "INVOICED" \|\| os\.status === "CANCELLED"\}/)
  })
})
