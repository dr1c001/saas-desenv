import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Termos de Uso — ServiçoOS",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
          <span className="text-lg font-bold text-primary ml-auto">ServiçoOS</span>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Termos de Uso</h1>
          <p className="text-sm text-muted-foreground mt-2">Última atualização: 3 de julho de 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p+p]:mt-3">
          <section>
            <h2>1. Quem presta este serviço</h2>
            <p>
              O ServiçoOS é operado por <strong>ADRIEL WELLINGTON RODRIGUES</strong>, inscrito no CNPJ nº{" "}
              <strong>53.325.011/0001-08</strong>, doravante
              denominado &ldquo;ServiçoOS&rdquo;, &ldquo;nós&rdquo; ou &ldquo;prestador&rdquo;.
            </p>
            <p>
              Ao criar uma conta ou usar o sistema de qualquer forma, você (&ldquo;usuário&rdquo; ou
              &ldquo;cliente&rdquo;) concorda com estes Termos de Uso e com a nossa{" "}
              <Link href="/privacy" className="text-primary underline underline-offset-2">Política de Privacidade</Link>.
              Se você não concorda com algum ponto, não utilize o serviço.
            </p>
          </section>

          <section>
            <h2>2. O que é o ServiçoOS</h2>
            <p>
              O ServiçoOS é um sistema de gestão (SaaS) voltado a empresas prestadoras de serviço, oferecendo,
              entre outras funcionalidades: cadastro de clientes (CRM), orçamentos, ordens de serviço, controle
              financeiro, agendamento, mapa de localização de técnicos em tempo real, checklist e assinatura
              digital, emissão de notas fiscais de serviço eletrônicas (NFS-e) e integração com WhatsApp.
            </p>
            <p>
              O serviço é fornecido &ldquo;como está&rdquo; (as is) e pode ser atualizado, modificado ou ter
              funcionalidades adicionadas ou removidas a qualquer momento, buscando sempre manter ou melhorar
              a experiência do usuário.
            </p>
          </section>

          <section>
            <h2>3. Cadastro e conta</h2>
            <p>
              Para usar o ServiçoOS você deve criar uma conta com informações verdadeiras, completas e
              atualizadas sobre você e sua empresa. Você é responsável por manter a confidencialidade da sua
              senha e por todas as atividades realizadas na sua conta.
            </p>
            <p>
              Cada conta representa uma empresa (&ldquo;tenant&rdquo;) e pode ter múltiplos usuários com
              diferentes níveis de permissão (proprietário, administrador, técnico), controlados pelo
              proprietário da conta.
            </p>
          </section>

          <section>
            <h2>4. Período de teste gratuito</h2>
            <p>
              Novas contas têm direito a <strong>15 dias corridos</strong> de teste gratuito, sem necessidade
              de cartão de crédito, com acesso completo às funcionalidades do plano contratável. Esse período
              pode ser estendido por dias adicionais por meio do programa de indicação (seção 7).
            </p>
            <p>
              Ao final do período de teste, caso nenhum plano seja contratado, o acesso às funcionalidades do
              sistema é bloqueado até a contratação de um plano pago — os dados cadastrados permanecem salvos
              e são restaurados automaticamente assim que um plano for assinado.
            </p>
          </section>

          <section>
            <h2>5. Planos, pagamento e cobrança</h2>
            <p>
              Os planos disponíveis, preços e funcionalidades incluídas são exibidos na página de{" "}
              <Link href="/#planos" className="text-primary underline underline-offset-2">planos</Link>{" "}
              e na área de assinatura dentro do sistema, podendo ser reajustados mediante aviso prévio.
            </p>
            <p>
              Os pagamentos são processados por um parceiro de pagamentos (gateway) e podem ser feitos via
              PIX, boleto bancário ou cartão de crédito, em ciclo mensal ou anual. O ServiçoOS não armazena
              dados completos de cartão de crédito — o processamento é feito integralmente pelo parceiro de
              pagamentos.
            </p>
            <p>
              A cobrança é recorrente e automática conforme o ciclo escolhido, até que a assinatura seja
              cancelada. Em caso de falha ou atraso de pagamento, o acesso poderá ser suspenso até a
              regularização.
            </p>
          </section>

          <section>
            <h2>6. Cancelamento e reembolso</h2>
            <p>
              Você pode cancelar sua assinatura a qualquer momento diretamente pela área de assinatura do
              sistema, sem multa. O cancelamento interrompe a renovação automática; o acesso às
              funcionalidades pagas permanece até o fim do período já pago.
            </p>
            <p>
              Valores já pagos por períodos vigentes não são reembolsados, salvo exigência legal em
              contrário ou decisão comercial expressa do ServiçoOS.
            </p>
          </section>

          <section>
            <h2>7. Programa de indicação</h2>
            <p>
              Usuários podem indicar o ServiçoOS para terceiros por meio de um link exclusivo. Quem se
              cadastra por indicação ganha dias extras de teste gratuito; quem indica ganha dias extras de
              assinatura quando o indicado contrata um plano pago. Os detalhes e quantidades vigentes são
              exibidos na área de indicação do sistema e podem ser ajustados a qualquer momento, sem efeito
              retroativo sobre benefícios já concedidos.
            </p>
          </section>

          <section>
            <h2>8. Seus dados e os dados dos seus clientes</h2>
            <p>
              Todo conteúdo que você insere no sistema — cadastros de clientes, ordens de serviço, dados
              financeiros, orçamentos, documentos e anexos — pertence a você ou à sua empresa. O ServiçoOS
              atua apenas como operador desses dados, armazenando-os e processando-os para permitir o
              funcionamento do sistema, conforme detalhado na{" "}
              <Link href="/privacy" className="text-primary underline underline-offset-2">Política de Privacidade</Link>.
            </p>
            <p>
              Você é responsável por garantir que possui base legal e consentimento adequados para inserir
              dados de terceiros (seus clientes, técnicos e fornecedores) no sistema.
            </p>
          </section>

          <section>
            <h2>9. Uso aceitável</h2>
            <p>Ao usar o ServiçoOS, você concorda em não:</p>
            <ul>
              <li>Utilizar o sistema para fins ilegais ou que violem direitos de terceiros;</li>
              <li>Tentar acessar dados de outras empresas (tenants) sem autorização;</li>
              <li>Tentar contornar limites técnicos, de segurança ou de uso do sistema;</li>
              <li>Realizar engenharia reversa, copiar ou revender o sistema sem autorização;</li>
              <li>Utilizar o sistema para envio de spam ou comunicações não solicitadas via WhatsApp/e-mail.</li>
            </ul>
          </section>

          <section>
            <h2>10. Disponibilidade do serviço</h2>
            <p>
              Envidamos esforços razoáveis para manter o sistema disponível e funcionando corretamente, mas
              não garantimos disponibilidade ininterrupta (100% uptime). Manutenções programadas,
              instabilidades de fornecedores terceiros (hospedagem, banco de dados, gateway de pagamento) ou
              eventos de força maior podem causar indisponibilidade temporária.
            </p>
          </section>

          <section>
            <h2>11. Propriedade intelectual</h2>
            <p>
              O software, marca, design e demais elementos do ServiçoOS são de propriedade do prestador
              identificado na seção 1, sendo concedida ao usuário apenas uma licença de uso não exclusiva,
              intransferível e revogável, limitada à vigência da assinatura.
            </p>
          </section>

          <section>
            <h2>12. Limitação de responsabilidade</h2>
            <p>
              Na máxima medida permitida pela lei, o ServiçoOS não se responsabiliza por danos indiretos,
              lucros cessantes ou perda de dados decorrentes de uso indevido do sistema, falhas de conexão à
              internet do usuário, ou indisponibilidade de serviços de terceiros integrados (gateway de
              pagamento, provedor de e-mail, WhatsApp, emissor de nota fiscal).
            </p>
            <p>
              Recomendamos que o usuário mantenha cópias/backups próprios de documentos e dados
              especialmente sensíveis, além dos backups mantidos pelo ServiçoOS.
            </p>
          </section>

          <section>
            <h2>13. Rescisão</h2>
            <p>
              O ServiçoOS pode suspender ou encerrar contas que violem estes Termos de Uso, mediante aviso
              prévio quando possível. O usuário pode encerrar sua conta a qualquer momento, entrando em
              contato pelo canal de suporte.
            </p>
          </section>

          <section>
            <h2>14. Alterações nestes termos</h2>
            <p>
              Podemos atualizar estes Termos de Uso periodicamente. Alterações materiais serão comunicadas
              por e-mail ou aviso no sistema. O uso continuado após a alteração implica concordância com os
              novos termos.
            </p>
          </section>

          <section>
            <h2>15. Lei aplicável e foro</h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da
              comarca de domicílio do prestador identificado na seção 1 para dirimir quaisquer controvérsias
              decorrentes destes Termos, com renúncia a qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          <section>
            <h2>16. Contato</h2>
            <p>
              Dúvidas sobre estes Termos de Uso podem ser enviadas para{" "}
              <a href="mailto:olisuporte1@gmail.com" className="text-primary underline underline-offset-2">
                olisuporte1@gmail.com
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
