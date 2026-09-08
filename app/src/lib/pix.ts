// Código PIX "Copia e Cola" (BR Code) para cobrar o cliente final.
//
// Por que PIX e não um gateway: cada empresa usa o banco que já tem. Exigir
// conta em Asaas, Mercado Pago ou qualquer outro seria empurrar um cadastro a
// mais antes de a empresa conseguir receber. Toda empresa brasileira já tem
// chave PIX, e todo cliente final já sabe pagar por PIX.
//
// O padrão é aberto (EMV/BR Code, do Banco Central), então o código é montado
// aqui: sem API, sem chave secreta, sem intermediário. O dinheiro vai direto
// da conta do cliente final pra conta da empresa — o ServiçoOS só imprime o
// código. Nunca tocamos no dinheiro, o que também nos mantém fora de qualquer
// obrigação de instituição de pagamento.
//
// Módulo puro, e testado com rigor: o código termina num CRC, e CRC errado faz
// o app do banco RECUSAR o pagamento. Você só descobriria com um cliente real
// tentando pagar e não conseguindo.

export type TipoChavePix = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA"

export const TIPOS_CHAVE: TipoChavePix[] = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]

/**
 * CRC-16/CCITT-FALSE — polinômio 0x1021, início 0xFFFF, sem reflexão.
 *
 * É o algoritmo que o BR Code exige. A verificação canônica dele: o CRC da
 * string "123456789" tem que dar 0x29B1. Há teste pra isso, e ele vale mais
 * que qualquer exemplo de PIX copiado de algum lugar — a constante é oficial
 * do próprio algoritmo.
 */
export function crc16(texto: string): number {
  let crc = 0xffff
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc & 0xffff
}

/** Campo no formato do BR Code: id + tamanho com 2 dígitos + valor. */
export function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`
}

/**
 * Tira acento e caractere fora do ASCII imprimível.
 *
 * O BR Code é lido por milhares de apps de banco diferentes, e vários
 * engasgam com acento. "Manutenção Predial" vira "Manutencao Predial" — feio,
 * mas pago; o contrário é bonito e recusado.
 */
export function limparTexto(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim()
}

/** Normaliza a chave conforme o tipo. Telefone e documento vão só com dígitos. */
export function normalizarChave(chave: string, tipo: TipoChavePix): string {
  const limpa = chave.trim()
  if (tipo === "EMAIL") return limpa.toLowerCase()
  if (tipo === "ALEATORIA") return limpa.toLowerCase()
  const digitos = limpa.replace(/\D/g, "")
  // Telefone vai no formato internacional, como o padrão exige.
  if (tipo === "TELEFONE") return digitos.startsWith("55") ? `+${digitos}` : `+55${digitos}`
  return digitos
}

export function chaveValida(chave: string, tipo: TipoChavePix): boolean {
  const v = normalizarChave(chave, tipo)
  if (tipo === "CPF") return v.length === 11
  if (tipo === "CNPJ") return v.length === 14
  if (tipo === "EMAIL") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 77
  if (tipo === "TELEFONE") return /^\+55\d{10,11}$/.test(v)
  // Chave aleatória é um UUID.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
}

export type DadosPix = {
  chave: string
  tipoChave: TipoChavePix
  /** Nome de quem recebe. Máx. 25 no padrão. */
  recebedor: string
  /** Cidade do recebedor. Máx. 15 no padrão. */
  cidade: string
  /** Em reais. Ausente = o pagador digita o valor. */
  valor?: number | null
  /** Identificador da cobrança, aparece no extrato. Máx. 25. */
  identificador?: string | null
}

/**
 * Monta o "Copia e Cola".
 *
 * A ordem dos campos e o cálculo do CRC seguem o BR Code: o CRC é calculado
 * sobre a string inteira JÁ COM "6304" no fim, e só então os 4 dígitos são
 * acrescentados. Inverter isso gera um código que parece certo e é recusado.
 */
export function gerarCodigoPix(dados: DadosPix): string {
  const chave = normalizarChave(dados.chave, dados.tipoChave)

  const contaPix = campo("00", "br.gov.bcb.pix") + campo("01", chave)

  // "***" é o valor que o padrão define para "sem identificador próprio".
  const idBruto = dados.identificador ? limparTexto(dados.identificador, 25) : ""
  const id = idBruto.replace(/[^A-Za-z0-9]/g, "") || "***"

  let payload =
    campo("00", "01") +
    // 12 = cobrança de uso único. Faz o app do banco tratar como pagamento
    // específico em vez de chave salva pra reuso.
    campo("01", "12") +
    campo("26", contaPix) +
    campo("52", "0000") +
    campo("53", "986")

  if (dados.valor !== null && dados.valor !== undefined && dados.valor > 0) {
    payload += campo("54", dados.valor.toFixed(2))
  }

  payload +=
    campo("58", "BR") +
    campo("59", limparTexto(dados.recebedor, 25) || "RECEBEDOR") +
    campo("60", limparTexto(dados.cidade, 15) || "BRASIL") +
    campo("62", campo("05", id))

  const comMarcador = payload + "6304"
  return comMarcador + crc16(comMarcador).toString(16).toUpperCase().padStart(4, "0")
}

/**
 * Configuração PIX da empresa, do jeito que sai do banco (tudo opcional).
 * Cobrar por PIX é opt-in: quem não configurou continua com o documento
 * exatamente como era antes.
 */
export type PixDoTenant = {
  pixKey: string | null
  pixKeyType: string | null
  pixReceiver: string | null
  pixCity: string | null
}

export type Cobranca = {
  /** O "copia e cola" completo. */
  codigo: string
  /** A chave como a empresa cadastrou — é o que se digita no app do banco. */
  chave: string
  recebedor: string
}

/**
 * Cobrança de uma OS/orçamento, ou null quando não dá pra cobrar.
 *
 * Devolve null em vez de lançar: um PIX mal configurado não pode derrubar a
 * geração da OS. O documento sai sem o bloco de pagamento e o serviço segue.
 *
 * Devolve também chave e recebedor já resolvidos porque todo lugar que mostra
 * o código mostra os dois junto — e assim ninguém precisa repetir (e errar) a
 * regra de quando eles existem.
 */
export function cobrancaPix(
  tenant: PixDoTenant,
  valor: number | null | undefined,
  identificador?: string | null
): Cobranca | null {
  const tipo = TIPOS_CHAVE.find((x) => x === tenant.pixKeyType)
  if (!tenant.pixKey || !tipo || !tenant.pixReceiver || !tenant.pixCity) return null
  if (!chaveValida(tenant.pixKey, tipo)) return null
  return {
    codigo: gerarCodigoPix({
      chave: tenant.pixKey,
      tipoChave: tipo,
      recebedor: tenant.pixReceiver,
      cidade: tenant.pixCity,
      valor,
      identificador,
    }),
    chave: tenant.pixKey,
    recebedor: tenant.pixReceiver,
  }
}

/** O código já gerado está íntegro? Usado em teste e em diagnóstico. */
export function codigoIntegro(codigo: string): boolean {
  if (codigo.length < 8) return false
  const corpo = codigo.slice(0, -4)
  const informado = codigo.slice(-4).toUpperCase()
  return crc16(corpo).toString(16).toUpperCase().padStart(4, "0") === informado
}
