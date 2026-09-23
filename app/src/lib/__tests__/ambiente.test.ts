import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  ambiente,
  bloquearForaDeProducao,
  destinoDeEmailDeTeste,
  ehProducao,
  prefixoDeAssunto,
} from "@/lib/ambiente"

// Estas travas existem porque um ambiente de teste que envia e-mail de
// verdade, emite nota fiscal de verdade ou cria cobrança de verdade é PIOR
// que não ter ambiente de teste nenhum. Se alguém remover uma delas numa
// refatoração, é aqui que aparece.

const original = { ...process.env }

beforeEach(() => {
  delete process.env.VERCEL_ENV
  delete process.env.STAGING_EMAIL
  delete process.env.SUPER_ADMIN_EMAIL
})

afterEach(() => {
  process.env = { ...original }
})

describe("detecção do ambiente", () => {
  it("só é produção quando a Vercel diz que é", () => {
    process.env.VERCEL_ENV = "production"
    expect(ambiente()).toBe("producao")
    expect(ehProducao()).toBe(true)
  })

  it("qualquer outro deploy da Vercel é teste", () => {
    process.env.VERCEL_ENV = "preview"
    expect(ambiente()).toBe("teste")
    expect(ehProducao()).toBe(false)
  })

  it("sem a variável, é local", () => {
    expect(ambiente()).toBe("local")
    expect(ehProducao()).toBe(false)
  })

  it("valor desconhecido NÃO vira produção", () => {
    // Lista de permissão, não de bloqueio: ambiente novo que a Vercel invente
    // no futuro fica contido em vez de ganhar acesso ao mundo real.
    process.env.VERCEL_ENV = "qualquer-coisa-nova"
    expect(ehProducao()).toBe(false)
  })

  it("string vazia não conta como produção", () => {
    process.env.VERCEL_ENV = ""
    expect(ambiente()).toBe("local")
  })
})

describe("bloqueio de operação irreversível", () => {
  it("deixa passar em produção", () => {
    process.env.VERCEL_ENV = "production"
    expect(() => bloquearForaDeProducao("emitir NFS-e")).not.toThrow()
  })

  it("barra em teste e diz o que foi barrado", () => {
    // Emitir NFS-e por engano gera documento fiscal de verdade, que precisa de
    // cancelamento formal com prazo.
    process.env.VERCEL_ENV = "preview"
    expect(() => bloquearForaDeProducao("emitir NFS-e")).toThrow(/emitir NFS-e/)
  })

  it("barra também na máquina do desenvolvedor", () => {
    expect(() => bloquearForaDeProducao("emitir NFS-e")).toThrow()
  })
})

describe("destino de e-mail fora de produção", () => {
  it("usa STAGING_EMAIL quando existe", () => {
    process.env.STAGING_EMAIL = "teste@exemplo.com"
    process.env.SUPER_ADMIN_EMAIL = "dono@exemplo.com"
    expect(destinoDeEmailDeTeste()).toBe("teste@exemplo.com")
  })

  it("cai no e-mail do dono quando não há STAGING_EMAIL", () => {
    process.env.SUPER_ADMIN_EMAIL = "dono@exemplo.com"
    expect(destinoDeEmailDeTeste()).toBe("dono@exemplo.com")
  })

  it("devolve null quando não há destino seguro", () => {
    // Sem destino seguro o envio é abortado lá em resend.ts — melhor falhar
    // que mandar aviso de inadimplência pro cliente final de um banco de cópia.
    expect(destinoDeEmailDeTeste()).toBeNull()
  })
})

describe("prefixo no assunto", () => {
  it("não existe em produção", () => {
    process.env.VERCEL_ENV = "production"
    expect(prefixoDeAssunto()).toBe("")
  })

  it("marca o e-mail fora de produção", () => {
    process.env.VERCEL_ENV = "preview"
    expect(prefixoDeAssunto()).toBe("[TESTE] ")
  })
})
