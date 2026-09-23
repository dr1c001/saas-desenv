import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/test-utils/pglite-db"

// Pendência de configuração NÃO é tarefa de fundo que falhou.
//
// ─── O que aconteceu ─────────────────────────────────────────────────────────
//
// Em 15/09/2026 o vigia de DMARC entrou no cron contando a política ausente
// como `results.errors++`. Consequências, medidas em produção no dia 22:
//
//   • `CronRun.ok = false` todo dia;
//   • `/api/health` devolvendo 503 há 146 horas ("cron degradado"), porque ele
//     procura a última execução com ok=true — com o banco respondendo e as
//     dezessete etapas completas todo dia;
//   • e-mail vermelho diário dizendo "parte das tarefas de fundo não rodou",
//     com todas tendo rodado.
//
// Alarme que grita todo dia por algo que não é queda é o alarme que a pessoa
// aprende a ignorar. `lib/saude.ts` já dizia isso sobre atraso normal do cron.

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await createTestDatabase()
  vi.doMock("@/lib/prisma", () => ({ prisma: testDb.db }))
})

afterAll(async () => {
  await testDb.close()
})

beforeEach(async () => {
  await testDb.reset()
})

const avisar = async (chave: string, enviar: () => Promise<unknown>, detalhe = "motivo") => {
  const { avisarPendenciaUmaVez } = await import("@/lib/pendencia")
  return avisarPendenciaUmaVez({ chave, detalhe, enviar })
}

describe("avisa UMA vez", () => {
  it("o primeiro avisa; o segundo, no dia seguinte, não", async () => {
    const enviar = vi.fn().mockResolvedValue(undefined)

    expect(await avisar("config:dmarc:ausente", enviar)).toBe(true)
    expect(await avisar("config:dmarc:ausente", enviar)).toBe(false)
    expect(await avisar("config:dmarc:ausente", enviar)).toBe(false)

    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it("estado DIFERENTE é fato novo: avisa de novo", async () => {
    // "ausente" e "fraca" pedem ações diferentes de quem lê.
    const enviar = vi.fn().mockResolvedValue(undefined)

    expect(await avisar("config:dmarc:ausente", enviar)).toBe(true)
    expect(await avisar("config:dmarc:fraca", enviar)).toBe(true)

    expect(enviar).toHaveBeenCalledTimes(2)
  })

  it("a linha fica gravada com o motivo — é o que responde 'o que o aviso dizia'", async () => {
    await avisar("config:dmarc:ausente", vi.fn().mockResolvedValue(undefined), "sem registro v=DMARC1")

    const linha = await testDb.db.platformAlert.findUnique({ where: { key: "config:dmarc:ausente" } })
    expect(linha!.event).toBe("configuracaoPendente")
    expect(linha!.detail).toBe("sem registro v=DMARC1")
  })
})

describe("o envio falhando", () => {
  it("não lança, e a linha FICA — linha presente com envio falho ≠ gatilho que nunca rodou", async () => {
    const enviar = vi.fn().mockRejectedValue(new Error("Resend: recusado"))

    expect(await avisar("config:dmarc:ausente", enviar)).toBe(false)

    const linha = await testDb.db.platformAlert.findUnique({ where: { key: "config:dmarc:ausente" } })
    expect(linha).not.toBeNull()
  })
})

describe("o cron não confunde os dois", () => {
  // Estrutural: o que se prova aqui é a AUSÊNCIA de um `results.errors++` no
  // ramo da pendência — e é justamente o que custou seis dias de 503.
  const ler = () => import("node:fs/promises").then((fs) => fs.readFile("src/app/api/cron/daily/route.ts", "utf-8"))

  it("o DMARC ausente vira pendência avisada uma vez, e NÃO erro do cron", async () => {
    const fonte = await ler()
    const bloco = fonte.slice(fonte.indexOf("── DMARC do domínio de e-mail"))
    // Do `if` até o catch: o comentário acima fala do defeito, e não é código.
    const ramo = bloco.slice(bloco.indexOf("if (veredito.precisaDeAcao) {"), bloco.indexOf("} catch (err) {"))

    expect(ramo).toContain("avisarPendenciaUmaVez({")
    expect(ramo).toContain("config:dmarc:${veredito.estado}")
    // O ramo de `precisaDeAcao` não pode contar erro: é ele que derruba
    // CronRun.ok e, por tabela, o /api/health.
    expect(ramo).not.toContain("results.errors++")
  })

  it("mas a checagem que NÃO RODA continua sendo erro", async () => {
    const fonte = await ler()
    const bloco = fonte.slice(fonte.indexOf("── DMARC do domínio de e-mail"))
    const doCatch = bloco.slice(bloco.indexOf("} catch (err) {"))
    expect(doCatch.slice(0, 200)).toContain("results.errors++")
  })

  it("o e-mail da pendência é outro, e não diz que tarefa nenhuma deixou de rodar", async () => {
    const fonte = await import("node:fs/promises").then((fs) => fs.readFile("src/lib/resend.ts", "utf-8"))
    const f = fonte.slice(fonte.indexOf("export async function avisarPendenciaDeConfiguracao"))
    const corpo = f.slice(0, f.indexOf("export async function avisarFalhaDoCron"))
    expect(corpo).toContain("Configuração pendente:")
    expect(corpo).toContain("as tarefas de fundo rodaram normalmente")
    expect(corpo).not.toContain("não rodou")
  })
})
