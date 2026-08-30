// O manual do sistema, como DADO.
//
// Podia ser uma página escrita à mão em JSX. Não é, por dois motivos.
//
// O primeiro: cada verbete é amarrado ao CÓDIGO da tela (1.1, 3.4, 5.4.2), o
// mesmo de lib/codigos-abas.ts. Isso é o que permite abrir o manual já no ponto
// certo a partir de qualquer aba — e o que permite um teste conferir que
// nenhuma tela ficou sem explicação, e que nenhum verbete descreve uma tela que
// não existe mais. Manual que envelhece em silêncio é pior que manual nenhum:
// ele ensina errado com cara de autoridade.
//
// O segundo: separar conteúdo de apresentação deixa a mesma fonte servir a tela
// de ajuda, a um PDF e a uma página pública, sem reescrever nada.
//
// ─── Sobre o idioma ──────────────────────────────────────────────────────────
//
// O conteúdo está em português, completo. Uma empresa com o sistema em inglês
// vê o texto em português com um aviso dizendo isso — escolha deliberada:
// entregar meia tradução, ou pior, uma tela vazia, seria pior que entregar o
// texto inteiro no idioma errado com o aviso na frente.

/** Um pedaço de um verbete. */
export type Bloco =
  | { tipo: "p"; texto: string }
  | { tipo: "lista"; titulo?: string; itens: string[] }
  | { tipo: "passos"; titulo?: string; itens: string[] }
  /** O caminho que um registro percorre. `morto` é o desvio (cancelado). */
  | { tipo: "fluxo"; etapas: string[]; morto?: string }
  | { tipo: "tabela"; cabecalho: string[]; linhas: string[][] }
  | { tipo: "atencao"; titulo: string; texto: string }

export type Verbete = {
  /** O código da aba que este verbete descreve. `null` nas seções gerais. */
  codigo: string | null
  /** Âncora na URL: /ajuda#3-4. Vem do código, com ponto virando traço. */
  id: string
  titulo: string
  /** Selo curto ao lado do título. Ex.: "Enterprise". */
  etiqueta?: string
  resumo: string
  blocos: Bloco[]
}

export type Secao = {
  /** O dígito do grupo, quando a seção agrupa abas. `null` nas gerais. */
  numero: string | null
  titulo: string
  descricao: string
  verbetes: Verbete[]
}

/** A âncora de um código: "5.4.1" → "5-4-1". Ponto em href funciona, mas
 *  atrapalha quem copia o endereço e quem escreve seletor de CSS. */
export function ancoraDoCodigo(codigo: string): string {
  return codigo.replace(/\./g, "-")
}

/**
 * Texto com um marcador só: `*assim*` vira negrito.
 *
 * Um marcador, e não HTML no conteúdo: o manual é lido por gente que precisa
 * achar a frase importante no meio do parágrafo, e negrito resolve isso. Deixar
 * HTML entrar aqui abriria a porta para injeção o dia em que este conteúdo
 * vier de outro lugar que não este arquivo.
 */
export function pedacos(texto: string): { forte: boolean; texto: string }[] {
  return texto
    .split(/(\*[^*]+\*)/g)
    .filter((p) => p !== "")
    .map((p) =>
      p.startsWith("*") && p.endsWith("*") && p.length > 2
        ? { forte: true, texto: p.slice(1, -1) }
        : { forte: false, texto: p }
    )
}

function aba(
  codigo: string,
  titulo: string,
  resumo: string,
  blocos: Bloco[],
  etiqueta?: string
): Verbete {
  return { codigo, id: ancoraDoCodigo(codigo), titulo, etiqueta, resumo, blocos }
}

function geral(id: string, titulo: string, resumo: string, blocos: Bloco[]): Verbete {
  return { codigo: null, id, titulo, resumo, blocos }
}

export const MANUAL: readonly Secao[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    numero: null,
    titulo: "Começando",
    descricao: "O que saber antes de mexer",
    verbetes: [
      geral(
        "numeracao",
        "Como achar as telas",
        "Toda tela tem um número, e ele aparece na barra lateral na frente do nome. Quem usa o sistema todo dia decora “1.1” e chega mais rápido do que caçando na lista.",
        [
          {
            tipo: "p",
            texto:
              "No topo da barra lateral há uma caixa de busca que aceita as duas coisas: o *número* (“3.2”) ou o *nome* (“orçamento”, e também “orcamento”, sem acento). Digite, e Enter leva ao primeiro resultado.",
          },
          {
            tipo: "p",
            texto:
              "Os grupos seguem o assunto: *1* é o trabalho em campo, *2* é a carteira de clientes, *3* é dinheiro, *4* é estoque e compras, *5* é a empresa. Digitar só “5.4” mostra as telas dentro de Configurações em vez de adivinhar qual delas você queria.",
          },
          {
            tipo: "atencao",
            titulo: "Você pode não ver todas",
            texto:
              "A lista muda conforme o seu perfil e o seu plano. Se um número deste manual não existe na sua barra lateral, ou a aba está desligada em Permissões para o seu usuário, ou o recurso não faz parte do seu plano.",
          },
        ]
      ),
      geral(
        "primeiros",
        "Primeiros passos",
        "Uma lista de seis tarefas aparece no Dashboard até você concluí-la. Não é enfeite: cada item dela sai impresso em documento que vai para o seu cliente, e corrigir depois não conserta o que já foi enviado.",
        [
          {
            tipo: "passos",
            itens: [
              "*Complete os dados da empresa.* Telefone e CNPJ saem em todo documento que você entrega.",
              "*Envie a sua logo.* Aparece no topo do orçamento, da OS e do recibo.",
              "*Cadastre ou importe seus clientes.* Dá para trazer de uma planilha; não precisa digitar um por um.",
              "*Crie a primeira ordem de serviço.* É o centro do sistema — agenda, execução, foto, assinatura e recebimento.",
              "*Configure o PIX.* O cliente paga direto na sua conta, por QR code impresso no documento, sem taxa.",
              "*Escreva seus termos e a garantia.* É o que resolve discussão depois do serviço feito.",
            ],
          },
        ]
      ),
      geral(
        "papeis",
        "Quem pode o quê",
        "Oito cargos, do mais amplo ao mais restrito. O cargo define o que a pessoa enxerga e o que ela pode fazer.",
        [
          {
            tipo: "tabela",
            cabecalho: ["Cargo", "Alcance"],
            linhas: [
              [
                "Proprietário",
                "Dono da conta. Faz tudo, e é o único que envia o certificado digital e mexe na assinatura do plano.",
              ],
              [
                "Administrador",
                "Faz tudo no dia a dia, inclusive definir o que a equipe vê. Não envia certificado digital.",
              ],
              ["Gerente", "Toca a operação inteira. Fica de fora só a cobrança da assinatura."],
              ["Atendimento", "Atende o cliente: abre chamado, agenda, consulta o que já foi feito."],
              ["Comercial", "Vende: orçamento, cliente, contrato recorrente."],
              ["Financeiro", "Dinheiro entrando e saindo, mais a nota fiscal."],
              ["Logística", "Peça, compra e fornecedor."],
              ["Técnico", "Quem está em campo. É o cargo mais restrito por padrão."],
            ],
          },
          {
            tipo: "p",
            texto:
              "Os seis últimos são *configuráveis*: cada um tem o seu próprio conjunto de abas e ações, ajustado em *5.4.1 Permissões*. Só Proprietário e Administrador ficam de fora, porque não há o que configurar em quem já pode tudo.",
          },
          {
            tipo: "atencao",
            titulo: "Gerente não manda em tudo",
            texto:
              "Parece que deveria, mas ele é configurável como os outros — porque mais cedo ou mais tarde aparece a empresa que quer um gerente que não mexe na cobrança. A lista de quem ninguém consegue restringir depois tem de ficar curta.",
          },
        ]
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    numero: "1",
    titulo: "Operação",
    descricao: "O trabalho em campo",
    verbetes: [
      aba(
        "1.1",
        "Ordens de Serviço",
        "O centro do sistema. Cada trabalho vira uma OS numerada, que atravessa do agendamento até o recebimento sem sair da tela.",
        [
          {
            tipo: "fluxo",
            etapas: ["Aberta", "Em andamento", "Concluída", "Faturada"],
            morto: "Cancelada",
          },
          {
            tipo: "lista",
            titulo: "Ao criar",
            itens: [
              "*Título* — o que será feito. Ex.: “Manutenção elétrica”.",
              "*Cliente* — obrigatório, escolhido do cadastro.",
              "*Técnico responsável* — opcional; dá para definir depois.",
              "*Agendamento* — data e hora. É o que coloca a OS no calendário e no mapa.",
              "*Itens / Serviços* — descrição, quantidade e preço unitário. O total se soma sozinho.",
            ],
          },
          {
            tipo: "lista",
            titulo: "Dentro da OS aberta",
            itens: [
              "*Descrição do problema* — o que o cliente relatou.",
              "*Checklist de execução* — etapas que quem está em campo vai marcando; mostra o progresso em “3/7 itens concluídos”.",
              "*Fotos do serviço* — no celular o botão abre a câmera direto. As fotos são reduzidas no próprio aparelho antes de subir, para funcionar com sinal fraco.",
              "*Assinatura do cliente* — colhida na tela do celular, na hora, e sai impressa no PDF.",
              "*Histórico de alterações* — quem mudou status, responsável, agendamento, valor ou garantia, e quando.",
            ],
          },
          {
            tipo: "p",
            texto:
              "O botão *Concluir* abre uma janela onde você descreve os serviços realizados e confere os itens da cobrança. Ela tem duas saídas, e a diferença importa:",
          },
          {
            tipo: "lista",
            itens: [
              "*Concluir (sem faturar)* — o serviço está feito, mas nada entra no financeiro ainda.",
              "*Concluir e Faturar* — além de encerrar, gera o lançamento a receber.",
            ],
          },
          {
            tipo: "lista",
            titulo: "O que dá para enviar dali",
            itens: [
              "*PDF* — com sua logo, itens, termos, garantia, fotos e as assinaturas.",
              "*WhatsApp* — manda o link de acompanhamento para o cliente (exige o WhatsApp configurado, em 5.4).",
              "*Portal cliente* — um endereço público onde ele acompanha, assina e avalia.",
              "*Emitir NFS-e* — se a parte fiscal estiver configurada (3.4).",
            ],
          },
          {
            tipo: "atencao",
            titulo: "OS faturada trava",
            texto:
              "Depois de faturada, a OS não aceita mais mudança nas fotos — ela virou documento fiscal e contábil. Confira antes de faturar.",
          },
        ]
      ),
      aba(
        "1.2",
        "Agendamento",
        "Um calendário mensal com todas as ordens que têm data marcada. É a visão de “o que a equipe faz esta semana”.",
        [
          {
            tipo: "lista",
            itens: [
              "Cada dia mostra as OS agendadas; quando não cabem, aparece “+3 mais”.",
              "Para *remarcar*, arraste a OS para outro dia — ou toque nela e escolha o dia, o que funciona melhor no celular.",
              "Se o técnico já tiver outro serviço naquele horário, o sistema *avisa do conflito* antes de confirmar.",
            ],
          },
          {
            tipo: "atencao",
            titulo: "O que não se move daqui",
            texto:
              "OS já concluída, faturada ou cancelada não é arrastável. No caso da faturada é proposital: a nota fiscal está amarrada àquela data. Para corrigir uma data de OS concluída, use a tela de edição.",
          },
        ]
      ),
      aba(
        "1.3",
        "Histórico",
        "O arquivo morto: ordens concluídas, faturadas e canceladas, fora da tela do dia a dia.",
        [
          {
            tipo: "p",
            texto:
              "Busca por título ou cliente, filtro por status, e as colunas mostram número, cliente, responsável, total e a data de conclusão. É onde se procura “quando foi mesmo que atendemos esse cliente”.",
          },
        ]
      ),
      aba(
        "1.4",
        "Manutenção Interna",
        "Ordem de Manutenção — o serviço que a *sua* empresa precisa, não o do cliente. Revisão da van, conserto da furadeira, manutenção do ar-condicionado do escritório.",
        [
          {
            tipo: "lista",
            itens: [
              "Tem *Título*, descrição, *Prestador responsável* (opcional) e agendamento.",
              "Aceita *itens* com quantidade e preço, como uma OS — é assim que você sabe quanto custou manter a operação de pé.",
              "Anda com dois botões: *Iniciar manutenção* e *Marcar como concluída*.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Manter isso separado das OS é o que impede que o conserto do seu próprio veículo apareça como faturamento no relatório.",
          },
        ],
        "OM"
      ),
      aba(
        "1.5",
        "Mapa GPS",
        "Onde a equipe está agora e onde estão as ordens em aberto, no mesmo mapa. Atualiza sozinho a cada 30 segundos.",
        [
          {
            tipo: "lista",
            titulo: "Para o mapa ter o que mostrar",
            itens: [
              "O *técnico* precisa ter ativado a localização no aparelho dele.",
              "O *cliente* precisa ter endereço cadastrado.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Quando um endereço não é localizado, a OS aparece numa lista de *fora do mapa*. Clique, confira o endereço e salve — o mapa se corrige sozinho depois disso.",
          },
          {
            tipo: "atencao",
            titulo: "Endereço importado demora um pouco",
            texto:
              "A busca de coordenadas roda uma vez por dia, em lotes. Clientes recém-importados de planilha aparecem no mapa aos poucos, não na mesma hora.",
          },
        ]
      ),
      aba(
        "1.6",
        "Dashboard",
        "A tela de abertura: como o mês está indo, em quatro números e um gráfico.",
        [
          {
            tipo: "tabela",
            cabecalho: ["Indicador", "O que conta"],
            linhas: [
              [
                "Faturamento do mês",
                "Receitas efetivamente pagas no mês, mais o valor das OS concluídas.",
              ],
              ["OS em aberto", "Quantas estão abertas e quantas em andamento."],
              ["Recebimentos vencidos", "O que passou do vencimento e ainda não entrou."],
              ["Clientes ativos", "Total de clientes com situação “Ativo”."],
            ],
          },
          {
            tipo: "p",
            texto:
              "Abaixo, o gráfico *Receita × Despesa dos últimos 6 meses* e a lista das OS ativas no momento. A lista de Primeiros passos também mora aqui, até você fechá-la.",
          },
        ]
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    numero: "2",
    titulo: "Clientes",
    descricao: "A carteira",
    verbetes: [
      aba(
        "2.1",
        "Clientes",
        "O cadastro de quem você atende — e, dentro dele, o histórico inteiro daquele cliente.",
        [
          {
            tipo: "lista",
            titulo: "O cadastro",
            itens: [
              "*Dados pessoais* — nome, CPF/CNPJ, telefone, WhatsApp, e-mail.",
              "*Endereço* — CEP, rua, número, complemento, bairro, cidade, estado. É o que põe o cliente no mapa.",
              "*Situação* — Ativo, Inativo ou Inadimplente.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Dentro da ficha dá para cadastrar os *equipamentos daquele cliente* — nome, marca, modelo, número de série, data de instalação e garantia até. O sistema avisa quando alguma garantia está a menos de 90 dias de vencer, o que costuma ser uma boa hora para ligar oferecendo revisão.",
          },
          {
            tipo: "passos",
            titulo: "Importar planilha",
            itens: [
              "Baixe o modelo, ou use a sua planilha — basta que a primeira linha tenha os títulos das colunas.",
              "Salve em *CSV ou Excel (.xlsx)*. Só a primeira aba é lida.",
              "Envie. O resultado aparece linha a linha antes de você sair da tela.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Os títulos mais comuns são reconhecidos sozinhos (Nome, Razão Social, CPF, CNPJ, Telefone, Celular, CEP, Endereço…). O limite é de *2.000 linhas por arquivo*.",
          },
          {
            tipo: "atencao",
            titulo: "Reenviar a mesma planilha é seguro",
            texto:
              "Quem já está cadastrado não entra duas vezes. Se a sua planilha é maior que 2.000 linhas, divida em partes e importe uma de cada vez sem medo de duplicar.",
          },
          {
            tipo: "p",
            texto:
              "*Contratante — quando quem paga não é quem recebe o serviço.* Uma administradora fecha contrato com você, mas o serviço é feito em cada condomínio dela. Vale igual para seguradora e segurado, franquia e cada loja, construtora e cada obra.",
          },
          {
            tipo: "passos",
            titulo: "Como montar",
            itens: [
              "Cadastre a *contratante* normalmente — a administradora, a seguradora, a franqueadora.",
              "Cadastre cada *cliente final* e escolha a contratante no campo *Contratante*.",
              "Ao abrir a OS, escolha o cliente final: é lá que o serviço acontece. Um campo *Cobrar de* aparece, já preenchido com a contratante.",
            ],
          },
          {
            tipo: "p",
            texto:
              "A *nota fiscal sai no CNPJ de quem paga*, e não de onde o serviço foi feito. O documento mostra os dois lados: Contratante e Local do serviço.",
          },
          {
            tipo: "atencao",
            titulo: "Um nível só, e o extra pode ser cobrado direto",
            texto:
              "Subcliente não pode ter subcliente: administradora → condomínio, e para. E quando o cliente final paga direto um serviço extra, é só trocar o Cobrar de naquela OS — a nota acompanha.",
          },
        ]
      ),
      aba(
        "2.2",
        "Contratos",
        "Serviço que se repete — limpeza semanal, jardinagem mensal, dedetização trimestral. Você cadastra uma vez e a OS passa a nascer sozinha.",
        [
          {
            tipo: "lista",
            itens: [
              "*Frequência* — semanal, quinzenal, mensal, bimestral, trimestral, semestral ou anual.",
              "*Dia do mês* — em meses curtos cai no último dia e volta ao dia escolhido no mês seguinte.",
              "*Valor por visita* — já vai preenchido na OS gerada, e dá para ajustar depois.",
              "*Começa em* / *Termina em* — deixe o fim vazio para contrato sem prazo.",
            ],
          },
          {
            tipo: "p",
            texto:
              "A ordem de serviço é criada *três dias antes* de cada visita, com o responsável já definido, para dar tempo de organizar a rota. Um contrato pode ser Pausado e Retomado sem perder o histórico.",
          },
          {
            tipo: "atencao",
            titulo: "Excluir não apaga o que já foi feito",
            texto:
              "Excluir um contrato só faz parar de nascer OS nova. As ordens já geradas continuam no sistema — são trabalho realizado.",
          },
        ],
        "Recorrente"
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    numero: "3",
    titulo: "Dinheiro",
    descricao: "Do orçamento à nota fiscal",
    verbetes: [
      aba(
        "3.1",
        "Financeiro",
        "Contas a receber e a pagar, lado a lado, com três indicadores no topo.",
        [
          {
            tipo: "lista",
            itens: [
              "*Receita do mês* — o que já entrou.",
              "*A receber* — quantos pagamentos estão pendentes.",
              "*A pagar* — quantas despesas estão em aberto.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Cada linha tem *Pendente*, *Pago* ou *Vencido*, e um botão Pagar para dar baixa. Receitas nascem das OS faturadas; despesas você lança aqui, com descrição, valor, vencimento, categoria (Fixa, Variável ou Outra) e a marcação de *recorrente*, para o aluguel não precisar ser digitado todo mês.",
          },
        ]
      ),
      aba(
        "3.2",
        "Orçamentos",
        "A proposta antes do serviço — e o link onde o cliente aprova sozinho.",
        [
          {
            tipo: "fluxo",
            etapas: ["Rascunho", "Enviado", "Aprovado"],
            morto: "Recusado",
          },
          {
            tipo: "lista",
            titulo: "O formulário",
            itens: [
              "*Dados do cliente* — nome, contato e endereço.",
              "*Serviço* — o que precisa ser feito e os materiais a serem utilizados.",
              "*Valores e condições* — valor, validade e observações (pagamento, prazo, garantia).",
            ],
          },
          {
            tipo: "p",
            texto:
              "Dali sai um *PDF* com a sua logo e os seus termos, e um *link online*. No link, o cliente lê a proposta e clica em Aprovar orçamento ou Recusar — e você recebe o aviso no celular na hora, sem precisar cobrar resposta.",
          },
        ]
      ),
      aba(
        "3.3",
        "Recibos",
        "Toda receita paga vira um recibo em PDF, pronto para entregar.",
        [
          {
            tipo: "p",
            texto:
              "A lista mostra descrição, valor, vencimento, data do pagamento e a OS vinculada. O PDF traz o valor recebido, os dados do pagamento e as linhas de assinatura do pagador e do recebedor.",
          },
          {
            tipo: "p",
            texto:
              "*Recibo não é nota fiscal.* Ele comprova o pagamento; a obrigação fiscal se cumpre em 3.4.",
          },
        ]
      ),
      aba(
        "3.4",
        "Config. Fiscal",
        "Onde a emissão de NFS-e é ligada. São duas etapas, nesta ordem — a segunda só aparece depois da primeira.",
        [
          {
            tipo: "lista",
            titulo: "Etapa 1 — cadastrar a empresa",
            itens: [
              "CNPJ, Inscrição Municipal, e-mail da empresa.",
              "CEP, logradouro, número, bairro, cidade, estado.",
              "*Código IBGE da cidade* — sete dígitos; consulte no site do IBGE.",
              "*Alíquota ISS (%)* — a da sua atividade no seu município.",
            ],
          },
          {
            tipo: "lista",
            titulo: "Etapa 2 — enviar o certificado digital",
            itens: [
              "O certificado *A1* da empresa, em .pfx ou .p12 — o mesmo arquivo que você usa no e-CAC. Até 200 KB.",
              "A *senha* do certificado, que fica cifrada e não volta a aparecer em tela nenhuma.",
              "A *validade* (opcional, mas vale preencher): é o que permite avisar você antes de vencer.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Com as duas etapas prontas, a OS ganha o botão *Emitir NFS-e*, e tudo acontece dentro do ServiçoOS — você não é jogado para outro site.",
          },
          {
            tipo: "atencao",
            titulo: "Certificado vencido para de emitir, sem aviso da prefeitura",
            texto:
              "Um certificado A1 vale um ano. Vencido, a emissão falha — e sem a data de validade preenchida ninguém descobre até tentar emitir com o cliente esperando. Preencha a validade.",
          },
        ],
        "Só o proprietário"
      ),
      aba(
        "3.5",
        "Assinatura",
        "O seu plano do ServiçoOS: qual é, quando renova, e como trocar.",
        [
          {
            tipo: "lista",
            itens: [
              "Status da assinatura e data de renovação.",
              "Troca de plano, mensal ou anual — no anual, dois meses saem de graça.",
              "*Baixar contrato e termo de dados (LGPD)* — o mesmo arquivo que chega por e-mail quando o pagamento é confirmado.",
              "Cancelamento, sem multa, pelo próprio painel.",
            ],
          },
          {
            tipo: "atencao",
            titulo: "Pagamento em atraso não apaga nada",
            texto:
              "Se a cobrança não for confirmada, você recebe avisos por e-mail ao longo de 30 dias. Passado o prazo, o acesso é bloqueado para toda a equipe — mas nada é apagado. Confirmado o pagamento, tudo volta sozinho, sem taxa de reativação.",
          },
        ]
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    numero: "4",
    titulo: "Estoque e compras",
    descricao: "Peça, custo e fornecedor",
    verbetes: [
      aba(
        "4.1",
        "Estoque",
        "As peças que você usa nos serviços, com saldo, custo e preço de venda.",
        [
          {
            tipo: "p",
            texto:
              "A regra que governa a tela inteira: *o saldo só muda por movimento, nunca por edição direta*. É o que garante que o número na tela e o histórico nunca discordem.",
          },
          {
            tipo: "tabela",
            cabecalho: ["Movimento", "O que faz", "Quando usar"],
            linhas: [
              ["Entrada", "Soma ao saldo", "Compra recebida fora de uma ordem de compra"],
              ["Saída", "Subtrai do saldo", "Peça quebrada ou perdida"],
              ["Ajuste", "DEFINE o saldo", "Contagem de inventário"],
            ],
          },
          {
            tipo: "p",
            texto:
              "Cada peça tem um *Mínimo*: abaixo dele ela vira alerta no topo da tela. Zero desliga o aviso. Peça que saiu de linha se *desativa*, não se apaga — o histórico continua de pé.",
          },
          {
            tipo: "atencao",
            titulo: "No Ajuste, digite o que você contou",
            texto:
              "Não a diferença. Se a prateleira tem 8 e o sistema diz 12, o ajuste é 8. E o motivo é obrigatório: ajuste sem motivo é indistinguível de erro seis meses depois.",
          },
        ]
      ),
      aba(
        "4.2",
        "Compras",
        "A ordem de compra para o fornecedor — e o ponto onde a peça entra no estoque de verdade.",
        [
          {
            tipo: "fluxo",
            etapas: ["Rascunho", "Enviada", "Parcial", "Recebida"],
            morto: "Cancelada",
          },
          {
            tipo: "p",
            texto:
              "Você escolhe as peças, as quantidades e o custo, com fornecedor e previsão de entrega. *O estoque não muda aí.* Ele muda quando a mercadoria chega e você abre a compra e clica em Registrar recebimento — que já vem preenchido com o que falta, e aceita menos, se veio menos. A compra fica Parcial até o último item chegar.",
          },
          {
            tipo: "p",
            texto:
              "Confirmar o recebimento faz duas coisas: soma as quantidades ao estoque e *atualiza o custo da peça* com o que você acabou de pagar.",
          },
          {
            tipo: "atencao",
            titulo: "Cancelar só antes do primeiro recebimento",
            texto:
              "Depois que a peça entrou, desfazer por aqui deixaria saldo e histórico em desacordo. Se precisar corrigir, use um movimento de estoque (4.1), que fica registrado.",
          },
        ]
      ),
      aba(
        "4.3",
        "Prestadores",
        "Quem executa serviço *para* você — o terceirizado, o parceiro, o especialista que você chama.",
        [
          {
            tipo: "p",
            texto:
              "Cadastro simples: nome, especialidade (“Elétrica”, “Hidráulica”, “TI”), telefone, CPF/CNPJ, e-mail e observações. O prestador pode ser vinculado como responsável em uma Manutenção Interna (1.4).",
          },
          {
            tipo: "atencao",
            titulo: "Prestador não é fornecedor",
            texto:
              "São listas diferentes de propósito. Prestador vende serviço; fornecedor vende peça, e mora dentro de Compras (4.2).",
          },
        ]
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    numero: "5",
    titulo: "Empresa",
    descricao: "Equipe, números e ajustes",
    verbetes: [
      aba(
        "5.1",
        "Equipe",
        "Quem tem acesso ao sistema, com que perfil, e desde quando.",
        [
          {
            tipo: "p",
            texto:
              "*Convidar membro* pede nome, e-mail, função (Administrador, acesso total, ou Técnico, acesso controlado), CPF/CNPJ, telefone e endereço. A pessoa recebe um e-mail e cria a própria senha — você nunca precisa saber a senha de ninguém.",
          },
          {
            tipo: "p",
            texto:
              "A lista mostra também a localização de quem está com o GPS ligado, que é a mesma informação do Mapa (1.5).",
          },
          {
            tipo: "atencao",
            titulo: "Se o e-mail de convite não chegar",
            texto:
              "O membro já foi criado. Peça para ele usar “Esqueci minha senha” na tela de entrada, com o mesmo e-mail — funciona igual.",
          },
        ]
      ),
      aba(
        "5.2",
        "Relatórios",
        "Os números do período, do resumo ao detalhe linha a linha.",
        [
          {
            tipo: "lista",
            itens: [
              "*DRE simplificado* — receitas, despesas e o resultado: lucro ou prejuízo no período.",
              "*OS por status* — quantas em cada etapa.",
              "*Top 10 clientes* — quem mais faturou.",
              "*Desempenho por técnico* — concluídas, total, média, dias da abertura à conclusão e a nota que os clientes deram.",
              "*Detalhe de receitas e de despesas* — cada lançamento, com data e valor.",
            ],
          },
          {
            tipo: "atencao",
            titulo: "Depende do plano",
            texto:
              "No plano inicial, o relatório mostra o mês atual. Período personalizado e as análises avançadas (Top 10, desempenho por técnico e os detalhamentos) entram a partir do Pro.",
          },
        ]
      ),
      aba(
        "5.3",
        "Indicação",
        "Seu link para indicar o ServiçoOS a outros empresários.",
        [
          {
            tipo: "lista",
            itens: [
              "Quem entra pelo seu link ganha *10% de desconto* no primeiro pagamento.",
              "Quando o indicado assina, *você ganha 20%* de desconto, aplicado na sua próxima cobrança.",
              "Sem limite de indicações.",
            ],
          },
        ]
      ),
      aba(
        "5.4",
        "Configurações",
        "A tela mais densa do sistema. Vale separar o que é da empresa (vale para todo mundo) do que é seu (vale só para você).",
        [
          {
            tipo: "lista",
            titulo: "Da empresa",
            itens: [
              "*Empresa* — nome, CNPJ, telefones, endereço, site. Sai nos PDFs.",
              "*Logo* — PNG, JPG ou WEBP, até 2 MB. Vai no topo dos documentos.",
              "*Termos e garantia* — o prazo padrão de garantia e os textos que saem impressos na OS e no orçamento, antes das assinaturas.",
              "*Receber por PIX* — tipo de chave, chave, nome do recebedor e cidade. O QR code passa a sair nos documentos.",
              "*Avisar o cliente automaticamente* — mensagem quando o serviço começa e quando termina, por WhatsApp e/ou e-mail. Começa desligado.",
              "*Régua de cobrança* — lembra o cliente 3 dias antes de vencer e cobra depois de vencido, sozinho. Começa desligada, e entra a partir do Pro.",
              "*WhatsApp (Z-API)* — ID da instância e token, obtidos criando uma conta na Z-API e lendo o QR code com o seu WhatsApp.",
              "*Idioma* — vale para toda a empresa, inclusive os e-mails, PDFs e mensagens que vão para os seus clientes. Pede confirmação.",
              "*Exportar dados* — baixa tudo num arquivo .json, pelo seu direito de portabilidade.",
            ],
          },
          {
            tipo: "lista",
            titulo: "Seu",
            itens: [
              "*Meu perfil* — seu nome, documento, telefone e endereço. O e-mail de acesso não muda aqui.",
              "*Minha assinatura* — você desenha a sua assinatura uma vez, e ela passa a sair sozinha nos documentos que você emite. Cada pessoa da equipe tem a dela.",
              "*Avisos no celular* — quais notificações você quer receber. Vale só para você.",
            ],
          },
          {
            tipo: "atencao",
            titulo: "Confira a chave PIX com calma",
            texto:
              "Se a chave estiver errada, o pagamento do seu cliente vai para outra pessoa, e o sistema não tem como desfazer isso. O dinheiro cai direto na conta da sua empresa — não passa pelo ServiçoOS, e não há taxa.",
          },
          {
            tipo: "passos",
            titulo: "Régua de cobrança, passo a passo",
            itens: [
              "Ligue a chave *Ligar a régua de cobrança*. Enquanto ela estiver desligada, nada sai.",
              "Escolha se quer *lembrar antes de vencer*, *cobrar depois de vencido*, ou os dois.",
              "Escolha por onde: WhatsApp, e-mail, ou ambos.",
              "Se quiser, informe um *valor mínimo* — abaixo dele o sistema não cobra.",
            ],
          },
          {
            tipo: "p",
            texto:
              "A régua entra a partir do plano Pro. As mensagens saem uma vez por dia, por volta das 9h da manhã. O cliente recebe *no máximo cinco*: uma 3 dias antes do vencimento, e depois no dia seguinte ao vencimento e aos 7, 15 e 30 dias. Passados os 30, o sistema para de cobrar sozinho — daí em diante a conta precisa de você.",
          },
          {
            tipo: "lista",
            titulo: "O que ela nunca faz",
            itens: [
              "Cobrar uma conta que já foi paga.",
              "Mandar mais de uma mensagem por dia para a mesma conta, mesmo que vários prazos tenham passado de uma vez.",
              "Cobrar quem apenas recebeu o serviço: a mensagem vai para *quem paga*. Se o cliente tem um contratante, é o contratante que recebe.",
              "Cobrar receita lançada à mão, sem OS — não há a quem cobrar.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Se você *renegociar* e mudar a data de vencimento, a régua recomeça sozinha a partir da data nova. Não precisa mexer em nada.",
          },
          {
            tipo: "atencao",
            titulo: "Você precisa do consentimento do seu cliente",
            texto:
              "As mensagens saem em nome da sua empresa, para os contatos que você cadastrou — e quem responde por mensagem indesejada é você, não o ServiçoOS. Toda mensagem avisa o cliente para desconsiderar caso já tenha pago, porque a baixa de pagamento costuma atrasar alguns dias.",
          },
        ]
      ),
      aba(
        "5.4.1",
        "Permissões",
        "O que o técnico enxerga e o que ele pode fazer — em dois degraus.",
        [
          {
            tipo: "p",
            texto:
              "No topo da tela você escolhe *qual cargo* está configurando. Cada um tem a sua própria configuração — mexer no Técnico não mexe no Financeiro.",
          },
          {
            tipo: "lista",
            itens: [
              "*Abas que o cargo enxerga* — quais telas aparecem no menu de quem tem aquele cargo.",
              "*O que ele pode fazer* — dentro de uma aba liberada, quais ações ele executa.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Proprietário e administrador fazem tudo e não aparecem aqui. A mudança entra em vigor na próxima vez que a pessoa carregar a página.",
          },
          {
            tipo: "atencao",
            titulo: "Cada cargo já vem com um padrão que faz sentido",
            texto:
              "Convidar alguém como Financeiro já abre o sistema no Financeiro, sem você configurar nada. O padrão é por cargo, e serve como ponto de partida — ajuste o que quiser a partir dele.",
          },
        ]
      ),
      aba(
        "5.4.2",
        "Campos personalizados",
        "Cada ramo guarda coisas diferentes. Aqui você cria os campos que a sua empresa precisa, e eles passam a aparecer no cadastro.",
        [
          {
            tipo: "p",
            texto:
              "Dá para criar campos no *cadastro de cliente* e na *ordem de serviço*, nos tipos Texto, Número, Data, Lista de opções e Sim / Não — com a opção de tornar o preenchimento obrigatório, e de reordenar.",
          },
          {
            tipo: "p",
            texto:
              "Exemplos que aparecem no próprio sistema: Metragem para limpeza, Raça para pet, Número de série para assistência técnica.",
          },
          {
            tipo: "atencao",
            titulo: "Remover não perde o que já foi preenchido",
            texto:
              "O campo some do cadastro, mas os valores continuam guardados. Se você criar o campo de novo, eles reaparecem.",
          },
        ]
      ),
      aba(
        "5.4.3",
        "Vocabulário",
        "Faz o sistema falar como a sua empresa fala. Se na sua o certo é “chamado”, ou “atendimento”, ou “visita”, é aqui que se troca.",
        [
          {
            tipo: "lista",
            titulo: "Duas palavras, cada uma em quatro formas",
            itens: [
              "*O que você abre para cada trabalho* — por padrão, “ordem de serviço”.",
              "*Quem executa o trabalho* — por padrão, “técnico”.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Para cada uma: a *forma curta* (usada em botões e colunas, tipo “OS”), o *singular*, o *plural* e o *gênero* — que é o que decide se o sistema escreve “a ordem concluída” ou “o chamado concluído”.",
          },
          {
            tipo: "p",
            texto:
              "A troca vale no menu, nos botões, nos relatórios, nos PDFs e nos e-mails que os seus clientes recebem. Há uma pré-visualização antes de salvar, e um botão para voltar ao padrão.",
          },
        ]
      ),
      aba(
        "5.4.4",
        "Filiais",
        "Para quem tem mais de uma unidade. Define o que cada unidade vê e o que continua sendo da empresa toda.",
        [
          {
            tipo: "tabela",
            cabecalho: ["Separado por filial", "Compartilhado pela empresa"],
            linhas: [
              [
                "Clientes, ordens de serviço, agenda, financeiro e equipe",
                "Estoque e peças, fornecedores e compras, orçamentos, contratos, configurações e cobrança",
              ],
            ],
          },
          {
            tipo: "p",
            texto:
              "Quem tem filial vê a unidade dele e o que é da empresa toda. Proprietário e administrador veem todas, e podem filtrar por uma na tela.",
          },
          {
            tipo: "atencao",
            titulo: "Criar a primeira filial não some com a sua base",
            texto:
              "Registro sem filial aparece para todo mundo — é o que garante isso. E filial se desativa, não se apaga: apagar levaria junto o vínculo de cada cliente, OS e receita da unidade, e o faturamento por filial do ano inteiro.",
          },
        ],
        "Enterprise"
      ),
      aba(
        "5.4.5",
        "API de integração",
        "Conecta o ServiçoOS ao site da sua empresa, ao seu ERP ou a uma automação. É a porta para quem vai programar algo.",
        [
          {
            tipo: "lista",
            itens: [
              "Você cria uma *chave* com um nome (“Formulário do site”) para saber depois onde ela está sendo usada.",
              "Até *5 chaves ativas*; revogue uma que não usa antes de criar outra.",
              "Limite de *120 chamadas por minuto* por chave.",
              "A própria tela traz a documentação: endereço base, autenticação, o que existe, exemplo e paginação.",
            ],
          },
          {
            tipo: "atencao",
            titulo: "A chave aparece uma única vez",
            texto:
              "Copie na hora. O sistema guarda só um resumo dela — nem o suporte consegue mostrá-la de novo. Trate como senha: uma chave dá acesso de leitura e escrita aos dados da sua empresa.",
          },
        ],
        "Enterprise"
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    numero: null,
    titulo: "Na prática",
    descricao: "Como as telas se encadeiam",
    verbetes: [
      geral(
        "ciclo",
        "O ciclo de uma OS, do começo ao fim",
        "As telas fazem sentido juntas. Este é o caminho completo de um trabalho, com o número da aba em cada etapa.",
        [
          {
            tipo: "passos",
            itens: [
              "*Cliente liga.* Você cadastra ou já tem a ficha dele — 2.1.",
              "*Manda o orçamento.* Cria em 3.2, envia o link, e o cliente aprova sozinho. Você é avisado no celular.",
              "*Abre a OS.* Em 1.1, com cliente, responsável, data e os itens.",
              "*A data entra na agenda.* Ela aparece em 1.2 e no mapa 1.5, e o técnico é avisado no celular.",
              "*O técnico executa.* Marca o checklist, tira as fotos e colhe a assinatura do cliente no próprio celular.",
              "*Conclui e fatura.* Descreve o que foi feito, confere os itens e escolhe Concluir e Faturar. A receita nasce em 3.1.",
              "*Emite a nota.* Botão Emitir NFS-e na própria OS, se 3.4 estiver configurado.",
              "*Recebe.* O cliente paga pelo QR code PIX impresso no documento; você dá baixa em 3.1 e o recibo aparece em 3.3.",
              "*A OS vai para o arquivo.* Some do dia a dia e fica em 1.3, e os números entram em 5.2.",
            ],
          },
        ]
      ),
      geral(
        "cliente-ve",
        "O que o seu cliente vê",
        "Ele não entra no sistema nem cria conta. Recebe links, e cada link abre uma página só dele.",
        [
          {
            tipo: "lista",
            itens: [
              "*Acompanhamento da OS* — responsável, data agendada, descrição, serviços realizados e os valores.",
              "*Confirmação de execução* — ele assina ali mesmo, com o dedo, confirmando que o serviço foi feito.",
              "*Orçamento digital* — lê a proposta e clica em aprovar ou recusar.",
              "*Pagamento por PIX* — aponta a câmera do banco para o código, ou copia e cola a chave.",
              "*Avaliação* — de 0 a 10, com espaço para comentário. É a nota que alimenta o desempenho por técnico em 5.2.",
            ],
          },
        ]
      ),
      geral(
        "celular",
        "Celular e sem sinal",
        "O ServiçoOS é um aplicativo web: instala pelo navegador, sem passar por loja. No celular do técnico ele se comporta como app.",
        [
          {
            tipo: "p",
            texto:
              "*Para instalar*, abra o sistema no navegador do celular e use “Adicionar à tela de início” (Android) ou “Adicionar à Tela de Início” pelo botão de compartilhar (iPhone).",
          },
          {
            tipo: "lista",
            titulo: "Sem sinal",
            itens: [
              "O app *abre*, e toda tela que já foi aberta com sinal continua abrindo.",
              "*Concluir* uma OS e *mudar o status* funcionam offline: ficam guardados no aparelho e sobem sozinhos quando o sinal volta. Pode fechar o app.",
              "*Criar* uma OS nova precisa de conexão.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Uma faixa avisa quando você está offline, e mostra quantas alterações estão na fila esperando para subir.",
          },
          {
            tipo: "atencao",
            titulo: "Alterações travadas",
            texto:
              "Se algo não puder ser enviado, o sistema avisa em vez de sobrescrever. Quase sempre é porque outra pessoa mexeu naquela OS enquanto você estava sem sinal. Confira antes de refazer.",
          },
        ]
      ),
      geral(
        "avisos",
        "Avisos no celular",
        "Notificações que chegam no aparelho mesmo com o sistema fechado. Cada pessoa escolhe as suas, em Configurações.",
        [
          {
            tipo: "lista",
            itens: [
              "Quando uma OS passa a ser sua.",
              "Quando o contrato recorrente gera uma OS para você.",
              "Quando alguém da equipe conclui um serviço.",
              "Quando uma OS muda de status em campo.",
              "Quando o cliente aprova ou recusa um orçamento.",
              "Quando o pagamento da assinatura é confirmado.",
              "Quando a prefeitura recusa uma nota fiscal.",
              "Quando o certificado digital está perto de vencer.",
            ],
          },
          {
            tipo: "atencao",
            titulo: "O toque não se escolhe pelo sistema",
            texto:
              "Nenhum navegador permite que um site troque o som da notificação — o toque é o do seu aparelho, e se muda nas configurações dele. O que dá para fazer aqui é receber sem som: continua chegando, só não faz barulho nem vibra.",
          },
        ]
      ),
      geral(
        "assistente",
        "A assistente de voz",
        "Um botão de microfone em toda tela do painel. Você fala, ela responde em voz e faz o que foi pedido. É um adicional — não vem nos planos.",
        [
          {
            tipo: "lista",
            titulo: "O que dá para pedir",
            itens: [
              "*Abrir telas* — “abre os orçamentos”, “vai pro estoque”, “me leva pro 3.2”.",
              "*Consultar* — “quais ordens eu tenho hoje”, “histórico do cliente João”, “o que está faltando no estoque”.",
              "*Registrar* — “inicia a 24”, “cria uma ordem pro Mercado São Jorge”, “adiciona testar pressão no checklist”.",
            ],
          },
          {
            tipo: "p",
            texto:
              "Ela só faz o que *você* poderia fazer clicando. Um técnico sem permissão de concluir não consegue concluir pela voz — a assistente nem oferece.",
          },
          {
            tipo: "atencao",
            titulo: "O que não se desfaz sempre para e pergunta",
            texto:
              "Concluir, faturar, emitir nota e apagar mostram uma frase com o número da OS e o nome do cliente, falada em voz alta, e esperam você confirmar. Reconhecimento de fala erra, e erra mais em obra barulhenta — a confirmação existe para você perceber que ela ouviu “apaga” quando você disse “acaba”.",
          },
          {
            tipo: "p",
            texto:
              "Se houver dois clientes com nome parecido, ela *pergunta qual* em vez de escolher. E cada empresa tem uma franquia de comandos por mês, mostrada no topo do painel dela.",
          },
        ]
      ),
      geral(
        "duvidas",
        "Dúvidas comuns",
        "As perguntas que mais aparecem, com a resposta curta.",
        [
          {
            tipo: "lista",
            titulo: "“Sumiu uma aba que eu via antes”",
            itens: [
              "Ou um administrador mudou as Permissões (5.4.1), ou o recurso saiu do seu plano. Mapa e Fiscal são os dois que dependem de plano.",
            ],
          },
          {
            tipo: "lista",
            titulo: "“O cliente não aparece no mapa”",
            itens: [
              "Falta endereço na ficha, ou o endereço não foi localizado. Veja a lista “fora do mapa” em 1.5. Endereços importados de planilha entram no mapa ao longo do dia seguinte.",
            ],
          },
          {
            tipo: "lista",
            titulo: "“Concluí a OS e não apareceu no financeiro”",
            itens: [
              "Você escolheu Concluir (sem faturar). Reabra a OS, use Editar conclusão e escolha Salvar e Faturar.",
            ],
          },
          {
            tipo: "lista",
            titulo: "“O saldo do estoque está errado”",
            itens: [
              "Não edite a peça — o saldo não se edita. Use Movimentar com o tipo Ajuste e digite o que você contou na prateleira, com o motivo.",
            ],
          },
          {
            tipo: "lista",
            titulo: "“A nota fiscal não emite”",
            itens: [
              "Confira, nesta ordem: os dados fiscais estão completos em 3.4? O certificado foi enviado? Ele está dentro da validade? E o seu plano ainda tem nota disponível no mês?",
            ],
          },
          {
            tipo: "lista",
            titulo: "“A nota saiu no nome errado”",
            itens: [
              "Confira o campo *Cobrar de* na OS. Quando o cliente tem contratante, a nota sai no CNPJ de quem paga — e o padrão é a contratante, não o cliente final.",
            ],
          },
          {
            tipo: "lista",
            titulo: "“Meus dados são meus?”",
            itens: [
              "São. Exportar dados, em 5.4, baixa tudo num arquivo, a qualquer momento, sem pedir nada a ninguém.",
            ],
          },
        ]
      ),
    ],
  },
]

/** Todos os verbetes, sem a divisão em seções. */
export function todosOsVerbetes(): Verbete[] {
  return MANUAL.flatMap((s) => s.verbetes)
}

/** Os códigos que o manual explica. Usado no teste que casa manual e catálogo. */
export function codigosExplicados(): string[] {
  return todosOsVerbetes()
    .map((v) => v.codigo)
    .filter((c): c is string => c !== null)
}
