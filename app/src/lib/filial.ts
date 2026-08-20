// Filiais: uma empresa com mais de uma unidade.
//
// ─── O que é escopado, e o que NÃO é ─────────────────────────────────────────
//
// Escopado por filial:  clientes, ordens de serviço, agenda, financeiro
//                       (receitas e despesas) e a equipe.
// Compartilhado:        estoque e peças, fornecedores e compras, orçamentos,
//                       contratos, configurações, plano e cobrança.
//
// A lista de compartilhados é decisão, não esquecimento. 447 consultas do
// sistema filtram por tenantId; escopar todas por filial seria reescrever o
// sistema inteiro de uma vez, e uma filial meio-feita — em que algumas telas
// filtram e outras não — é PIOR que nenhuma: ela promete separação e vaza.
// Melhor separar o que dá para separar inteiro e dizer na tela o que é comum.
//
// ─── A regra que evita o desastre óbvio ──────────────────────────────────────
//
// **Registro SEM filial é visto por todo mundo.** Sem isso, criar a primeira
// filial faria a base histórica inteira da empresa desaparecer da tela — anos
// de cliente e OS sumindo de uma vez porque alguém cadastrou "Unidade Centro".
// Ninguém entenderia que os dados continuam lá.
//
// Módulo puro: o escopo decide o que cada pessoa enxerga, e isso precisa ser
// reproduzível num teste. Erro aqui não dá erro na tela — mostra os dados da
// filial errada, calado.

/** Quem está olhando. */
export type Observador = {
  role: string
  /** A filial da pessoa, ou null quando ela não está presa a nenhuma. */
  branchId: string | null
  /** A empresa tem o recurso de filiais — é do plano Enterprise. */
  temFiliais: boolean
}

export type Escopo =
  /** Vê tudo da empresa. */
  | { tipo: "tudo" }
  /** Vê a filial indicada, mais o que não tem filial. */
  | { tipo: "filial"; branchId: string }

/**
 * O escopo de quem está olhando.
 *
 * `escolhida` é o filtro que dono/administrador aplicam na tela. Só vale para
 * eles: se valesse para todos, bastaria trocar o parâmetro na URL para ler a
 * filial vizinha — e o seletor de tela viraria a autorização, que é o erro
 * clássico de confiar no que o navegador manda.
 */
export function escopoDe(quem: Observador, escolhida?: string | null): Escopo {
  // Sem o recurso, filial não existe: todo mundo vê tudo.
  //
  // É o que faz um downgrade de Enterprise para Pro DEVOLVER a visão completa,
  // em vez de deixar a equipe presa a uma divisão que ninguém mais consegue
  // administrar — a tela que cria e vincula filial também some com o plano.
  // As colunas continuam gravadas: voltar para o Enterprise restaura tudo como
  // estava, sem ninguém precisar recadastrar.
  //
  // A direção segura é essa. Errar para "mostra mais" mostra dados da PRÓPRIA
  // empresa a quem já tem acesso à empresa; errar para "mostra menos" esconde
  // o trabalho da pessoa e ela não tem como saber que ele existe.
  if (!quem.temFiliais) return { tipo: "tudo" }

  if (quem.role === "OWNER" || quem.role === "ADMIN") {
    return escolhida ? { tipo: "filial", branchId: escolhida } : { tipo: "tudo" }
  }
  // Sem filial vinculada, a pessoa continua vendo tudo: é o comportamento de
  // hoje, e o que mantém quem nunca usou filial trabalhando igual.
  return quem.branchId ? { tipo: "filial", branchId: quem.branchId } : { tipo: "tudo" }
}

/**
 * O trecho de `where` que o Prisma entende. Objeto vazio quando é tudo — que
 * é justamente o que espalhar num spread não muda nada.
 *
 * **`AND` envolvendo o `OR`, e não um `OR` solto.** As consultas de cliente e
 * de OS já usam `OR` no nível de cima, para a busca por texto. Espalhar outro
 * `OR` ali substituiria o da busca em silêncio: a pesquisa pararia de filtrar
 * e a listagem passaria a devolver a base inteira, parecendo funcionar. Dentro
 * de `AND`, as duas condições convivem.
 */
export function filtroDeFilial(escopo: Escopo) {
  if (escopo.tipo === "tudo") return {}
  // O `OR` com null é o que mantém o registro antigo, sem filial, visível. Ver
  // o cabeçalho — sem isto, ligar filiais apaga a base da tela.
  return { AND: [{ OR: [{ branchId: escopo.branchId }, { branchId: null }] }] }
}

/**
 * A filial que um registro NOVO recebe.
 *
 * Herda de onde faz sentido — a OS pega a do cliente, e não a de quem digitou:
 * o cliente é da unidade que o atende, e um atendente da matriz cadastrando
 * uma OS para um cliente da filial não muda de quem é aquele cliente.
 * Quando não há de onde herdar, fica sem filial — que é visível para todos, e
 * não escondido de todos.
 */
export function filialParaNovo(
  herdada: string | null | undefined,
  doAutor: string | null
): string | null {
  return herdada ?? doAutor ?? null
}

/**
 * Pode mover/atribuir para esta filial?
 *
 * A lista vem do banco (as filiais ATIVAS da empresa). Sem conferir, um id
 * qualquer vindo do formulário viraria o branchId do registro — inclusive o id
 * de uma filial de outra empresa, que depois some das duas telas.
 */
export function filialValida(id: string | null | undefined, ativas: readonly string[]): string | null {
  if (!id) return null
  return ativas.includes(id) ? id : null
}
