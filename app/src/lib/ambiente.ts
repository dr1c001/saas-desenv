// Em qual ambiente este código está rodando.
//
// Existe por causa de um risco específico: um ambiente de teste que envia
// e-mail de verdade para o cliente final, emite nota fiscal de verdade ou cria
// cobrança de verdade é PIOR que não ter ambiente de teste nenhum — o estrago
// acontece justamente enquanto alguém acha que está "só testando".
//
// A decisão é por lista de permissão, não de bloqueio: só o que for
// comprovadamente produção pode tocar o mundo real. Variável faltando, valor
// estranho, ambiente novo — tudo cai em "não é produção" e fica contido.

export type Ambiente = "producao" | "teste" | "local"

/**
 * VERCEL_ENV é definida pela própria Vercel: "production" no domínio real,
 * "preview" em qualquer outro deploy. Localmente não existe.
 */
export function ambiente(): Ambiente {
  const vercel = process.env.VERCEL_ENV
  if (vercel === "production") return "producao"
  if (vercel) return "teste"
  return "local"
}

export function ehProducao(): boolean {
  return ambiente() === "producao"
}

/**
 * Para onde vai qualquer e-mail fora de produção.
 *
 * Não é "não enviar": e-mail que não sai não pode ser conferido, e metade do
 * motivo de existir um ambiente de teste é justamente ver o e-mail chegar.
 * Então ele sai — mas sempre para o dono, nunca para o endereço real.
 */
export function destinoDeEmailDeTeste(): string | null {
  return process.env.STAGING_EMAIL || process.env.SUPER_ADMIN_EMAIL || null
}

/** Prefixo no assunto, pra ninguém confundir e-mail de teste com o real. */
export function prefixoDeAssunto(): string {
  return ehProducao() ? "" : `[${ambiente().toUpperCase()}] `
}

/**
 * Barra uma operação que não tem como ser desfeita nem simulada.
 *
 * Emitir NFS-e é o caso: gera documento fiscal de verdade, com número, na
 * prefeitura. Não existe "modo de teste" — ou emite, ou não emite. Então fora
 * de produção nem tenta.
 */
export function bloquearForaDeProducao(operacao: string): void {
  if (ehProducao()) return
  throw new Error(
    `[${ambiente()}] Operação bloqueada fora de produção: ${operacao}. ` +
      `Isto seria irreversível no mundo real.`
  )
}
