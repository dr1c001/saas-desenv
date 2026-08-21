import { describe, expect, it } from "vitest"
import {
  canaisDoAviso,
  CONFIG_PADRAO,
  lerConfig,
  momentoDoStatus,
  textoDoAviso,
  type ConfigAviso,
} from "@/lib/aviso-cliente"

const ligado: ConfigAviso = { ...CONFIG_PADRAO, ativo: true }
const tudoDisponivel = { whatsappConfigurado: true, temWhatsapp: true, temEmail: true }

describe("padrão de fábrica", () => {
  it("nasce DESLIGADO", () => {
    // Mandar mensagem no celular do cliente final de outra empresa, sem ela
    // escolher isso, não é decisão que o sistema toma por ela.
    expect(CONFIG_PADRAO.ativo).toBe(false)
  })

  it("mas com os momentos já marcados", () => {
    // Ligar a chave e não acontecer nada pareceria defeito.
    expect(CONFIG_PADRAO.aCaminho).toBe(true)
    expect(CONFIG_PADRAO.concluido).toBe(true)
    expect(CONFIG_PADRAO.porWhatsapp).toBe(true)
  })
})

describe("leitura do que está gravado", () => {
  it("cai no padrão quando não há nada", () => {
    expect(lerConfig(null)).toEqual(CONFIG_PADRAO)
    expect(lerConfig(undefined)).toEqual(CONFIG_PADRAO)
  })

  it("aguenta Json estragado sem derrubar a conclusão de uma OS", () => {
    // Isto roda no caminho de toda mudança de status. No pior caso não manda
    // nada — que é o lado seguro do erro.
    expect(lerConfig("texto")).toEqual(CONFIG_PADRAO)
    expect(lerConfig([1, 2])).toEqual(CONFIG_PADRAO)
    expect(lerConfig(42)).toEqual(CONFIG_PADRAO)
  })

  it("aceita configuração parcial, completando o resto", () => {
    expect(lerConfig({ ativo: true, porEmail: true })).toEqual({
      ...CONFIG_PADRAO, ativo: true, porEmail: true,
    })
  })

  it("ignora tipo errado num campo isolado", () => {
    expect(lerConfig({ ativo: "sim" }).ativo).toBe(false)
  })
})

describe("momento da mudança de status", () => {
  it("iniciar vira 'a caminho' e concluir vira 'concluído'", () => {
    expect(momentoDoStatus("OPEN", "IN_PROGRESS")).toBe("aCaminho")
    expect(momentoDoStatus("IN_PROGRESS", "DONE")).toBe("concluido")
  })

  it("não avisa em status que não interessam ao cliente", () => {
    expect(momentoDoStatus("OPEN", "CANCELLED")).toBeNull()
    expect(momentoDoStatus("DONE", "CANCELLED")).toBeNull()
  })

  it("concluir E faturar de uma vez também avisa", () => {
    // completeServiceOrder com "faturar agora" pula o DONE e vai direto pra
    // INVOICED. Este é o caminho mais usado em produção (o comentário do cron
    // de NPS registra isso), e era justamente o que não avisava ninguém.
    expect(momentoDoStatus("IN_PROGRESS", "INVOICED")).toBe("concluido")
    expect(momentoDoStatus("OPEN", "INVOICED")).toBe("concluido")
  })

  it("faturar DEPOIS de concluir NÃO avisa de novo", () => {
    // O cliente já foi avisado quando a OS foi concluída. Faturar é assunto
    // interno da empresa e não é uma segunda mensagem pra ele.
    expect(momentoDoStatus("DONE", "INVOICED")).toBeNull()
  })

  it("não avisa quando o status não mudou", () => {
    // Salvar a OS de novo no mesmo status não pode disparar uma segunda
    // mensagem pro mesmo cliente.
    expect(momentoDoStatus("DONE", "DONE")).toBeNull()
    expect(momentoDoStatus("IN_PROGRESS", "IN_PROGRESS")).toBeNull()
  })
})

describe("por onde avisar", () => {
  it("não manda nada com a chave-mestra desligada", () => {
    // Mesmo com todos os momentos e canais marcados.
    const config = { ...CONFIG_PADRAO, ativo: false }
    expect(canaisDoAviso(config, "aCaminho", tudoDisponivel)).toEqual({
      whatsapp: false, email: false,
    })
  })

  it("manda por WhatsApp quando tudo está no lugar", () => {
    expect(canaisDoAviso(ligado, "aCaminho", tudoDisponivel)).toEqual({
      whatsapp: true, email: false,
    })
  })

  it("respeita o momento desmarcado", () => {
    const so_concluido = { ...ligado, aCaminho: false }
    expect(canaisDoAviso(so_concluido, "aCaminho", tudoDisponivel).whatsapp).toBe(false)
    expect(canaisDoAviso(so_concluido, "concluido", tudoDisponivel).whatsapp).toBe(true)
  })

  it("não tenta WhatsApp sem a integração configurada", () => {
    // A empresa pode ter ligado o canal e nunca ter preenchido o Z-API.
    const r = canaisDoAviso(ligado, "aCaminho", { ...tudoDisponivel, whatsappConfigurado: false })
    expect(r.whatsapp).toBe(false)
  })

  it("não tenta WhatsApp sem o número do cliente", () => {
    const r = canaisDoAviso(ligado, "aCaminho", { ...tudoDisponivel, temWhatsapp: false })
    expect(r.whatsapp).toBe(false)
  })

  it("manda por e-mail quando o canal está ligado e o cliente tem endereço", () => {
    const comEmail = { ...ligado, porEmail: true }
    expect(canaisDoAviso(comEmail, "concluido", tudoDisponivel)).toEqual({
      whatsapp: true, email: true,
    })
    expect(canaisDoAviso(comEmail, "concluido", { ...tudoDisponivel, temEmail: false }).email).toBe(false)
  })

  it("sem momento, não manda", () => {
    expect(canaisDoAviso(ligado, null, tudoDisponivel)).toEqual({ whatsapp: false, email: false })
  })
})

describe("texto da mensagem", () => {
  const t = (chave: string, vals?: Record<string, string>) =>
    vals ? `${chave}[${Object.values(vals).join("|")}]` : chave

  it("inclui o link do portal quando existe", () => {
    const txt = textoDoAviso(
      "aCaminho",
      { empresa: "Limpeza Ltda", osNumero: "OS20260001", titulo: "Limpeza", portalUrl: "https://x/p/abc" },
      t
    )
    expect(txt).toContain("avisoCliente.aCaminho")
    expect(txt).toContain("https://x/p/abc")
  })

  it("omite a linha do link quando não há portal", () => {
    const txt = textoDoAviso(
      "concluido",
      { empresa: "X", osNumero: "OS1", titulo: "Y", portalUrl: null },
      t
    )
    expect(txt).not.toContain("acompanhe")
  })
})
