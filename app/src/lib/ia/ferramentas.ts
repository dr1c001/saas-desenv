// O que a assistente de voz pode fazer.
//
// ─── A decisão que governa este arquivo ──────────────────────────────────────
//
// A assistente NÃO fala com o banco. Ela chama as MESMAS funções que a tela
// chama — `createServiceOrder`, `completeServiceOrder`, `emitNfse`. Isso não é
// preguiça de arquitetura, é o que torna a coisa segura:
//
//   - o tenant vem da sessão, dentro da action. O modelo não tem como informar
//     um tenantId, então não tem como alcançar dados de outra empresa;
//   - a permissão é conferida lá dentro (`checarAcao`), então um técnico
//     falando com a assistente tem exatamente os mesmos poderes que teria
//     clicando — nem um a mais;
//   - a cota do plano é conferida lá dentro (`requireCotaDeOs`), então não dá
//     para furar o limite de OS do plano pedindo por voz.
//
// Uma camada de IA que falasse direto com o banco teria de reimplementar as
// três coisas, e cada uma reimplementada é uma chance de divergir da original.
//
// ─── Confirmação ─────────────────────────────────────────────────────────────
//
// Reconhecimento de fala erra, e erra mais em casa de máquinas, na rua, ao lado
// de um compressor. "Cancela a última" mal ouvido, executado direto, é a OS
// errada cancelada sem desfazer.
//
// Por isso o risco de cada ferramenta é declarado aqui, e o que é irreversível
// SEMPRE passa por uma confirmação que mostra, em português, o que vai
// acontecer — com o nome do cliente e o número da OS, não com o id. Quem
// confirma precisa conseguir perceber que a assistente entendeu errado.
//
// `emitir_nota_fiscal` é o caso extremo: emitir NFS-e é ato perante a
// prefeitura, em nome da empresa. Nunca sai sem alguém ver antes.

import type { Acao } from "@/lib/acoes"

/** O que acontece se a assistente errar esta chamada. */
export type Risco =
  /** Só lê. Errar significa uma resposta errada, não um estrago. */
  | "leitura"
  /** Grava algo que dá para desfazer pela tela. */
  | "escrita"
  /** Não dá para desfazer, ou tem efeito fora do sistema. */
  | "irreversivel"

export type Ferramenta = {
  /** O nome que o modelo chama. Em português: o modelo raciocina em português
   *  com o usuário, e nome misturado confunde mais do que ajuda. */
  nome: string
  risco: Risco
  /**
   * A permissão exigida.
   *
   * A action confere de novo — esta declaração serve para NÃO OFERECER ao
   * modelo o que a pessoa não pode fazer. Oferecer e falhar depois faria a
   * assistente prometer coisas que o técnico não pode, que é pior que não
   * oferecer.
   */
  acao?: Acao
  /** Só o dono/administrador. */
  soAdmin?: boolean
  /** O que a ferramenta faz, escrito para o modelo ler. */
  descricao: string
  /** JSON Schema dos argumentos, no formato que a API de ferramentas espera. */
  parametros: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
  /** Grava, mesmo sendo "escrita", e por isso pede confirmação assim mesmo. */
  sempreConfirmar?: boolean
}

/** Esta chamada precisa que uma pessoa confirme antes de acontecer? */
export function precisaConfirmar(f: Ferramenta): boolean {
  return f.risco === "irreversivel" || f.sempreConfirmar === true
}

const texto = (descricao: string) => ({ type: "string", description: descricao })

export const FERRAMENTAS: readonly Ferramenta[] = [
  // ─── Navegar ──────────────────────────────────────────────────────────────
  {
    nome: "abrir_tela",
    risco: "leitura",
    descricao:
      "Abre uma tela do sistema. Use quando a pessoa pedir para ir a algum lugar " +
      "('abre os orçamentos', 'vai pro estoque', 'me leva pro 3.2'). Aceita o " +
      "número da tela ou o nome.",
    parametros: {
      type: "object",
      properties: {
        destino: texto("Número da tela (ex: '1.1', '3.2') ou o nome ('orçamentos', 'estoque')."),
      },
      required: ["destino"],
    },
  },

  // ─── Ler ──────────────────────────────────────────────────────────────────
  {
    nome: "listar_ordens",
    risco: "leitura",
    descricao:
      "Lista ordens de serviço. Use para 'quais OS eu tenho hoje', 'o que está " +
      "em aberto', 'as OS do cliente João'.",
    parametros: {
      type: "object",
      properties: {
        busca: texto("Texto para buscar no título ou no nome do cliente."),
        status: {
          type: "string",
          enum: ["OPEN", "IN_PROGRESS", "DONE", "INVOICED", "CANCELLED"],
          description: "Filtra por status. Omita para trazer todas.",
        },
      },
    },
  },
  {
    nome: "buscar_cliente",
    risco: "leitura",
    descricao:
      "Procura um cliente pelo nome, documento ou telefone, e devolve os dados " +
      "e o histórico dele.",
    parametros: {
      type: "object",
      properties: { busca: texto("Nome, CPF/CNPJ ou telefone.") },
      required: ["busca"],
    },
  },
  {
    nome: "agenda_do_dia",
    risco: "leitura",
    descricao:
      "As ordens de serviço agendadas para um dia. Use para 'o que eu tenho " +
      "hoje', 'e amanhã?'.",
    parametros: {
      type: "object",
      properties: { data: texto("Data no formato AAAA-MM-DD. Omita para hoje.") },
    },
  },
  {
    nome: "situacao_financeira",
    risco: "leitura",
    soAdmin: true,
    descricao:
      "Resumo do financeiro: receita do mês, quanto há a receber e a pagar, e o " +
      "que está vencido.",
    parametros: { type: "object", properties: {} },
  },
  {
    nome: "consultar_estoque",
    risco: "leitura",
    descricao:
      "Saldo das peças. Sem busca, traz as que estão abaixo do mínimo — que é o " +
      "que interessa na maior parte das vezes.",
    parametros: {
      type: "object",
      properties: { busca: texto("Nome ou código da peça.") },
    },
  },

  // ─── Escrever (dá para desfazer pela tela) ────────────────────────────────
  {
    nome: "criar_ordem",
    risco: "escrita",
    acao: "os.criar",
    descricao:
      "Abre uma nova ordem de serviço. Peça o cliente e o título antes de " +
      "chamar; o resto é opcional.",
    parametros: {
      type: "object",
      properties: {
        cliente: texto("Nome do cliente. Precisa já estar cadastrado."),
        titulo: texto("O que será feito. Ex: 'Troca de compressor'."),
        descricao: texto("O problema relatado pelo cliente."),
        agendamento: texto("Data e hora no formato AAAA-MM-DDTHH:mm."),
        responsavel: texto("Nome de quem vai executar."),
      },
      required: ["cliente", "titulo"],
    },
  },
  {
    nome: "mudar_status_ordem",
    risco: "escrita",
    acao: "os.status",
    descricao:
      "Muda o status de uma ordem de serviço. Use para 'iniciar atendimento' " +
      "(IN_PROGRESS) e para reabrir (OPEN). Para CONCLUIR use concluir_ordem.",
    parametros: {
      type: "object",
      properties: {
        numero: texto("O número da OS."),
        status: { type: "string", enum: ["OPEN", "IN_PROGRESS"] },
      },
      required: ["numero", "status"],
    },
  },
  {
    nome: "reagendar_ordem",
    risco: "escrita",
    acao: "os.reagendar",
    descricao: "Muda a data e hora agendadas de uma ordem de serviço.",
    parametros: {
      type: "object",
      properties: {
        numero: texto("O número da OS."),
        quando: texto("Nova data e hora, no formato AAAA-MM-DDTHH:mm."),
      },
      required: ["numero", "quando"],
    },
  },
  {
    nome: "adicionar_item_checklist",
    risco: "escrita",
    acao: "os.checklist",
    descricao: "Acrescenta uma etapa ao checklist de execução de uma ordem.",
    parametros: {
      type: "object",
      properties: {
        numero: texto("O número da OS."),
        item: texto("A etapa. Ex: 'Testar pressão da linha'."),
      },
      required: ["numero", "item"],
    },
  },
  {
    nome: "criar_cliente",
    risco: "escrita",
    acao: "cliente.criar",
    descricao:
      "Cadastra um cliente novo. Só o nome é obrigatório; peça telefone e "  +
      "documento se a pessoa tiver à mão, mas não trave o cadastro por isso.",
    parametros: {
      type: "object",
      properties: {
        nome: texto("Nome completo ou razão social."),
        telefone: texto("Telefone com DDD."),
        documento: texto("CPF ou CNPJ."),
        email: texto("E-mail."),
      },
      required: ["nome"],
    },
  },
  {
    nome: "movimentar_estoque",
    risco: "escrita",
    soAdmin: true,
    sempreConfirmar: true,
    descricao:
      "Registra entrada, saída ou ajuste de uma peça. ATENÇÃO: em AJUSTE a " +
      "quantidade é o saldo CONTADO na prateleira, não a diferença.",
    parametros: {
      type: "object",
      properties: {
        peca: texto("Nome ou código da peça."),
        tipo: { type: "string", enum: ["ENTRADA", "SAIDA", "AJUSTE"] },
        quantidade: { type: "number", description: "Quantidade. Em AJUSTE, o saldo contado." },
        motivo: texto("Por que. Obrigatório em AJUSTE."),
      },
      required: ["peca", "tipo", "quantidade"],
    },
  },

  // ─── Irreversível (nunca sem confirmação) ─────────────────────────────────
  {
    nome: "concluir_ordem",
    risco: "irreversivel",
    acao: "os.concluir",
    descricao:
      "Conclui uma ordem de serviço. Grava a receita e baixa o estoque das " +
      "peças usadas. Se faturar_agora for verdadeiro, a OS já sai como faturada.",
    parametros: {
      type: "object",
      properties: {
        numero: texto("O número da OS."),
        conclusao: texto("Descrição dos serviços realizados."),
        faturar_agora: {
          type: "boolean",
          description: "Verdadeiro gera o lançamento a receber na hora.",
        },
      },
      required: ["numero", "conclusao"],
    },
  },
  {
    nome: "emitir_nota_fiscal",
    risco: "irreversivel",
    soAdmin: true,
    descricao:
      "Emite a NFS-e de uma ordem de serviço. É um ato perante a prefeitura, em " +
      "nome da empresa, e não se desfaz por aqui.",
    parametros: {
      type: "object",
      properties: { numero: texto("O número da OS.") },
      required: ["numero"],
    },
  },
  {
    nome: "excluir_ordem",
    risco: "irreversivel",
    soAdmin: true,
    descricao: "Apaga uma ordem de serviço. Não dá para recuperar.",
    parametros: {
      type: "object",
      properties: { numero: texto("O número da OS.") },
      required: ["numero"],
    },
  },
  {
    nome: "excluir_cliente",
    risco: "irreversivel",
    soAdmin: true,
    descricao:
      "Apaga um cliente. Não dá para recuperar, e leva junto o vínculo com o " +
      "histórico dele.",
    parametros: {
      type: "object",
      properties: { nome: texto("Nome do cliente, exatamente como cadastrado.") },
      required: ["nome"],
    },
  },
]

/**
 * As ferramentas que ESTA pessoa pode usar.
 *
 * Filtra pelo papel e pelas ações liberadas. Um técnico sem `os.concluir` não
 * recebe a ferramenta de concluir — então a assistente não promete concluir e
 * falha depois, que é a pior das combinações: ela pareceria quebrada, quando na
 * verdade a empresa é que decidiu não liberar aquilo.
 */
export function ferramentasPara(
  ehAdmin: boolean,
  acoesLiberadas: readonly Acao[]
): Ferramenta[] {
  return FERRAMENTAS.filter((f) => {
    if (f.soAdmin && !ehAdmin) return false
    if (f.acao && !ehAdmin && !acoesLiberadas.includes(f.acao)) return false
    return true
  })
}

/** Acha a ferramenta pelo nome que o modelo chamou. */
export function ferramentaChamada(nome: string): Ferramenta | null {
  return FERRAMENTAS.find((f) => f.nome === nome) ?? null
}

/**
 * O que a pessoa lê antes de confirmar.
 *
 * Em português e com os dados que ela reconhece — número da OS, nome do
 * cliente — e nunca com id. Uma confirmação que a pessoa não consegue conferir
 * não é confirmação, é um botão a mais no caminho.
 */
export function fraseDeConfirmacao(nome: string, args: Record<string, unknown>): string {
  const n = (c: string) => String(args[c] ?? "?")
  switch (nome) {
    case "concluir_ordem":
      return args.faturar_agora
        ? `Concluir e FATURAR a OS #${n("numero")}. Isso gera o lançamento a receber.`
        : `Concluir a OS #${n("numero")}, sem faturar.`
    case "emitir_nota_fiscal":
      return `Emitir a nota fiscal da OS #${n("numero")} na prefeitura. Não se desfaz por aqui.`
    case "excluir_ordem":
      return `APAGAR a OS #${n("numero")}. Não dá para recuperar.`
    case "excluir_cliente":
      return `APAGAR o cliente ${n("nome")}. Não dá para recuperar.`
    case "movimentar_estoque":
      return args.tipo === "AJUSTE"
        ? `DEFINIR o saldo de ${n("peca")} como ${n("quantidade")} (o que você contou).`
        : `Registrar ${String(args.tipo).toLowerCase()} de ${n("quantidade")} em ${n("peca")}.`
    default:
      return `Executar ${nome}.`
  }
}
