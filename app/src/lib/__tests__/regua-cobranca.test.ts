import { describe, expect, it } from "vitest"
import {
  DEGRAUS_DA_REGUA,
  REGUA_PADRAO,
  agruparPorPagador,
  canaisDaCobranca,
  decidirCobranca,
  diasDesdeVencimento,
  lerRegua,
  textoAgrupado,
  tomDoDegrau,
  type ConfigRegua,
} from "@/lib/regua-cobranca"

const LIGADA: ConfigRegua = { ...REGUA_PADRAO, ativo: true }

/** Uma decisão com o mínimo escrito, pra os testes falarem só do que importa. */
const decidir = (dias: number, jaEnviadas: number, extra: Partial<ConfigRegua> = {}) =>
  decidirCobranca({
    dias,
    jaEnviadas,
    paga: false,
    valor: 1000,
    config: { ...LIGADA, ...extra },
  })

describe("a escada", () => {
  it("está em ordem crescente", () => {
    // A contagem de degraus vencidos é `filter(d => dias >= d).length`, e ela
    // só devolve a POSIÇÃO certa se a lista estiver ordenada. Fora de ordem,
    // o degrau escolhido (`DEGRAUS[total - 1]`) seria outro — e o cliente
    // receberia a mensagem final antes do lembrete.
    const ordenada = [...DEGRAUS_DA_REGUA].sort((a, b) => a - b)
    expect([...DEGRAUS_DA_REGUA]).toEqual(ordenada)
  })

  it("começa antes do vencimento e termina depois", () => {
    // O desenho do recurso: prevenir o atraso vale mais que cobrar o atraso.
    expect(DEGRAUS_DA_REGUA[0]).toBeLessThan(0)
    expect(DEGRAUS_DA_REGUA[DEGRAUS_DA_REGUA.length - 1]).toBeGreaterThan(0)
  })
})

describe("nasce desligada", () => {
  it("a configuração padrão não manda nada", () => {
    // Manda mensagem de COBRANÇA para terceiros em nome da empresa. Ligar
    // isso por padrão seria decidir por ela.
    expect(REGUA_PADRAO.ativo).toBe(false)
    expect(decidirCobranca({ dias: 30, jaEnviadas: 0, paga: false, valor: 500, config: REGUA_PADRAO }).enviar).toBe(false)
  })

  it("mas já vem com tudo por dentro marcado", () => {
    // Ligar a chave e não acontecer nada parece defeito.
    expect(REGUA_PADRAO.lembrarAntes && REGUA_PADRAO.cobrarDepois).toBe(true)
    expect(REGUA_PADRAO.porWhatsapp || REGUA_PADRAO.porEmail).toBe(true)
  })
})

describe("não cobra quem não deve", () => {
  it("receita paga nunca é cobrada", () => {
    // O pior defeito possível deste recurso: cobrar quem já pagou. Custa um
    // cliente, e o cron vê a receita antes de qualquer coisa.
    expect(decidirCobranca({ dias: 30, jaEnviadas: 0, paga: true, valor: 900, config: LIGADA }).enviar).toBe(false)
  })

  it("valor abaixo do mínimo não vira mensagem", () => {
    // Mandar cobrança de R$ 40 quando a empresa disse "só a partir de R$ 100"
    // gasta relação com o cliente por um valor que ela já decidiu não perseguir.
    const comMinimo = { ...LIGADA, valorMinimo: 100 }
    const aos7dias = (valor: number) =>
      decidirCobranca({ dias: 7, jaEnviadas: 0, paga: false, valor, config: comMinimo })

    expect(aos7dias(40).enviar).toBe(false)
    expect(aos7dias(150).enviar).toBe(true)
    // O limite é inclusivo: exatamente o mínimo é cobrável.
    expect(aos7dias(100).enviar).toBe(true)
  })

  it("mínimo zero cobra qualquer valor", () => {
    expect(decidirCobranca({ dias: 7, jaEnviadas: 0, paga: false, valor: 3, config: LIGADA }).enviar).toBe(true)
  })

  it("sem nenhum canal ligado, não decide enviar", () => {
    // Evita o cron marcar o contador e a mensagem não sair por não ter por
    // onde — o degrau ficaria gasto sem ninguém receber nada.
    expect(decidir(7, 0, { porWhatsapp: false, porEmail: false }).enviar).toBe(false)
  })
})

describe("idempotência contra o cron diário", () => {
  it("rodar duas vezes no mesmo dia manda uma mensagem só", () => {
    // O cron roda todo dia e pode ser reexecutado à mão. Sem o contador, a
    // mesma conta receberia a mesma cobrança de novo.
    const primeira = decidir(7, 0)
    expect(primeira.enviar).toBe(true)
    expect(decidir(7, primeira.total).enviar).toBe(false)
  })

  it("um dia perdido pelo cron se recupera no dia seguinte", () => {
    // A razão de contar degraus em vez de comparar datas. Se a regra fosse
    // "hoje é exatamente o 7º dia?", uma falha no dia 7 perderia o degrau
    // para sempre — e a falha é silenciosa.
    expect(decidir(8, 1).enviar).toBe(true)
    expect(decidir(8, 1).degrau).toBe(7)
  })

  it("vários dias perdidos mandam UMA mensagem, a mais recente", () => {
    // O cron ficou fora 20 dias e voltou. Mandar os quatro degraus de uma vez
    // é bombardear o cliente no mesmo minuto — pior que ter mandado menos.
    const d = decidir(20, 1)
    expect(d.enviar).toBe(true)
    expect(d.degrau).toBe(15)
    expect(d.total).toBe(4)
  })
})

describe("o total devolvido é sempre seguro de gravar", () => {
  // O defeito que a simulação dia-a-dia pegou: a versão original devolvia
  // `total: 0` em todo caminho que não enviava. Quem gravasse o contador sem
  // condição o ZERAVA — e a régua recomeçava do primeiro degrau todo dia
  // depois de ter terminado, cobrando o mesmo cliente para sempre.
  //
  // O contrato agora é simples de não errar: grave `total` sempre.

  it("não regride quando a régua está desligada", () => {
    expect(decidirCobranca({ dias: 40, jaEnviadas: 3, paga: false, valor: 900, config: REGUA_PADRAO }).total).toBe(3)
  })

  it("não regride quando a receita foi paga", () => {
    expect(decidirCobranca({ dias: 40, jaEnviadas: 3, paga: true, valor: 900, config: LIGADA }).total).toBe(3)
  })

  it("não regride quando o valor está abaixo do mínimo", () => {
    expect(decidirCobranca({ dias: 40, jaEnviadas: 3, paga: false, valor: 10, config: { ...LIGADA, valorMinimo: 100 } }).total).toBe(3)
  })

  it("não regride depois do último degrau", () => {
    expect(decidir(365, DEGRAUS_DA_REGUA.length).total).toBe(DEGRAUS_DA_REGUA.length)
  })

  it("nunca passa do número de degraus", () => {
    // Um contador maior que a régua faria `DEGRAUS[total - 1]` virar
    // `undefined` e a mensagem sair sem degrau.
    for (const dias of [-100, -3, 0, 1, 7, 15, 30, 400]) {
      expect(decidir(dias, 0).total, String(dias)).toBeLessThanOrEqual(DEGRAUS_DA_REGUA.length)
    }
  })
})

describe("renegociação", () => {
  it("empurrar o vencimento faz a régua recomeçar", () => {
    // Acontece o tempo todo: o cliente liga, combina pagar dia 10 do mês que
    // vem, e a empresa muda a data. Sem esta regra o contador ficaria no fim
    // da escada e a conta renegociada nunca mais receberia um lembrete — bem
    // na hora em que ele é mais útil.
    //
    // A régua percebe sozinha, porque o calendário andou pra trás em relação
    // ao contador. Ninguém precisa lembrar de zerar nada ao editar a data.
    const jaCobradaAteOFim = DEGRAUS_DA_REGUA.length

    // Vencimento novo, daqui a 20 dias: nenhum degrau passou ainda.
    const depoisDeRenegociar = decidir(-20, jaCobradaAteOFim)
    expect(depoisDeRenegociar.enviar).toBe(false)
    expect(depoisDeRenegociar.total).toBe(0)

    // E o lembrete do prazo novo sai normalmente.
    const lembrete = decidir(-3, depoisDeRenegociar.total)
    expect(lembrete.enviar).toBe(true)
    expect(lembrete.tom).toBe("lembrete")
  })
})

describe("a régua inteira, dia a dia", () => {
  it("manda exatamente uma mensagem por degrau, e nunca mais que isso", () => {
    // Simula o cron rodando todo dia, de 10 dias antes do vencimento até 90
    // depois. É o teste que pega qualquer erro de contagem que os casos
    // isolados deixariam passar.
    let contador = 0
    const enviados: number[] = []
    for (let dia = -10; dia <= 90; dia++) {
      const d = decidir(dia, contador)
      if (d.enviar) enviados.push(d.degrau!)
      contador = d.total
    }
    expect(enviados).toEqual([...DEGRAUS_DA_REGUA])
  })

  it("depois do último degrau, o silêncio é definitivo", () => {
    // Cobrar para sempre é perseguição. Passados os 30 dias, a conta precisa
    // de uma pessoa, não de um cron.
    const ultimo = DEGRAUS_DA_REGUA.length
    expect(decidir(365, ultimo).enviar).toBe(false)
  })

  it("uma conta que nasce já vencida não dispara a régua toda de uma vez", () => {
    // Lançamento retroativo: a empresa cadastra hoje uma receita que venceu
    // há 40 dias. O contador está em 0 e todos os degraus já passaram.
    const d = decidir(40, 0)
    expect(d.enviar).toBe(true)
    expect(d.degrau).toBe(30) // a final, e só ela
    expect(decidir(40, d.total).enviar).toBe(false)
  })
})

describe("o contador conta posição na régua, e não mensagens enviadas", () => {
  it("desligar o lembrete no meio não faz a conta pular um degrau para sempre", () => {
    // O defeito sutil que isto evita: se o contador só avançasse quando uma
    // mensagem SAI, uma empresa com `lembrarAntes` desligado ficaria com o
    // contador em 0 no vencimento — e aí o degrau 1 seria "o primeiro", o 7
    // seria "o segundo", e a régua andaria deslocada até o fim, mandando a
    // mensagem de tom errado em cada etapa.
    const semLembrete = { lembrarAntes: false }

    // Três dias antes: o degrau passa, mas em silêncio.
    const antes = decidir(-3, 0, semLembrete)
    expect(antes.enviar).toBe(false)
    expect(antes.total).toBe(1)

    // No dia seguinte ao vencimento, o degrau alcançado é o `1` — com o tom
    // certo de "venceu", e não o de lembrete.
    const depois = decidir(1, antes.total, semLembrete)
    expect(depois.enviar).toBe(true)
    expect(depois.degrau).toBe(1)
    expect(depois.tom).toBe("venceu")
  })

  it("desligar a cobrança deixa só o lembrete", () => {
    const so = { cobrarDepois: false }
    expect(decidir(-3, 0, so).enviar).toBe(true)
    expect(decidir(1, 1, so).enviar).toBe(false)
    expect(decidir(30, 4, so).enviar).toBe(false)
  })
})

describe("o tom", () => {
  it("antes do vencimento é lembrete, e nunca cobrança", () => {
    // Chamar de "cobrança" uma conta que ainda nem venceu é ofender o cliente
    // que está em dia.
    expect(tomDoDegrau(-3)).toBe("lembrete")
    expect(decidir(-3, 0).tom).toBe("lembrete")
  })

  it("o último degrau tem tom próprio", () => {
    expect(tomDoDegrau(DEGRAUS_DA_REGUA[DEGRAUS_DA_REGUA.length - 1])).toBe("final")
  })

  it("todo degrau da régua tem um tom", () => {
    for (const d of DEGRAUS_DA_REGUA) {
      expect(tomDoDegrau(d), String(d)).toBeTruthy()
    }
  })
})

describe("dias de calendário, e não de milissegundos", () => {
  it("uma conta que vence hoje às 23h está vencendo hoje", () => {
    // Sem arredondar para o dia, isto daria -0,96 e o degrau -3 dispararia ou
    // não dependendo da HORA em que o cron rodasse — o defeito que aparece
    // uma vez por mês e ninguém reproduz.
    const vence = new Date("2026-08-27T23:00:00Z")
    const agora = new Date("2026-08-27T03:00:00Z")
    expect(diasDesdeVencimento(vence, agora)).toBe(0)
  })

  it("conta os dias nos dois sentidos", () => {
    const vence = new Date("2026-08-27T12:00:00Z")
    expect(diasDesdeVencimento(vence, new Date("2026-08-24T12:00:00Z"))).toBe(-3)
    expect(diasDesdeVencimento(vence, new Date("2026-09-03T12:00:00Z"))).toBe(7)
  })

  it("atravessa a virada do mês", () => {
    expect(diasDesdeVencimento(new Date("2026-08-31T10:00:00Z"), new Date("2026-09-01T10:00:00Z"))).toBe(1)
  })
})

describe("os canais", () => {
  const tudo = { whatsappConfigurado: true, temWhatsapp: true, temEmail: true }

  it("desligada, não abre canal nenhum", () => {
    expect(canaisDaCobranca(REGUA_PADRAO, tudo)).toEqual({ whatsapp: false, email: false })
  })

  it("WhatsApp exige a integração configurada E o número do cliente", () => {
    // O canal ligado na tela não significa que dá pra usar: a empresa pode
    // não ter integração, ou o cliente pode não ter telefone no cadastro.
    expect(canaisDaCobranca(LIGADA, { ...tudo, whatsappConfigurado: false }).whatsapp).toBe(false)
    expect(canaisDaCobranca(LIGADA, { ...tudo, temWhatsapp: false }).whatsapp).toBe(false)
    expect(canaisDaCobranca(LIGADA, tudo).whatsapp).toBe(true)
  })

  it("e-mail exige o e-mail do cliente", () => {
    expect(canaisDaCobranca(LIGADA, { ...tudo, temEmail: false }).email).toBe(false)
  })
})

describe("leitura do que está gravado", () => {
  it("nulo e lixo caem no padrão desligado", () => {
    expect(lerRegua(null)).toEqual(REGUA_PADRAO)
    expect(lerRegua("ligado")).toEqual(REGUA_PADRAO)
    expect(lerRegua(42)).toEqual(REGUA_PADRAO)
  })

  it("campo novo faltando no JSON antigo não desliga o resto", () => {
    // Quem gravou a configuração antes de `valorMinimo` existir não pode ver
    // a régua parar de funcionar por causa disso.
    const antigo = { ativo: true, lembrarAntes: true, cobrarDepois: true, porWhatsapp: true, porEmail: false }
    const lido = lerRegua(antigo)
    expect(lido.ativo).toBe(true)
    expect(lido.porEmail).toBe(false)
    expect(lido.valorMinimo).toBe(0)
  })

  it("valor mínimo inválido vira zero, e não NaN", () => {
    // Um campo de texto mal preenchido não pode desligar a régua por
    // acidente: `valor < NaN` é sempre falso, mas `NaN > 0` também — e a
    // comparação passaria a depender de qual lado do `if` está escrito.
    expect(lerRegua({ valorMinimo: "abc" }).valorMinimo).toBe(0)
    expect(lerRegua({ valorMinimo: -50 }).valorMinimo).toBe(0)
    expect(lerRegua({ valorMinimo: 100 }).valorMinimo).toBe(100)
  })
})

describe("a conta não está mais atrasada do que existe", () => {
  // O defeito: uma conta pode NASCER vencida, e nasce o tempo todo. Parcelar
  // uma OS concluída há quarenta dias cria a entrada vencendo na execução.
  //
  // Sem o limite, a PRIMEIRA mensagem que aquele cliente recebe na vida sai no
  // degrau 30 — "conta em aberto", o tom mais duro — para quem nunca foi
  // avisado de nada. Não cobra de menos: cobra MAL, e com o cliente certo.
  const config = { ...REGUA_PADRAO, ativo: true }

  it("parcela criada hoje, vencida há 40 dias, começa no PRIMEIRO degrau", () => {
    const d = decidirCobranca({
      dias: 40,
      jaEnviadas: 0,
      paga: false,
      valor: 500,
      config,
      idadeEmDias: 0,
    })

    expect(d.total).toBe(1)
    expect(d.degrau).toBe(DEGRAUS_DA_REGUA[0])
    expect(d.tom).toBe("lembrete")
  })

  it("no dia seguinte ela anda UM degrau, e não a escada toda", () => {
    const d = decidirCobranca({
      dias: 41,
      jaEnviadas: 1,
      paga: false,
      valor: 500,
      config,
      idadeEmDias: 1,
    })

    expect(d.total).toBe(2)
    expect(d.degrau).toBe(1)
  })

  it("mas a conta ANTIGA de verdade continua pulando para o degrau certo", () => {
    // O cron ficou dias fora do ar. A conta existe há 40 dias e está vencida há
    // 40: aqui o salto é correto, e mandar a escada inteira seria pior.
    const d = decidirCobranca({
      dias: 40,
      jaEnviadas: 0,
      paga: false,
      valor: 500,
      config,
      idadeEmDias: 40,
    })

    expect(d.total).toBe(5)
    expect(d.degrau).toBe(30)
  })

  it("sem a idade informada, nada muda", () => {
    // A regra antiga continua valendo para quem não passa o campo — é o que
    // permitiu ligar isto sem reescrever os chamadores todos de uma vez.
    const d = decidirCobranca({ dias: 40, jaEnviadas: 0, paga: false, valor: 500, config })
    expect(d.total).toBe(5)
  })

  it("rodar DUAS VEZES no mesmo dia continua dando o mesmo degrau", () => {
    // A régua anda pelo CALENDÁRIO, e não por execução do cron. A primeira
    // versão desta regra limitava a `jaEnviadas + 1` e fazia a escada andar um
    // degrau por RODADA — duas rodadas no mesmo dia mandavam duas mensagens.
    const primeira = decidirCobranca({
      dias: 40, jaEnviadas: 0, paga: false, valor: 500, config, idadeEmDias: 0,
    })
    const segunda = decidirCobranca({
      dias: 40, jaEnviadas: primeira.total, paga: false, valor: 500, config, idadeEmDias: 0,
    })

    expect(primeira.enviar).toBe(true)
    expect(segunda.enviar).toBe(false)
    expect(segunda.total).toBe(primeira.total)
  })
})

describe("agrupar por quem paga", () => {
  const conta = (id: string, pagadorId: string, dias: number, valor = 500) => ({
    id,
    valor,
    vencimento: new Date(2026, 8, 10 + dias),
    descricao: `OS20260042 (${id})`,
    jaEnviadas: 0,
    idadeEmDias: 30,
    pagadorId,
  })

  it("três parcelas do mesmo pagador viram UM grupo", () => {
    // Sem isto, um 3x vencido dispara três mensagens quase idênticas no mesmo
    // minuto para o mesmo WhatsApp — e a coincidência é a regra: os prazos que
    // a tela de parcelamento sugere (7, 15, 30) batem com os degraus (1, 7,
    // 15, 30).
    const g = agruparPorPagador([conta("a", "p1", 0), conta("b", "p1", 7), conta("c", "p1", 14)])

    expect(g).toHaveLength(1)
    expect(g[0].contas).toHaveLength(3)
    expect(g[0].total).toBe(1500)
  })

  it("o TOM sai da conta mais atrasada", () => {
    // Uma dívida com parcela vencida há trinta dias não vira lembrete gentil
    // porque há outra vencendo amanhã.
    const g = agruparPorPagador([conta("nova", "p1", 20), conta("velha", "p1", 0)])
    expect(g[0].principal.id).toBe("velha")
  })

  it("pagadores diferentes NÃO se misturam", () => {
    const g = agruparPorPagador([conta("a", "p1", 0), conta("b", "p2", 0)])
    expect(g).toHaveLength(2)
  })

  it("os grupos saem do mais antigo para o mais novo", () => {
    // É a ordem em que a empresa cobra, e a que importa quando o teto do cron
    // corta a fila no meio.
    const g = agruparPorPagador([conta("a", "p1", 20), conta("b", "p2", 0)])
    expect(g.map((x) => x.pagadorId)).toEqual(["p2", "p1"])
  })

  it("o total soma em centavos, sem sobra binária", () => {
    const g = agruparPorPagador([conta("a", "p1", 0, 0.1), conta("b", "p1", 1, 0.2)])
    expect(g[0].total).toBe(0.3)
  })

  it("o mínimo passa a valer contra a DÍVIDA, e não contra a linha", () => {
    // Empresa com mínimo de R$ 300 e serviço de R$ 2.000 em dez vezes de
    // R$ 200 deixava de cobrar TODAS as parcelas — dívida de dois mil reais,
    // silêncio total.
    const config = { ...REGUA_PADRAO, ativo: true, valorMinimo: 300 }
    const g = agruparPorPagador(Array.from({ length: 10 }, (_, i) => conta(`p${i}`, "p1", 0, 200)))

    expect(g[0].total).toBe(2000)
    const d = decidirCobranca({
      dias: 1, jaEnviadas: 0, paga: false, valor: g[0].total, config, idadeEmDias: 30,
    })
    expect(d.enviar).toBe(true)

    // E a linha sozinha continuaria sendo silenciada, que era o defeito.
    const linha = decidirCobranca({
      dias: 1, jaEnviadas: 0, paga: false, valor: 200, config, idadeEmDias: 30,
    })
    expect(linha.enviar).toBe(false)
  })
})

describe("o texto com várias parcelas", () => {
  const t = (chave: string, vals?: Record<string, string>) =>
    vals ? `${chave}:${JSON.stringify(vals)}` : chave

  it("lista as parcelas E diz o total em aberto", () => {
    // Mandar três mensagens de R$ 500 esconde que a dívida é de R$ 1.500 — que
    // é justamente o número que faz o cliente resolver.
    const texto = textoAgrupado(
      "venceu",
      {
        empresa: "Polar Clima",
        linhas: [
          { descricao: "OS20260042 (1/3)", valor: "R$ 500,00", vencimento: "10/09/2026" },
          { descricao: "OS20260042 (2/3)", valor: "R$ 500,00", vencimento: "17/09/2026" },
        ],
        total: "R$ 1.000,00",
      },
      t
    )

    expect(texto).toContain("1/3")
    expect(texto).toContain("2/3")
    expect(texto).toContain("totalEmAberto")
    expect(texto).toContain("R$ 1.000,00")
    // O perdão continua em toda mensagem: baixa de pagamento atrasa.
    expect(texto).toContain("desconsidere")
  })

  it("leva o LINK do portal quando há", () => {
    // A linha "Detalhes: <url>" existia no código desde sempre e ninguém
    // passava o campo — o cliente lia "venceu R$ 500" e não tinha onde clicar.
    const comLink = textoAgrupado(
      "venceu",
      { empresa: "X", linhas: [], total: "R$ 0,00", portalUrl: "https://x/p/tok" },
      t
    )
    expect(comLink).toContain("https://x/p/tok")

    const semLink = textoAgrupado("venceu", { empresa: "X", linhas: [], total: "R$ 0,00" }, t)
    expect(semLink).not.toContain("detalhes")
  })
})
