// Os dados da DEMONSTRAÇÃO pública (/demo).
//
// ─── A regra que não se quebra: isto nunca toca o banco ──────────────────────
//
// A demo é uma rota PÚBLICA, sem login, dentro do mesmo aplicativo que guarda a
// carteira de clientes das empresas que pagam. Qualquer caminho daqui até o
// Prisma seria uma porta anônima para dados reais — e não existe forma segura
// de "só ler um pouquinho".
//
// Por isso este módulo é dados literais, e nada mais. Sem import de banco, sem
// sessão, sem tenant. A tela da demo monta a partir daqui e de mais nada, e há
// um teste (__tests__/demo.test.ts) que falha se alguém importar Prisma na
// árvore da rota.
//
// ─── Por que uma empresa inventada, e não um print de conta real ─────────────
//
// Print de conta real vaza nome, telefone e endereço de cliente final de uma
// empresa que não autorizou virar material de venda. A Desentupidora Jato Certo
// não existe; nenhum nome, telefone ou valor daqui pertence a alguém.
//
// ─── Por que só o que o produto FAZ ──────────────────────────────────────────
//
// Toda tela aqui espelha uma tela que existe. Demo que mostra recurso que o
// sistema não tem é propaganda enganosa que cobra o preço na primeira semana de
// uso — quando o cliente procura o botão e ele não está lá.

export const EMPRESA_DEMO = "Desentupidora Jato Certo"

export type StatusOs = "OPEN" | "IN_PROGRESS" | "DONE" | "INVOICED"

export type OsDemo = {
  numero: string
  titulo: string
  cliente: string
  tecnico: string
  quando: string
  status: StatusOs
  valor: string
}

/** A lista de OS, como aparece na tela de Ordens de Serviço. */
export const ORDENS: readonly OsDemo[] = [
  {
    numero: "0312",
    titulo: "Desentupimento de esgoto",
    cliente: "Condomínio Aurora",
    tecnico: "Carlos Menezes",
    quando: "Hoje, 14:00",
    status: "IN_PROGRESS",
    valor: "780,00",
  },
  {
    numero: "0311",
    titulo: "Limpeza de caixa de gordura",
    cliente: "Restaurante Maré Alta",
    tecnico: "Marcos Silva",
    quando: "Hoje, 09:30",
    status: "DONE",
    valor: "1.150,00",
  },
  {
    numero: "0310",
    titulo: "Hidrojateamento de tubulação",
    cliente: "Auto Posto Rodovia",
    tecnico: "Douglas Reis",
    quando: "Ontem, 16:00",
    status: "INVOICED",
    valor: "2.400,00",
  },
  {
    numero: "0309",
    titulo: "Desentupimento de pia",
    cliente: "Padaria Pão Quente",
    tecnico: "Carlos Menezes",
    quando: "Amanhã, 08:00",
    status: "OPEN",
    valor: "320,00",
  },
  {
    numero: "0308",
    titulo: "Sucção de fossa séptica",
    cliente: "Escola Pequeno Príncipe",
    tecnico: "Marcos Silva",
    quando: "Sexta, 07:00",
    status: "OPEN",
    valor: "1.680,00",
  },
]

/** A OS aberta — a tela que mostra o que o sistema realmente guarda. */
export const OS_ABERTA = {
  numero: "0312",
  titulo: "Desentupimento de esgoto",
  cliente: "Condomínio Aurora",
  endereco: "Rua das Acácias, 480 — Bloco B",
  tecnico: "Carlos Menezes",
  agendada: "Hoje, 14:00",
  criada: "Anteontem",
  status: "IN_PROGRESS" as StatusOs,
  descricao:
    "Refluxo na tubulação do subsolo. Síndico relatou retorno de água na garagem após chuva forte.",
  checklist: [
    { texto: "Identificar o ponto de entupimento", feito: true },
    { texto: "Isolar o trecho e sinalizar a área", feito: true },
    { texto: "Passar o rotativo elétrico", feito: true },
    { texto: "Testar o escoamento", feito: false },
    { texto: "Registrar foto do antes e depois", feito: false },
  ],
  itens: [
    { desc: "Desentupimento com rotativo", qtd: "1", unit: "480,00", total: "480,00" },
    { desc: "Hora técnica adicional", qtd: "2", unit: "120,00", total: "240,00" },
    { desc: "Deslocamento", qtd: "1", unit: "60,00", total: "60,00" },
  ],
  total: "780,00",
}

/** A semana da agenda. Cada posição é um dia, de segunda a sexta. */
export const AGENDA: readonly { numero: string; cliente: string; hora: string; status: StatusOs }[][] = [
  [{ numero: "0308", cliente: "Escola Pequeno Príncipe", hora: "07:00", status: "OPEN" }],
  [
    { numero: "0311", cliente: "Restaurante Maré Alta", hora: "09:30", status: "DONE" },
    { numero: "0312", cliente: "Condomínio Aurora", hora: "14:00", status: "IN_PROGRESS" },
  ],
  [{ numero: "0309", cliente: "Padaria Pão Quente", hora: "08:00", status: "OPEN" }],
  [
    { numero: "0313", cliente: "Mercado São Jorge", hora: "10:00", status: "OPEN" },
    { numero: "0314", cliente: "Cond. Vila Nova", hora: "15:30", status: "OPEN" },
  ],
  [{ numero: "0315", cliente: "Auto Posto Rodovia", hora: "08:30", status: "OPEN" }],
]

/** O financeiro: o que entrou, o que falta entrar. */
export const RECEBER: readonly { desc: string; cliente: string; valor: string; venc: string; pago: boolean; vencida?: boolean }[] = [
  { desc: "OS #0310", cliente: "Auto Posto Rodovia", valor: "2.400,00", venc: "28/08", pago: true },
  { desc: "OS #0307", cliente: "Mercado São Jorge", valor: "1.320,00", venc: "30/08", pago: true },
  { desc: "OS #0311", cliente: "Restaurante Maré Alta", valor: "1.150,00", venc: "05/09", pago: false },
  { desc: "OS #0304", cliente: "Cond. Jardim Real", valor: "890,00", venc: "22/08", pago: false, vencida: true },
]

/** Os números do painel. Batem com as listas acima de propósito: uma demo em
 *  que a soma não fecha é a primeira coisa que um dono de empresa percebe. */
export const PAINEL = {
  faturadoMes: "18.740,00",
  aReceber: "2.040,00",
  vencido: "890,00",
  osAbertas: 3,
  osConcluidasMes: 27,
  ticketMedio: "694,00",
}

/** Os meses do gráfico do painel, em reais (só a altura relativa importa). */
export const FATURAMENTO_MESES: readonly { mes: string; valor: number }[] = [
  { mes: "Abr", valor: 11200 },
  { mes: "Mai", valor: 13800 },
  { mes: "Jun", valor: 12400 },
  { mes: "Jul", valor: 16100 },
  { mes: "Ago", valor: 18740 },
]
