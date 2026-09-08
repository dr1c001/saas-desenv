import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { numeroEExtenso } from "@/lib/extenso"

// Contrato de prestação de serviço + tratamento de dados (LGPD), gerado por
// cliente no momento da assinatura.
//
// ATENÇÃO A QUEM FOR MEXER AQUI: este é um documento jurídico que vai para
// cliente real. Alterar texto de cláusula muda obrigação contratual — não é
// mudança de copy. Qualquer alteração de conteúdo deve passar por advogado,
// e a versão (VERSAO_CONTRATO) precisa subir junto, porque o cliente recebeu
// uma versão específica no dia em que assinou.
//
// v1.1 (10/08/2026) — aplica o parecer jurídico sobre a v1.0. As redações
// abaixo marcadas como "(parecer)" são transcrição literal do que o advogado
// propôs; não reescrever "pra ficar mais claro" sem nova consulta. Foram
// mantidas sem alteração, por aprovação expressa do parecer, as cláusulas
// 5.3 (legítimo interesse) e 5.7 (suboperadores por função).
//
// v1.2 (21/08/2026) — a carência da cláusula 4.1 subiu de 5 para 30 dias.
// A versão sobe porque isto MUDA UMA CLÁUSULA: quem assinou a v1.1 contratou
// 5 dias. A mudança é FAVORÁVEL à CONTRATANTE (mais prazo antes da suspensão),
// então não há prejuízo a quem já assinou — mas o prazo declarado no documento
// dela continua sendo o que ela assinou, e por isso a versão precisa
// distinguir os dois. PENDENTE de conferência do advogado que emitiu o parecer
// da v1.0/v1.1.
//
// O prazo não está escrito aqui: vem de PAST_DUE_GRACE_DAYS (lib/past-due.ts),
// que é a MESMA constante que o bloqueio usa. Uma cláusula que promete um
// prazo diferente do que o sistema aplica é a pior divergência possível neste
// documento.

export const VERSAO_CONTRATO = "1.2"

/** Comarca da sede da CONTRATADA, usada na eleição de foro (cláusula 11).
 *  Se a sede mudar, muda aqui — e a versão do contrato sobe junto. */
const COMARCA_CONTRATADA = "Piracicaba/SP"

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, padding: 48, paddingBottom: 64, color: "#1a1a1a", lineHeight: 1.5 },
  capa: { marginBottom: 20, borderBottomWidth: 2, borderBottomColor: "#1a1a1a", paddingBottom: 12 },
  marca: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 6 },
  meta: { fontSize: 8, color: "#666", marginTop: 4 },
  clausula: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5 },
  sub: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 5, textAlign: "justify" },
  li: { marginBottom: 3, paddingLeft: 12, textAlign: "justify" },
  caixa: { backgroundColor: "#f4f4f4", borderRadius: 4, padding: 10, marginTop: 8, marginBottom: 8 },
  linhaDado: { flexDirection: "row", marginBottom: 2 },
  rotulo: { width: 130, color: "#555" },
  valor: { flex: 1, fontFamily: "Helvetica-Bold" },
  emResumo: {
    borderLeftWidth: 3, borderLeftColor: "#7c3aed", backgroundColor: "#faf5ff",
    padding: 8, marginTop: 6, marginBottom: 8,
  },
  emResumoTitulo: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b21a8", marginBottom: 2 },
  emResumoTexto: { fontSize: 8.5, color: "#4c1d95" },
  rodape: {
    position: "absolute", bottom: 24, left: 48, right: 48,
    borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 6,
    flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#888",
  },
})

export type DadosContrato = {
  numero: string
  emitidoEm: Date
  empresa: { nome: string; documento: string | null; email: string; endereco: string | null }
  plano: { nome: string; valorMensal: number; ciclo: "MENSAL" | "ANUAL"; valorCobrado: number }
  inicioVigencia: Date
  diasCarencia: number
}

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dia = (d: Date) => new Date(d).toLocaleDateString("pt-BR")

/** Bloco "o que isso quer dizer" em português claro, ao lado da cláusula.
 *  O usuário pediu que o contrato explicasse passo a passo — cláusula jurídica
 *  sozinha não explica nada pra quem não é advogado. */
function EmResumo({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.emResumo}>
      <Text style={styles.emResumoTitulo}>EM RESUMO</Text>
      <Text style={styles.emResumoTexto}>{children}</Text>
    </View>
  )
}

export function ContratoPDF({ dados }: { dados: DadosContrato }) {
  const { empresa, plano } = dados

  return (
    <Document title={`Contrato ServiçoOS ${dados.numero}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.capa}>
          <Text style={styles.marca}>ServiçoOS</Text>
          <Text style={styles.titulo}>
            Contrato de Prestação de Serviços de Software (SaaS) e{"\n"}Termo de Tratamento de Dados Pessoais
          </Text>
          <Text style={styles.meta}>
            Nº {dados.numero} · versão {VERSAO_CONTRATO} · emitido em {dia(dados.emitidoEm)}
          </Text>
        </View>

        {/* ── Partes ── */}
        <Text style={styles.clausula}>IDENTIFICAÇÃO DAS PARTES</Text>
        <View style={styles.caixa}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>CONTRATADA (Operadora)</Text>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>Serviço</Text><Text style={styles.valor}>ServiçoOS — servicoos.com.br</Text></View>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>Contato / Encarregado</Text><Text style={styles.valor}>suporte@servicoos.com.br</Text></View>
        </View>
        <View style={styles.caixa}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>CONTRATANTE (Controladora)</Text>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>Razão social / Nome</Text><Text style={styles.valor}>{empresa.nome}</Text></View>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>CNPJ / CPF</Text><Text style={styles.valor}>{empresa.documento ?? "não informado"}</Text></View>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>E-mail</Text><Text style={styles.valor}>{empresa.email}</Text></View>
          {empresa.endereco && (
            <View style={styles.linhaDado}><Text style={styles.rotulo}>Endereço</Text><Text style={styles.valor}>{empresa.endereco}</Text></View>
          )}
        </View>

        {/* ── 1 ── */}
        <Text style={styles.clausula}>CLÁUSULA 1 — OBJETO</Text>
        <Text style={styles.p}>
          1.1. A CONTRATADA licencia à CONTRATANTE, de forma não exclusiva e intransferível, o uso do
          sistema ServiçoOS, plataforma de gestão de ordens de serviço acessada pela internet (Software
          as a Service), incluindo cadastro de clientes, orçamentos, ordens de serviço, controle
          financeiro, relatórios e demais funcionalidades do plano contratado.
        </Text>
        <Text style={styles.p}>
          1.2. O serviço é prestado na modalidade de licença de uso. Não há transferência de propriedade
          do software, do código-fonte ou de qualquer direito de propriedade intelectual da CONTRATADA.
        </Text>
        <EmResumo>
          Você está contratando o direito de usar o sistema pela internet, enquanto a assinatura estiver
          ativa. O software continua sendo nosso; os dados que você cadastra continuam sendo seus.
        </EmResumo>

        {/* ── 2 ── */}
        <Text style={styles.clausula}>CLÁUSULA 2 — PLANO CONTRATADO E PREÇO</Text>
        <View style={styles.caixa}>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>Plano</Text><Text style={styles.valor}>{plano.nome}</Text></View>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>Cobrança</Text><Text style={styles.valor}>{plano.ciclo === "ANUAL" ? "Anual" : "Mensal"}</Text></View>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>Valor</Text><Text style={styles.valor}>{brl(plano.valorCobrado)} {plano.ciclo === "ANUAL" ? "por ano" : "por mês"}</Text></View>
          <View style={styles.linhaDado}><Text style={styles.rotulo}>Início da vigência</Text><Text style={styles.valor}>{dia(dados.inicioVigencia)}</Text></View>
        </View>
        <Text style={styles.p}>
          2.1. Os limites de uso e as funcionalidades disponíveis são os do plano acima, conforme
          descrito na página de planos do site na data desta contratação.
        </Text>
        <Text style={styles.p}>
          2.2. O pagamento é processado pela Asaas Gestão Financeira S.A., instituição de pagamento
          autorizada, aceitando cartão de crédito, boleto e PIX. A CONTRATADA não armazena dados
          completos de cartão de crédito.
        </Text>
        <Text style={styles.p}>
          2.3. Os valores da assinatura poderão ser reajustados anualmente com base na variação
          acumulada do IPCA/IBGE nos 12 (doze) meses anteriores, ou outro índice que venha a
          substituí-lo, mediante aviso prévio de 30 (trinta) dias, assegurado à CONTRATANTE o direito
          de cancelamento sem ônus caso não concorde com o novo valor. (parecer)
        </Text>

        {/* ── 3 ── */}
        <Text style={styles.clausula}>CLÁUSULA 3 — VIGÊNCIA, RENOVAÇÃO E CANCELAMENTO</Text>
        <Text style={styles.p}>
          3.1. O contrato vigora por prazo indeterminado, renovando-se automaticamente a cada ciclo de
          cobrança, enquanto não houver cancelamento.
        </Text>
        <Text style={styles.p}>
          3.2. A CONTRATANTE pode cancelar a qualquer momento, sem multa e sem necessidade de
          justificativa, pela própria tela de assinatura do sistema. O acesso permanece disponível até o
          fim do período já pago.
        </Text>
        <Text style={styles.p}>
          3.3. Não há devolução proporcional de valores já pagos referentes ao período em curso, salvo
          nas hipóteses previstas no Código de Defesa do Consumidor.
        </Text>
        <Text style={styles.p}>
          3.4. A CONTRATADA poderá suspender ou rescindir este Contrato, mediante notificação, nas
          hipóteses de: (i) inadimplência superior a 30 (trinta) dias, observado o procedimento de
          suspensão previsto na Cláusula 4; (ii) uso da Plataforma em violação à lei, a direitos de
          terceiros, ou à Política de Uso Aceitável; (iii) fraude ou tentativa de fraude comprovada.
          Nas hipóteses (i) e (ii), será concedido à CONTRATANTE prazo de 15 (quinze) dias para
          exportação de seus dados, na forma da Cláusula 5.10; na hipótese (iii), a CONTRATADA poderá
          reter os dados pelo prazo necessário à apuração e ao atendimento de eventual requisição de
          autoridade competente. (parecer)
        </Text>
        <EmResumo>
          Sem fidelidade e sem multa. Você cancela sozinho, pelo sistema, e continua usando até acabar o
          período que já pagou. Do nosso lado, só encerramos por uso ilegal, fraude ou conta parada há
          mais de 30 dias sem pagamento — e mesmo assim você tem 15 dias para baixar seus dados.
        </EmResumo>

        {/* ── 4 ── */}
        <Text style={styles.clausula}>CLÁUSULA 4 — INADIMPLÊNCIA E SUSPENSÃO</Text>
        <Text style={styles.p}>
          4.1. Não confirmado o pagamento na data de vencimento, a CONTRATANTE será notificada por
          e-mail e manterá o acesso normal por {numeroEExtenso(dados.diasCarencia)} dias corridos.
        </Text>
        <Text style={styles.p}>
          4.2. Decorrido esse prazo sem regularização, o acesso ao sistema será suspenso para todos os
          usuários da CONTRATANTE. A suspensão <Text style={{ fontFamily: "Helvetica-Bold" }}>não</Text> implica
          exclusão de dados.
        </Text>
        <Text style={styles.p}>
          4.3. Confirmado o pagamento, o acesso é restabelecido automaticamente, sem necessidade de
          solicitação.
        </Text>
        <EmResumo>
          Se a cobrança falhar, avisamos por e-mail e você tem {dados.diasCarencia} dias de acesso normal. Passando
          disso, o acesso é bloqueado — mas nada é apagado, e pagando o acesso volta sozinho.
        </EmResumo>

        <View style={styles.rodape} fixed>
          <Text>ServiçoOS · Contrato {dados.numero} · versão {VERSAO_CONTRATO}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>

      {/* ── Página 2: LGPD ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.clausula}>CLÁUSULA 5 — PROTEÇÃO DE DADOS PESSOAIS (LEI Nº 13.709/2018 — LGPD)</Text>

        <Text style={styles.sub}>5.1. Papéis das partes (arts. 5º, VI e VII)</Text>
        <Text style={styles.p}>
          A CONTRATANTE é <Text style={{ fontFamily: "Helvetica-Bold" }}>CONTROLADORA</Text> dos dados pessoais que
          insere no sistema (dados de seus clientes, funcionários, técnicos e fornecedores), cabendo a
          ela as decisões sobre finalidade e meios do tratamento. A CONTRATADA é
          <Text style={{ fontFamily: "Helvetica-Bold" }}> OPERADORA</Text>, realizando o tratamento em nome e
          conforme instruções da CONTRATANTE.
        </Text>
        <Text style={styles.p}>
          Para os dados pessoais do próprio ASSINANTE (cadastro, faturamento, telemetria de uso da
          Plataforma), a CONTRATADA atua como CONTROLADORA, nos termos do art. 5º, VI, da LGPD,
          tratando tais dados com fundamento na execução do contrato (art. 7º, V), no cumprimento de
          obrigação legal ou regulatória (art. 7º, II) e, quando aplicável, em legítimo interesse
          (art. 7º, IX), conforme detalhado na Política de Privacidade da CONTRATADA. (parecer)
        </Text>
        <EmResumo>
          Os dados dos seus clientes são seus, e as decisões sobre eles são suas — nós só processamos o
          que você manda. Já os dados da SUA empresa (cadastro, cobrança, uso do sistema) são tratados
          por nós, e a Política de Privacidade explica como.
        </EmResumo>

        <Text style={styles.sub}>5.2. Finalidade do tratamento (art. 6º, I)</Text>
        <Text style={styles.p}>
          Os dados são tratados exclusivamente para: (a) executar as funcionalidades contratadas;
          (b) gerar documentos solicitados pela CONTRATANTE (orçamentos, ordens de serviço, recibos,
          notas fiscais); (c) prestar suporte técnico; (d) cumprir obrigações legais e regulatórias.
          A CONTRATADA <Text style={{ fontFamily: "Helvetica-Bold" }}>não</Text> comercializa, cede ou utiliza os
          dados da CONTRATANTE para publicidade própria ou de terceiros.
        </Text>

        <Text style={styles.sub}>5.3. Bases legais (arts. 7º e 11)</Text>
        <Text style={styles.li}>a) Execução de contrato (art. 7º, V) — para os dados necessários à prestação do serviço;</Text>
        <Text style={styles.li}>b) Cumprimento de obrigação legal (art. 7º, II) — para emissão fiscal e guarda de registros;</Text>
        <Text style={styles.li}>c) Legítimo interesse (art. 7º, IX) — para segurança, prevenção a fraude e melhoria do serviço, sempre com avaliação de impacto e respeito às expectativas do titular.</Text>
        <Text style={styles.p}>
          Cabe à CONTRATANTE assegurar base legal adequada para os dados de terceiros que inserir,
          inclusive obtenção de consentimento quando exigido.
        </Text>

        <Text style={styles.sub}>5.4. Direitos dos titulares (art. 18)</Text>
        <Text style={styles.p}>
          A CONTRATADA disponibiliza à CONTRATANTE recursos para atender, na qualidade de controladora,
          os pedidos de titulares quanto a: confirmação de tratamento, acesso, correção, anonimização,
          bloqueio, eliminação, portabilidade, informação sobre compartilhamento e revogação de
          consentimento. A exportação completa dos dados está disponível na área de Configurações do
          sistema, em formato aberto e legível por máquina.
        </Text>
        <EmResumo>
          Se um cliente seu pedir os dados dele, ou pedir para apagar, você consegue atender — o sistema
          tem exportação e exclusão. Nós ajudamos no que for técnico.
        </EmResumo>

        <Text style={styles.sub}>5.5. Segurança (art. 46)</Text>
        <Text style={styles.li}>a) Criptografia em trânsito (TLS/HTTPS) em todo o acesso ao sistema;</Text>
        <Text style={styles.li}>b) Criptografia em repouso no banco de dados;</Text>
        <Text style={styles.li}>c) Isolamento lógico entre empresas, de modo que uma não acesse dados de outra;</Text>
        <Text style={styles.li}>d) Controle de acesso por perfil, com senha individual;</Text>
        <Text style={styles.li}>e) Registro de auditoria dos acessos administrativos;</Text>
        <Text style={styles.li}>f) Backups periódicos com retenção definida pelo provedor de infraestrutura.</Text>

        <Text style={styles.sub}>5.6. Acesso da equipe de suporte</Text>
        <Text style={styles.p}>
          Para prestar suporte, investigar falhas ou corrigir problemas relatados, colaboradores
          autorizados da CONTRATADA podem acessar a conta da CONTRATANTE. Esse acesso: (a) é restrito a
          colaboradores autorizados, por função, com revogação imediata no desligamento; (b) é integralmente
          registrado em log de auditoria, com identificação de quem acessou, qual empresa, data e hora;
          (c) expira automaticamente em 1 (uma) hora; (d) está sujeito a obrigação contratual de
          confidencialidade. A CONTRATANTE pode solicitar a qualquer momento o histórico desses acessos.
        </Text>

        <Text style={styles.sub}>5.7. Suboperadores e compartilhamento (art. 39)</Text>
        <Text style={styles.p}>
          A prestação do serviço envolve os seguintes suboperadores, todos com obrigações de proteção de
          dados compatíveis com esta cláusula:
        </Text>
        <Text style={styles.li}>· Infraestrutura de aplicação e hospedagem;</Text>
        <Text style={styles.li}>· Banco de dados e autenticação;</Text>
        <Text style={styles.li}>· Processamento de pagamentos (Asaas Gestão Financeira S.A.);</Text>
        <Text style={styles.li}>· Envio de e-mails transacionais;</Text>
        <Text style={styles.li}>· Emissão de nota fiscal eletrônica, quando habilitada pela CONTRATANTE;</Text>
        <Text style={styles.li}>· Monitoramento de erros da aplicação.</Text>
        <Text style={styles.p}>
          A relação atualizada de suboperadores pode ser solicitada pelo e-mail de contato. Alterações
          relevantes serão comunicadas com antecedência razoável.
        </Text>

        <Text style={styles.sub}>5.8. Transferência internacional (arts. 33 a 36)</Text>
        <Text style={styles.p}>
          Parte da infraestrutura pode estar localizada fora do Brasil. Eventual transferência
          internacional de dados pessoais necessária à prestação dos serviços será realizada com amparo
          nas Cláusulas-Padrão Contratuais aprovadas pela Resolução CD/ANPD nº 19/2024, firmadas entre a
          CONTRATADA e o(s) operador(es) estrangeiro(s) envolvido(s), ou em outro mecanismo de
          transferência internacional expressamente autorizado pela Autoridade Nacional de Proteção de
          Dados. (parecer) A infraestrutura principal de aplicação está configurada para a região do
          Brasil.
        </Text>

        <Text style={styles.sub}>5.9. Incidentes de segurança (art. 48)</Text>
        <Text style={styles.p}>
          A CONTRATADA comunicará a CONTRATANTE sobre qualquer incidente de segurança que possa acarretar
          risco ou dano relevante aos titulares de dados, em prazo não superior a 24 (vinte e quatro)
          horas contadas da ciência do incidente, de modo a viabilizar o cumprimento, pela CONTRATANTE,
          do prazo de 3 (três) dias úteis previsto na Resolução CD/ANPD nº 15/2024 para comunicação à
          Autoridade Nacional de Proteção de Dados, ressalvado prazo diverso estabelecido em
          regulamentação superveniente. (parecer) A comunicação informará a natureza dos dados afetados,
          os titulares envolvidos, as medidas técnicas adotadas e os riscos identificados.
        </Text>

        <Text style={styles.sub}>5.10. Retenção e eliminação (arts. 15 e 16)</Text>
        <Text style={styles.p}>
          Encerrado o contrato, os dados permanecem disponíveis para exportação por 30 (trinta) dias.
          Findo esse prazo, e mediante solicitação da CONTRATANTE, os dados são eliminados, ressalvada a
          guarda de registros exigida por obrigação legal ou regulatória e a conservação de dados
          anonimizados para fins estatísticos.
        </Text>
        <Text style={styles.p}>
          Ressalvam-se da eliminação prevista nesta cláusula os documentos fiscais emitidos por meio da
          Plataforma (para os CONTRATANTES que utilizarem o módulo de emissão de nota fiscal), os quais
          serão retidos pela CONTRATADA ou por seu suboperador de emissão fiscal pelo prazo mínimo
          exigido pela legislação tributária aplicável, ainda que superior ao prazo de eliminação dos
          demais dados e ainda que solicitada a eliminação antecipada pela CONTRATANTE. (parecer)
        </Text>
        <EmResumo>
          Se você cancelar, tem 30 dias para baixar tudo. Depois disso, é só pedir que apagamos. A única
          exceção são as notas fiscais emitidas pelo sistema: a lei tributária obriga a guardá-las por
          anos, então elas ficam mesmo que você peça a exclusão.
        </EmResumo>

        <Text style={styles.sub}>5.11. Encarregado (art. 41)</Text>
        <Text style={styles.p}>
          Canal de comunicação para assuntos de proteção de dados: suporte@servicoos.com.br.
        </Text>

        <View style={styles.rodape} fixed>
          <Text>ServiçoOS · Contrato {dados.numero} · versão {VERSAO_CONTRATO}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>

      {/* ── Página 3: disposições finais ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.clausula}>CLÁUSULA 6 — OBRIGAÇÕES DA CONTRATANTE</Text>
        <Text style={styles.li}>a) Manter a confidencialidade das senhas de acesso, respondendo pelos atos praticados com suas credenciais;</Text>
        <Text style={styles.li}>b) Inserir apenas dados para os quais possua base legal;</Text>
        <Text style={styles.li}>c) Utilizar o sistema conforme a legislação vigente e os Termos de Uso;</Text>
        <Text style={styles.li}>d) Manter seus dados cadastrais e de cobrança atualizados;</Text>
        <Text style={styles.li}>e) Comunicar prontamente qualquer uso não autorizado de sua conta.</Text>

        <Text style={styles.clausula}>CLÁUSULA 7 — DISPONIBILIDADE E SUPORTE</Text>
        <Text style={styles.p}>
          7.1. A CONTRATADA empreenderá esforços razoáveis para manter o sistema disponível, sem, contudo,
          garantir disponibilidade ininterrupta, sujeita a manutenções programadas e a falhas de terceiros
          (provedores de infraestrutura, telecomunicações e serviços integrados).
        </Text>
        <Text style={styles.p}>
          7.2. O suporte é prestado pelos canais e no nível correspondentes ao plano contratado.
        </Text>

        <Text style={styles.clausula}>CLÁUSULA 8 — LIMITAÇÃO DE RESPONSABILIDADE</Text>
        <Text style={styles.p}>
          8.1. A responsabilidade da CONTRATADA limita-se aos danos diretos comprovadamente causados,
          até o valor total pago pela CONTRATANTE nos 12 (doze) meses anteriores ao evento.
        </Text>
        <Text style={styles.p}>
          8.2. A CONTRATADA não responde por lucros cessantes, perda de oportunidade de negócio ou danos
          decorrentes de uso indevido do sistema pela CONTRATANTE ou por seus usuários.
        </Text>
        <Text style={styles.p}>
          8.3. Nada nesta cláusula afasta direitos assegurados ao consumidor pelo Código de Defesa do
          Consumidor, quando aplicável.
        </Text>
        <Text style={styles.p}>
          8.4. Excetuam-se do teto de responsabilidade previsto nesta cláusula os danos decorrentes de
          dolo ou culpa grave da CONTRATADA, bem como a responsabilidade da CONTRATADA perante titulares
          de dados pessoais nos termos dos artigos 42 a 45 da Lei nº 13.709/2018 (LGPD), que não pode ser
          afastada ou limitada por disposição contratual entre as partes. (parecer)
        </Text>
        <EmResumo>
          Existe um teto de indenização, mas ele não vale para tudo: se houver má-fé ou erro grave da
          nossa parte, ou se alguém tiver dado pessoal vazado, o teto não se aplica.
        </EmResumo>

        <Text style={styles.clausula}>CLÁUSULA 9 — PROPRIEDADE INTELECTUAL</Text>
        <Text style={styles.p}>
          O software, marca, layout, código-fonte e documentação são de propriedade exclusiva da
          CONTRATADA. Os dados inseridos pela CONTRATANTE permanecem de sua titularidade.
        </Text>

        <Text style={styles.clausula}>CLÁUSULA 10 — ALTERAÇÕES</Text>
        <Text style={styles.p}>
          Alterações materiais neste contrato ou nos Termos de Uso serão comunicadas com antecedência
          mínima de 30 (trinta) dias, facultado à CONTRATANTE cancelar sem ônus caso não concorde.
        </Text>

        <Text style={styles.clausula}>CLÁUSULA 11 — FORO</Text>
        <Text style={styles.p}>
          Fica eleito o foro da Comarca de {COMARCA_CONTRATADA} para dirimir quaisquer controvérsias
          oriundas deste Contrato, com renúncia a qualquer outro, por mais privilegiado que seja, exceto
          quando a CONTRATANTE for consumidora nos termos do Código de Defesa do Consumidor, hipótese em
          que prevalecerá o foro do domicílio da CONTRATANTE, na forma do art. 101, I, da Lei nº
          8.078/1990. (parecer)
        </Text>

        <Text style={styles.clausula}>CLÁUSULA 12 — PREVALÊNCIA SOBRE OS TERMOS DE USO</Text>
        <Text style={styles.p}>
          Em caso de conflito ou divergência entre este Contrato e os Termos de Uso publicados em
          servicoos.com.br/terms, prevalecerão as disposições deste Contrato, sem prejuízo da aplicação
          subsidiária dos Termos de Uso nas matérias por ele não reguladas. (parecer)
        </Text>

        <View style={styles.caixa}>
          <Text style={{ fontSize: 8.5 }}>
            O presente Contrato é formalizado por aceite eletrônico no ato da contratação, sendo válido e
            eficaz nos termos do art. 107 do Código Civil e do art. 10, §2º, da Medida Provisória nº
            2.200-2/2001, ficando registrados, para fins de comprovação de autoria e integridade, o
            endereço IP, a data, a hora e a identificação da CONTRATANTE no momento da confirmação do
            pagamento. (parecer) Aceito por {empresa.nome} em {dia(dados.inicioVigencia)}, mediante
            contratação do plano {plano.nome}.
          </Text>
        </View>

        <Text style={{ fontSize: 8, color: "#666", marginTop: 12, textAlign: "center" }}>
          Documento gerado eletronicamente em {dia(dados.emitidoEm)}. Dispensa assinatura física.{"\n"}
          Versão vigente dos Termos de Uso e Política de Privacidade em servicoos.com.br/terms e /privacy.
        </Text>

        <View style={styles.rodape} fixed>
          <Text>ServiçoOS · Contrato {dados.numero} · versão {VERSAO_CONTRATO}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
