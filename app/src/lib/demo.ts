// Os dados da DEMONSTRAÇÃO pública (/demo e /demo/[ramo]).
//
// ─── A regra que não se quebra: isto nunca toca o banco ──────────────────────
//
// A demo é uma rota PÚBLICA, sem login, dentro do mesmo aplicativo que guarda a
// carteira de clientes das empresas que pagam. Qualquer caminho daqui até o
// Prisma seria uma porta anônima para dados reais — e não existe forma segura
// de "só ler um pouquinho".
//
// Por isso este módulo é dados literais, e nada mais. Sem import de banco, sem
// sessão, sem tenant. Há um teste (__tests__/demo.test.ts) que percorre a
// árvore de imports da rota e falha se alguém abrir esse caminho.
//
// ─── Por que UM RAMO POR PÁGINA ──────────────────────────────────────────────
//
// Uma demo genérica faz o dono da empresa perguntar "isso serve para mim?".
// Uma demo com os serviços, o checklist e os valores do ramo DELE não faz
// pergunta nenhuma — ele reconhece o próprio dia de trabalho na tela. Como a
// venda aqui é por conversa (mandar o link no WhatsApp para uma empresa
// específica), acertar o ramo é a diferença entre o link ser aberto e ignorado.
//
// ─── Por que dinheiro é NÚMERO, e não texto ──────────────────────────────────
//
// A primeira versão guardava "18.740,00" como string. Duas consequências ruins:
// a versão em inglês mostrava a formatação brasileira, e os totais do painel
// eram escritos à mão — o teste pegou o painel dizendo 4 OS em aberto com a
// lista tendo 3. Com número, a formatação é do idioma de quem lê e os totais
// SÃO CALCULADOS: não existe mais como discordarem.
//
// ─── Por que uma empresa inventada, e não um print de conta real ─────────────
//
// Print de conta real vaza nome, telefone e endereço de cliente final de uma
// empresa que não autorizou virar material de venda. Nenhum nome ou valor daqui
// pertence a alguém.
//
// ─── Por que só o que o produto FAZ ──────────────────────────────────────────
//
// Toda tela espelha uma tela que existe. Demo que mostra recurso que o sistema
// não tem cobra o preço na primeira semana de uso, quando o cliente procura o
// botão e ele não está lá.

export type StatusOs = "OPEN" | "IN_PROGRESS" | "DONE" | "INVOICED"

export type OsDemo = {
  numero: string
  titulo: string
  cliente: string
  tecnico: string
  quando: string
  status: StatusOs
  /** Em reais. Formatado na tela, no idioma de quem lê. */
  valor: number
}

export type OsAberta = {
  numero: string
  endereco: string
  criada: string
  descricao: string
  checklist: readonly { texto: string; feito: boolean }[]
  itens: readonly { desc: string; qtd: number; unit: number }[]
}

export type Conta = {
  numero: string
  cliente: string
  valor: number
  venc: string
  pago: boolean
  vencida?: boolean
}

export type Segmento = {
  slug: string
  empresa: string
  ordens: readonly OsDemo[]
  /** O detalhe. `numero` aponta para uma das `ordens` — há teste. */
  osAberta: OsAberta
  agenda: readonly { numero: string; cliente: string; hora: string; status: StatusOs }[][]
  receber: readonly Conta[]
  /** Autorais: representam o mês inteiro, que as listas acima não contêm. */
  faturadoMes: number
  osConcluidasMes: number
  faturamentoMeses: readonly { mes: string; valor: number }[]
}

const MESES = ["Abr", "Mai", "Jun", "Jul", "Ago"] as const
const meses = (...v: number[]) => MESES.map((mes, i) => ({ mes, valor: v[i] }))

// ─── Desentupidora ───────────────────────────────────────────────────────────

const DESENTUPIDORA: Segmento = {
  slug: "desentupidora",
  empresa: "Desentupidora Jato Certo",
  ordens: [
    { numero: "0312", titulo: "Desentupimento de esgoto", cliente: "Condomínio Aurora", tecnico: "Carlos Menezes", quando: "Hoje, 14:00", status: "IN_PROGRESS", valor: 780 },
    { numero: "0311", titulo: "Limpeza de caixa de gordura", cliente: "Restaurante Maré Alta", tecnico: "Marcos Silva", quando: "Hoje, 09:30", status: "DONE", valor: 1150 },
    { numero: "0310", titulo: "Hidrojateamento de tubulação", cliente: "Auto Posto Rodovia", tecnico: "Douglas Reis", quando: "Ontem, 16:00", status: "INVOICED", valor: 2400 },
    { numero: "0309", titulo: "Desentupimento de pia", cliente: "Padaria Pão Quente", tecnico: "Carlos Menezes", quando: "Amanhã, 08:00", status: "OPEN", valor: 320 },
    { numero: "0308", titulo: "Sucção de fossa séptica", cliente: "Escola Pequeno Príncipe", tecnico: "Marcos Silva", quando: "Sexta, 07:00", status: "OPEN", valor: 1680 },
  ],
  osAberta: {
    numero: "0312",
    endereco: "Rua das Acácias, 480 — Bloco B",
    criada: "Anteontem",
    descricao: "Refluxo na tubulação do subsolo. Síndico relatou retorno de água na garagem após chuva forte.",
    checklist: [
      { texto: "Identificar o ponto de entupimento", feito: true },
      { texto: "Isolar o trecho e sinalizar a área", feito: true },
      { texto: "Passar o rotativo elétrico", feito: true },
      { texto: "Testar o escoamento", feito: false },
      { texto: "Registrar foto do antes e depois", feito: false },
    ],
    itens: [
      { desc: "Desentupimento com rotativo", qtd: 1, unit: 480 },
      { desc: "Hora técnica adicional", qtd: 2, unit: 120 },
      { desc: "Deslocamento", qtd: 1, unit: 60 },
    ],
  },
  agenda: [
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
  ],
  receber: [
    { numero: "0310", cliente: "Auto Posto Rodovia", valor: 2400, venc: "28/08", pago: true },
    { numero: "0307", cliente: "Mercado São Jorge", valor: 1320, venc: "30/08", pago: true },
    { numero: "0311", cliente: "Restaurante Maré Alta", valor: 1150, venc: "05/09", pago: false },
    { numero: "0304", cliente: "Cond. Jardim Real", valor: 890, venc: "22/08", pago: false, vencida: true },
  ],
  faturadoMes: 18740,
  osConcluidasMes: 27,
  faturamentoMeses: meses(11200, 13800, 12400, 16100, 18740),
}

// ─── Refrigeração / ar-condicionado ──────────────────────────────────────────

const REFRIGERACAO: Segmento = {
  slug: "refrigeracao",
  empresa: "Polar Clima Refrigeração",
  ordens: [
    { numero: "0489", titulo: "Troca de compressor — câmara fria", cliente: "Supermercado Bom Preço", tecnico: "Rafael Antunes", quando: "Hoje, 13:00", status: "IN_PROGRESS", valor: 2850 },
    { numero: "0488", titulo: "Limpeza de 6 splits", cliente: "Clínica Vida Plena", tecnico: "Bruno Cardoso", quando: "Hoje, 08:00", status: "DONE", valor: 960 },
    { numero: "0487", titulo: "Instalação de split 12.000 BTUs", cliente: "Advocacia Nunes", tecnico: "Rafael Antunes", quando: "Ontem, 14:00", status: "INVOICED", valor: 1450 },
    { numero: "0486", titulo: "Recarga de gás R-410A", cliente: "Padaria Pão Quente", tecnico: "Bruno Cardoso", quando: "Amanhã, 09:00", status: "OPEN", valor: 620 },
    { numero: "0485", titulo: "Manutenção preventiva trimestral", cliente: "Hotel Costa Verde", tecnico: "Rafael Antunes", quando: "Quinta, 07:30", status: "OPEN", valor: 1780 },
  ],
  osAberta: {
    numero: "0489",
    endereco: "Av. Brasil, 1.240 — Setor de câmaras",
    criada: "Ontem",
    descricao: "Câmara fria da açougue não segura temperatura. Compressor com ruído alto e desarme térmico recorrente.",
    checklist: [
      { texto: "Medir pressão de alta e baixa", feito: true },
      { texto: "Recolher a carga de gás", feito: true },
      { texto: "Substituir o compressor", feito: true },
      { texto: "Fazer vácuo e recarregar", feito: false },
      { texto: "Testar por 2 horas e registrar temperatura", feito: false },
    ],
    itens: [
      { desc: "Compressor 2 HP", qtd: 1, unit: 1980 },
      { desc: "Filtro secador", qtd: 1, unit: 145 },
      { desc: "Carga de gás R-404A", qtd: 1, unit: 385 },
      { desc: "Mão de obra técnica", qtd: 2, unit: 170 },
    ],
  },
  agenda: [
    [{ numero: "0485", cliente: "Hotel Costa Verde", hora: "07:30", status: "OPEN" }],
    [
      { numero: "0488", cliente: "Clínica Vida Plena", hora: "08:00", status: "DONE" },
      { numero: "0489", cliente: "Supermercado Bom Preço", hora: "13:00", status: "IN_PROGRESS" },
    ],
    [{ numero: "0486", cliente: "Padaria Pão Quente", hora: "09:00", status: "OPEN" }],
    [
      { numero: "0490", cliente: "Restaurante Maré Alta", hora: "10:30", status: "OPEN" },
      { numero: "0491", cliente: "Colégio Novo Saber", hora: "15:00", status: "OPEN" },
    ],
    [{ numero: "0492", cliente: "Advocacia Nunes", hora: "08:30", status: "OPEN" }],
  ],
  receber: [
    { numero: "0487", cliente: "Advocacia Nunes", valor: 1450, venc: "27/08", pago: true },
    { numero: "0483", cliente: "Hotel Costa Verde", valor: 3200, venc: "29/08", pago: true },
    { numero: "0488", cliente: "Clínica Vida Plena", valor: 960, venc: "06/09", pago: false },
    { numero: "0479", cliente: "Mercado São Jorge", valor: 1240, venc: "20/08", pago: false, vencida: true },
  ],
  faturadoMes: 24380,
  osConcluidasMes: 34,
  faturamentoMeses: meses(15600, 17200, 21400, 22800, 24380),
}

// ─── Elétrica ────────────────────────────────────────────────────────────────

const ELETRICA: Segmento = {
  slug: "eletrica",
  empresa: "Volt Serviços Elétricos",
  ordens: [
    { numero: "0227", titulo: "Troca do quadro de distribuição", cliente: "Condomínio Aurora", tecnico: "Everton Lima", quando: "Hoje, 15:00", status: "IN_PROGRESS", valor: 3375 },
    { numero: "0226", titulo: "Correção de curto no setor 3", cliente: "Oficina Mecânica Duarte", tecnico: "Sandro Peixoto", quando: "Hoje, 10:00", status: "DONE", valor: 890 },
    { numero: "0225", titulo: "Laudo de SPDA (para-raios)", cliente: "Colégio Novo Saber", tecnico: "Everton Lima", quando: "Ontem, 09:00", status: "INVOICED", valor: 2100 },
    { numero: "0224", titulo: "Instalação de tomadas 220V", cliente: "Padaria Pão Quente", tecnico: "Sandro Peixoto", quando: "Amanhã, 08:00", status: "OPEN", valor: 540 },
    { numero: "0223", titulo: "Aterramento predial", cliente: "Mercado São Jorge", tecnico: "Everton Lima", quando: "Sexta, 07:00", status: "OPEN", valor: 1950 },
  ],
  osAberta: {
    numero: "0227",
    endereco: "Rua das Acácias, 480 — Casa de máquinas",
    criada: "Há 3 dias",
    descricao: "Quadro antigo sem DR e com disjuntores subdimensionados. Desarme recorrente no elevador social.",
    checklist: [
      { texto: "Desligar a chave geral e sinalizar", feito: true },
      { texto: "Conferir a carga instalada por circuito", feito: true },
      { texto: "Montar o quadro novo com DR e DPS", feito: true },
      { texto: "Identificar cada circuito na tampa", feito: false },
      { texto: "Medir isolamento e emitir a ART", feito: false },
    ],
    itens: [
      { desc: "Quadro de distribuição 24 disjuntores", qtd: 1, unit: 1280 },
      { desc: "Disjuntor DR 63A", qtd: 1, unit: 340 },
      { desc: "DPS classe II", qtd: 3, unit: 145 },
      { desc: "Mão de obra técnica", qtd: 8, unit: 165 },
    ],
  },
  agenda: [
    [{ numero: "0223", cliente: "Mercado São Jorge", hora: "07:00", status: "OPEN" }],
    [
      { numero: "0226", cliente: "Oficina Duarte", hora: "10:00", status: "DONE" },
      { numero: "0227", cliente: "Condomínio Aurora", hora: "15:00", status: "IN_PROGRESS" },
    ],
    [{ numero: "0224", cliente: "Padaria Pão Quente", hora: "08:00", status: "OPEN" }],
    [
      { numero: "0228", cliente: "Clínica Vida Plena", hora: "09:30", status: "OPEN" },
      { numero: "0229", cliente: "Auto Posto Rodovia", hora: "14:00", status: "OPEN" },
    ],
    [{ numero: "0230", cliente: "Colégio Novo Saber", hora: "08:00", status: "OPEN" }],
  ],
  receber: [
    { numero: "0225", cliente: "Colégio Novo Saber", valor: 2100, venc: "26/08", pago: true },
    { numero: "0221", cliente: "Hotel Costa Verde", valor: 4800, venc: "29/08", pago: true },
    { numero: "0226", cliente: "Oficina Mecânica Duarte", valor: 890, venc: "07/09", pago: false },
    { numero: "0218", cliente: "Cond. Jardim Real", valor: 1560, venc: "19/08", pago: false, vencida: true },
  ],
  faturadoMes: 21960,
  osConcluidasMes: 19,
  faturamentoMeses: meses(14300, 16800, 15200, 19400, 21960),
}

// ─── Assistência técnica ─────────────────────────────────────────────────────

const ASSISTENCIA: Segmento = {
  slug: "assistencia-tecnica",
  empresa: "TecFácil Assistência Técnica",
  ordens: [
    { numero: "1104", titulo: "Troca de placa — lava e seca", cliente: "Marina Albuquerque", tecnico: "Juliana Reis", quando: "Hoje, 16:00", status: "IN_PROGRESS", valor: 680 },
    { numero: "1103", titulo: "Reparo em geladeira frost free", cliente: "Restaurante Maré Alta", tecnico: "Paulo Menezes", quando: "Hoje, 11:00", status: "DONE", valor: 540 },
    { numero: "1102", titulo: "Conserto de micro-ondas industrial", cliente: "Padaria Pão Quente", tecnico: "Juliana Reis", quando: "Ontem, 15:00", status: "INVOICED", valor: 420 },
    { numero: "1101", titulo: "Troca de resistência — lava-louças", cliente: "Clínica Vida Plena", tecnico: "Paulo Menezes", quando: "Amanhã, 10:00", status: "OPEN", valor: 380 },
    { numero: "1100", titulo: "Revisão de forno combinado", cliente: "Hotel Costa Verde", tecnico: "Juliana Reis", quando: "Quinta, 08:00", status: "OPEN", valor: 1250 },
  ],
  osAberta: {
    numero: "1104",
    endereco: "Rua Iporanga, 92 — Apto 51",
    criada: "Ontem",
    descricao: "Lava e seca não inicia o ciclo e apresenta erro E-24 no painel. Cliente relata estalo no acionamento.",
    checklist: [
      { texto: "Conferir o código de erro no painel", feito: true },
      { texto: "Testar a placa de potência", feito: true },
      { texto: "Substituir a placa", feito: true },
      { texto: "Rodar ciclo completo de teste", feito: false },
      { texto: "Registrar a garantia da peça", feito: false },
    ],
    itens: [
      { desc: "Placa de potência (original)", qtd: 1, unit: 420 },
      { desc: "Mão de obra técnica", qtd: 1, unit: 180 },
      { desc: "Visita técnica", qtd: 1, unit: 80 },
    ],
  },
  agenda: [
    [{ numero: "1100", cliente: "Hotel Costa Verde", hora: "08:00", status: "OPEN" }],
    [
      { numero: "1103", cliente: "Restaurante Maré Alta", hora: "11:00", status: "DONE" },
      { numero: "1104", cliente: "Marina Albuquerque", hora: "16:00", status: "IN_PROGRESS" },
    ],
    [{ numero: "1101", cliente: "Clínica Vida Plena", hora: "10:00", status: "OPEN" }],
    [
      { numero: "1105", cliente: "Rogério Tavares", hora: "09:00", status: "OPEN" },
      { numero: "1106", cliente: "Mercado São Jorge", hora: "14:30", status: "OPEN" },
    ],
    [{ numero: "1107", cliente: "Padaria Pão Quente", hora: "08:30", status: "OPEN" }],
  ],
  receber: [
    { numero: "1102", cliente: "Padaria Pão Quente", valor: 420, venc: "28/08", pago: true },
    { numero: "1098", cliente: "Hotel Costa Verde", valor: 1680, venc: "30/08", pago: true },
    { numero: "1103", cliente: "Restaurante Maré Alta", valor: 540, venc: "08/09", pago: false },
    { numero: "1094", cliente: "Solange Ferraz", valor: 310, venc: "21/08", pago: false, vencida: true },
  ],
  faturadoMes: 12480,
  osConcluidasMes: 41,
  faturamentoMeses: meses(9400, 10100, 11800, 11200, 12480),
}

// ─── Dedetização / controle de pragas ────────────────────────────────────────

const DEDETIZACAO: Segmento = {
  slug: "dedetizacao",
  empresa: "Barreira Sanitária Controle de Pragas",
  ordens: [
    { numero: "0673", titulo: "Desratização com iscas", cliente: "Supermercado Bom Preço", tecnico: "Cláudio Ramos", quando: "Hoje, 19:00", status: "IN_PROGRESS", valor: 1480 },
    { numero: "0672", titulo: "Dedetização de barata e formiga", cliente: "Restaurante Maré Alta", tecnico: "Vanessa Pinto", quando: "Hoje, 07:00", status: "DONE", valor: 720 },
    { numero: "0671", titulo: "Limpeza de caixa d'água", cliente: "Condomínio Aurora", tecnico: "Cláudio Ramos", quando: "Ontem, 09:00", status: "INVOICED", valor: 950 },
    { numero: "0670", titulo: "Descupinização de forro", cliente: "Colégio Novo Saber", tecnico: "Vanessa Pinto", quando: "Amanhã, 08:00", status: "OPEN", valor: 2300 },
    { numero: "0669", titulo: "Sanitização trimestral", cliente: "Clínica Vida Plena", tecnico: "Cláudio Ramos", quando: "Sexta, 18:00", status: "OPEN", valor: 880 },
  ],
  osAberta: {
    numero: "0673",
    endereco: "Av. Brasil, 1.240 — Depósito e área de carga",
    criada: "Há 2 dias",
    descricao: "Presença de roedores no estoque seco. Serviço fora do horário de funcionamento, com liberação da vigilância sanitária.",
    checklist: [
      { texto: "Vistoriar e mapear os pontos de abrigo", feito: true },
      { texto: "Instalar porta-iscas numerados", feito: true },
      { texto: "Vedar frestas e ralos", feito: true },
      { texto: "Registrar o croqui dos pontos", feito: false },
      { texto: "Emitir o certificado sanitário", feito: false },
    ],
    itens: [
      { desc: "Porta-iscas lacrado", qtd: 12, unit: 45 },
      { desc: "Rodenticida (bloco parafinado)", qtd: 1, unit: 260 },
      { desc: "Mão de obra — serviço noturno", qtd: 4, unit: 170 },
    ],
  },
  agenda: [
    [{ numero: "0669", cliente: "Clínica Vida Plena", hora: "18:00", status: "OPEN" }],
    [
      { numero: "0672", cliente: "Restaurante Maré Alta", hora: "07:00", status: "DONE" },
      { numero: "0673", cliente: "Supermercado Bom Preço", hora: "19:00", status: "IN_PROGRESS" },
    ],
    [{ numero: "0670", cliente: "Colégio Novo Saber", hora: "08:00", status: "OPEN" }],
    [
      { numero: "0674", cliente: "Padaria Pão Quente", hora: "06:00", status: "OPEN" },
      { numero: "0675", cliente: "Hotel Costa Verde", hora: "20:00", status: "OPEN" },
    ],
    [{ numero: "0676", cliente: "Cond. Vila Nova", hora: "09:00", status: "OPEN" }],
  ],
  receber: [
    { numero: "0671", cliente: "Condomínio Aurora", valor: 950, venc: "27/08", pago: true },
    { numero: "0666", cliente: "Supermercado Bom Preço", valor: 2840, venc: "30/08", pago: true },
    { numero: "0672", cliente: "Restaurante Maré Alta", valor: 720, venc: "06/09", pago: false },
    { numero: "0661", cliente: "Oficina Mecânica Duarte", valor: 640, venc: "18/08", pago: false, vencida: true },
  ],
  faturadoMes: 16250,
  osConcluidasMes: 23,
  faturamentoMeses: meses(12100, 13400, 14900, 15300, 16250),
}

/** Todos os ramos, na ordem em que a demo os oferece. */
export const SEGMENTOS: readonly Segmento[] = [
  DESENTUPIDORA,
  REFRIGERACAO,
  ELETRICA,
  ASSISTENCIA,
  DEDETIZACAO,
]

/** O ramo mostrado em /demo, sem sufixo. */
export const SEGMENTO_PADRAO = DESENTUPIDORA.slug

export function segmentoPorSlug(slug: string | undefined): Segmento {
  return SEGMENTOS.find((s) => s.slug === slug) ?? DESENTUPIDORA
}

export function ehSegmento(slug: string): boolean {
  return SEGMENTOS.some((s) => s.slug === slug)
}

/**
 * Os números do painel, CALCULADOS a partir das listas.
 *
 * Escritos à mão eles discordavam — o teste pegou o painel dizendo 4 OS em
 * aberto com a lista tendo 3. Dono de empresa confere soma, e uma demo cuja
 * conta não fecha é a primeira coisa que ele nota e a última em que confia.
 */
export function painelDe(s: Segmento) {
  const aReceber = s.receber.filter((c) => !c.pago).reduce((t, c) => t + c.valor, 0)
  const vencido = s.receber.filter((c) => c.vencida).reduce((t, c) => t + c.valor, 0)
  const osAbertas = s.ordens.filter(
    (o) => o.status === "OPEN" || o.status === "IN_PROGRESS"
  ).length
  return {
    faturadoMes: s.faturadoMes,
    aReceber,
    vencido,
    osAbertas,
    osConcluidasMes: s.osConcluidasMes,
    ticketMedio: Math.round(s.faturadoMes / s.osConcluidasMes),
  }
}

/** O total da OS aberta: soma dos itens, nunca um número à parte. */
export function totalDaOs(os: OsAberta): number {
  return os.itens.reduce((t, i) => t + i.qtd * i.unit, 0)
}

/** A OS da lista que o detalhe está abrindo. */
export function ordemDoDetalhe(s: Segmento): OsDemo {
  const achada = s.ordens.find((o) => o.numero === s.osAberta.numero)
  if (!achada) throw new Error(`osAberta ${s.osAberta.numero} não está em ordens de ${s.slug}`)
  return achada
}

/** Dinheiro no idioma de quem lê — sempre em reais, porque a empresa é
 *  brasileira, mas com a pontuação do idioma da página. */
export function emDinheiro(valor: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor)
}
