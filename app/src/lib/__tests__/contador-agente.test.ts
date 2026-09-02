import { describe, expect, it } from "vitest"
import { montarBalanco, type NumerosDaEmpresa } from "@/lib/balanco"
import {
  conferirBalanco,
  DIAS_RECEBIVEL_VELHO,
  veredito,
  type FatosDaEmpresa,
} from "@/lib/contador-agente"

const numeros: NumerosDaEmpresa = {
  caixaInicial: 5000,
  recebido: 42000,
  pago: 31000,
  aReceber: 8500,
  aPagar: 6200,
  estoque: 3400,
  imobilizadoBruto: 60000,
  depreciacao: 12000,
  capitalSocial: 20000,
  manuais: [],
}

const fatosLimpos: FatosDaEmpresa = {
  pecasSemCusto: 0,
  recebiveisVelhos: { quantidade: 0, valor: 0 },
  bens: 3,
  bensSemNota: 0,
  bensZerados: 0,
  caixaInicialInformado: true,
  temMovimento: true,
}

const conferir = (n: Partial<NumerosDaEmpresa> = {}, f: Partial<FatosDaEmpresa> = {}) =>
  conferirBalanco(montarBalanco({ ...numeros, ...n }), { ...fatosLimpos, ...f })

const chaves = (achados: ReturnType<typeof conferir>) => achados.map((a) => a.chave)

describe("a empresa em ordem", () => {
  it("só recebe a explicação da depreciação", () => {
    // A depreciação reduz o patrimônio AQUI e não aparece como despesa no
    // Financeiro, porque não saiu dinheiro. Quem compara as duas telas estranha
    // — e estranhar sem explicação vira desconfiança do sistema inteiro.
    const a = conferir()
    expect(chaves(a)).toEqual(["depreciacaoForaDoCaixa"])
    expect(a[0].dados).toEqual({ depreciacao: 12000 })
    expect(veredito(a)).toBe("ok")
  })

  it("sem bem nenhum, nem essa explicação aparece", () => {
    const a = conferir({ imobilizadoBruto: 0, depreciacao: 0 }, { bens: 0, temMovimento: false })
    expect(chaves(a)).toEqual([])
    expect(veredito(a)).toBe("ok")
  })
})

describe("caixa negativo", () => {
  it("é o achado que IMPEDE, e diz que falta o caixa inicial", () => {
    // O caso mais comum de todos, e quase nunca é dinheiro: é a empresa que já
    // existia antes do sistema e nunca informou quanto tinha no primeiro dia.
    const a = conferir({ caixaInicial: 0, recebido: 1000, pago: 9000 }, { caixaInicialInformado: false })
    expect(a[0].chave).toBe("caixaNegativoSemInicial")
    expect(a[0].gravidade).toBe("impede")
    expect(a[0].dados).toEqual({ caixa: -8000 })
    expect(a[0].ir).toBe("/balanco")
    expect(veredito(a)).toBe("impede")
  })

  it("com o inicial JÁ informado, a mensagem é outra", () => {
    // Aí não é cadastro faltando: ou o dinheiro acabou mesmo, ou há despesa
    // marcada como paga que não saiu. Mandar de novo para o mesmo campo seria
    // mandar a pessoa consertar o que já está certo.
    const a = conferir({ caixaInicial: 100, recebido: 1000, pago: 9000 })
    expect(a[0].chave).toBe("caixaNegativoComInicial")
  })

  it("caixa exatamente zero NÃO é achado", () => {
    const a = conferir({ caixaInicial: 0, recebido: 1000, pago: 1000 })
    expect(chaves(a)).not.toContain("caixaNegativoSemInicial")
    expect(chaves(a)).not.toContain("caixaNegativoComInicial")
  })
})

describe("patrimônio líquido negativo", () => {
  it("é apontado quando o caixa está de pé", () => {
    const a = conferir({ caixaInicial: 1000, recebido: 0, pago: 0, aReceber: 0, estoque: 0, imobilizadoBruto: 0, depreciacao: 0, aPagar: 40000 })
    const pl = a.find((x) => x.chave === "plNegativo")!
    expect(pl.gravidade).toBe("impede")
    expect(pl.dados!.pl).toBe(-39000)
  })

  it("NÃO aparece junto do caixa negativo — seria eco da mesma causa", () => {
    // Com o caixa negativo o PL negativo vem do mesmo defeito. Apontar os dois
    // faria o dono perseguir duas causas quando há uma, que é como uma lista de
    // conferência perde a credibilidade.
    const a = conferir(
      { caixaInicial: 0, recebido: 0, pago: 50000, aReceber: 0, estoque: 0, imobilizadoBruto: 0, depreciacao: 0 },
      { caixaInicialInformado: false }
    )
    expect(chaves(a)).toContain("caixaNegativoSemInicial")
    expect(chaves(a)).not.toContain("plNegativo")
  })
})

describe("capital social", () => {
  it("ausente é atenção, e a empresa parece ter nascido do nada", () => {
    const a = conferir({ capitalSocial: 0 })
    const c = a.find((x) => x.chave === "semCapitalSocial")!
    expect(c.gravidade).toBe("atencao")
    expect(c.ir).toBe("/balanco")
  })

  it("não cobra capital de empresa com patrimônio zero", () => {
    // Empresa sem nada ainda não precisa explicar de onde veio o nada.
    const a = conferir({
      caixaInicial: 0,
      recebido: 0,
      pago: 0,
      aReceber: 0,
      aPagar: 0,
      estoque: 0,
      imobilizadoBruto: 0,
      depreciacao: 0,
      capitalSocial: 0,
    })
    expect(chaves(a)).not.toContain("semCapitalSocial")
  })
})

describe("estoque subavaliado", () => {
  it("peça com saldo e sem custo entra valendo ZERO", () => {
    // Ela existe na prateleira e não existe no ativo.
    const a = conferir({}, { pecasSemCusto: 12 })
    const e = a.find((x) => x.chave === "estoqueSemCusto")!
    expect(e.gravidade).toBe("atencao")
    expect(e.dados).toEqual({ pecas: 12 })
    expect(e.ir).toBe("/parts")
  })
})

describe("recebível velho", () => {
  it("leva o valor, a quantidade e o prazo para a mensagem", () => {
    const a = conferir({}, { recebiveisVelhos: { quantidade: 4, valor: 3200 } })
    const r = a.find((x) => x.chave === "recebivelVelho")!
    expect(r.dados).toEqual({ quantidade: 4, valor: 3200, dias: DIAS_RECEBIVEL_VELHO })
    expect(r.ir).toBe("/finance")
  })

  it("o prazo é 180 dias", () => {
    expect(DIAS_RECEBIVEL_VELHO).toBe(180)
  })
})

describe("os bens", () => {
  it("nenhum bem cadastrado avisa quem JÁ usa o sistema", () => {
    const a = conferir({}, { bens: 0, temMovimento: true })
    expect(chaves(a)).toContain("semBens")
  })

  it("empresa nova não recebe esse aviso", () => {
    // No primeiro dia não haver bem ainda é normal, e o aviso seria ruído.
    const a = conferir({}, { bens: 0, temMovimento: false })
    expect(chaves(a)).not.toContain("semBens")
  })

  it("bem sem nota e bem já zerado são informativos", () => {
    const a = conferir({}, { bensSemNota: 2, bensZerados: 1 })
    expect(a.find((x) => x.chave === "bemSemNota")!.dados).toEqual({ bens: 2 })
    expect(a.find((x) => x.chave === "bemZerado")!.dados).toEqual({ bens: 1 })
    expect(veredito(a)).toBe("ok")
  })
})

describe("a ordem e o veredito", () => {
  it("o que impede vem antes do que só informa", () => {
    const a = conferir(
      { caixaInicial: 0, recebido: 0, pago: 9000, capitalSocial: 0 },
      { caixaInicialInformado: false, bensSemNota: 3 }
    )
    const pesos = a.map((x) => x.gravidade)
    expect(pesos).toEqual([...pesos].sort((p, q) => {
      const ordem = { impede: 0, atencao: 1, informa: 2 }
      return ordem[p] - ordem[q]
    }))
    expect(a[0].gravidade).toBe("impede")
    expect(veredito(a)).toBe("impede")
  })

  it("uma atenção sozinha não vira impedimento", () => {
    expect(veredito(conferir({ capitalSocial: 0 }))).toBe("atencao")
  })

  it("identidade quebrada é defeito de programação, e vem primeiro de tudo", () => {
    // Fecha por construção. Se não fechar, o erro é do código do balanço — e é
    // grave o bastante para aparecer na frente do caixa negativo.
    const b = montarBalanco(numeros)
    const quebrado = { ...b, fecha: false, caixa: -1 }
    const a = conferirBalanco(quebrado, fatosLimpos)
    expect(a[0].chave).toBe("naoFecha")
    expect(a[0].gravidade).toBe("impede")
  })
})
