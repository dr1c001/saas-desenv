import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Política de Privacidade — ServiçoOS",
}

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold">Política de Privacidade</h1>
          <p className="text-sm text-muted-foreground mt-2">Última atualização: 3 de julho de 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:text-foreground [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mb-3 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p+p]:mt-3 [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:font-medium [&_th]:text-foreground [&_th]:py-2 [&_td]:py-2 [&_tr]:border-b">
          <section>
            <p>
              Esta Política de Privacidade descreve como o ServiçoOS coleta, usa, armazena e protege dados
              pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
            </p>
          </section>

          <section>
            <h2>1. Quem é o controlador dos dados</h2>
            <p>
              O controlador dos dados pessoais tratados por este sistema é{" "}
              <strong>ADRIEL WELLINGTON RODRIGUES</strong>, inscrito no CNPJ nº{" "}
              <strong>53.325.011/0001-08</strong>, operador do
              ServiçoOS.
            </p>
          </section>

          <section>
            <h2>2. Quais dados coletamos</h2>
            <p><strong>Dados de cadastro do usuário e da empresa:</strong></p>
            <ul>
              <li>Nome, e-mail e senha (armazenada de forma criptografada, nunca em texto puro);</li>
              <li>Telefone, CPF/CNPJ e endereço da empresa (quando informados);</li>
              <li>Dados fiscais para emissão de nota fiscal (CNPJ, inscrição municipal, alíquota de ISS).</li>
            </ul>
            <p><strong>Dados inseridos pelo usuário no uso do sistema:</strong></p>
            <ul>
              <li>Cadastro de clientes, prestadores e técnicos (nome, contato, endereço, documento);</li>
              <li>Ordens de serviço, orçamentos, anexos, fotos e assinaturas digitais de clientes;</li>
              <li>Dados financeiros (receitas, despesas, recibos);</li>
              <li>Localização geográfica (GPS) de técnicos, coletada durante o expediente para exibição
                no mapa de acompanhamento de ordens de serviço;</li>
              <li>Mensagens e número de telefone utilizados na integração com WhatsApp, quando ativada.</li>
            </ul>
            <p><strong>Dados coletados automaticamente:</strong></p>
            <ul>
              <li>Cookies essenciais de sessão/autenticação (não utilizamos cookies de rastreamento
                publicitário);</li>
              <li>Registros técnicos de acesso (endereço IP, data e hora, páginas acessadas), para fins de
                segurança e diagnóstico.</li>
            </ul>
          </section>

          <section>
            <h2>3. Para que usamos os dados</h2>
            <p>Utilizamos os dados coletados para as seguintes finalidades:</p>
            <ul>
              <li>Viabilizar o funcionamento do sistema e das funcionalidades contratadas (execução de
                contrato);</li>
              <li>Autenticar o acesso e proteger contas contra uso não autorizado;</li>
              <li>Processar pagamentos e emitir cobranças e notas fiscais;</li>
              <li>Enviar comunicações operacionais (confirmação de cadastro, cobrança, expiração de teste,
                convites de equipe) e, quando aplicável, pesquisas de satisfação (NPS);</li>
              <li>Exibir a localização de técnicos em campo para o proprietário/administrador da empresa
                contratante, exclusivamente durante o uso do sistema;</li>
              <li>Cumprir obrigações legais e regulatórias, incluindo fiscais e contábeis;</li>
              <li>Prevenir fraudes e garantir a segurança da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2>4. Com quem compartilhamos os dados</h2>
            <p>
              Não vendemos dados pessoais. Compartilhamos dados estritamente necessários com prestadores de
              serviço (operadores) que nos ajudam a viabilizar o ServiçoOS:
            </p>
            <table>
              <thead>
                <tr><th>Serviço</th><th>Finalidade</th></tr>
              </thead>
              <tbody>
                <tr><td>Supabase</td><td>Autenticação de usuários e banco de dados</td></tr>
                <tr><td>Vercel</td><td>Hospedagem da aplicação</td></tr>
                <tr><td>Asaas</td><td>Processamento de pagamentos (PIX, boleto, cartão)</td></tr>
                <tr><td>nfe.io</td><td>Emissão de notas fiscais de serviço eletrônicas (NFS-e)</td></tr>
                <tr><td>Resend</td><td>Envio de e-mails transacionais</td></tr>
                <tr><td>Z-API</td><td>Integração de mensagens via WhatsApp (quando ativada pela empresa)</td></tr>
              </tbody>
            </table>
            <p>
              Também podemos compartilhar dados quando exigido por lei, ordem judicial ou para proteger
              direitos, segurança ou propriedade do ServiçoOS ou de terceiros.
            </p>
          </section>

          <section>
            <h2>5. Transferência internacional de dados</h2>
            <p>
              Nossa infraestrutura principal (banco de dados e hospedagem) está localizada em data centers
              na região de São Paulo, Brasil. Alguns operadores listados na seção 4 são empresas
              internacionais que podem processar dados em outros países como parte de sua operação global.
              Nesses casos, buscamos utilizar operadores com práticas de proteção de dados compatíveis com a
              LGPD.
            </p>
          </section>

          <section>
            <h2>6. Por quanto tempo guardamos os dados</h2>
            <p>
              Mantemos os dados enquanto sua conta estiver ativa. Dados fiscais e financeiros podem ser
              retidos por período adicional para cumprimento de obrigações legais (em geral, 5 anos,
              conforme legislação fiscal brasileira). Após o encerramento da conta e decorridos os prazos
              legais de retenção, os dados são eliminados ou anonimizados.
            </p>
          </section>

          <section>
            <h2>7. Seus direitos como titular de dados</h2>
            <p>Nos termos do art. 18 da LGPD, você tem direito a:</p>
            <ul>
              <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade
                com a lei;</li>
              <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
              <li>Eliminação dos dados tratados com consentimento (exceto hipóteses de retenção legal);</li>
              <li>Informação sobre entidades com as quais os dados foram compartilhados;</li>
              <li>Revogação do consentimento, quando aplicável;</li>
              <li>Revisão de decisões tomadas unicamente com base em tratamento automatizado.</li>
            </ul>
          </section>

          <section>
            <h2>8. Como exercer seus direitos</h2>
            <p>
              Para exercer qualquer um desses direitos, entre em contato pelo e-mail{" "}
              <a href="mailto:olisuporte1@gmail.com" className="text-primary underline underline-offset-2">
                olisuporte1@gmail.com
              </a>{" "}
              — este é também o canal do encarregado de dados (DPO) do ServiçoOS. Responderemos dentro de um
              prazo razoável, conforme previsto na LGPD.
            </p>
          </section>

          <section>
            <h2>9. Segurança da informação</h2>
            <p>
              Adotamos medidas técnicas e administrativas para proteger os dados pessoais, incluindo senhas
              criptografadas, conexões seguras (HTTPS/TLS), controle de acesso por permissão e isolamento de
              dados entre empresas (tenants) distintas. Apesar dos esforços, nenhum sistema é 100% imune a
              incidentes — em caso de incidente de segurança relevante, notificaremos os titulares e a
              autoridade competente conforme exigido pela LGPD.
            </p>
          </section>

          <section>
            <h2>10. Cookies</h2>
            <p>
              Utilizamos apenas cookies essenciais, necessários para manter sua sessão autenticada e
              garantir o funcionamento do sistema. Não utilizamos cookies de rastreamento publicitário ou de
              redes sociais.
            </p>
          </section>

          <section>
            <h2>11. Dados de menores</h2>
            <p>
              O ServiçoOS é uma ferramenta de uso profissional/empresarial e não é direcionada a menores de
              idade. Não coletamos intencionalmente dados de crianças ou adolescentes.
            </p>
          </section>

          <section>
            <h2>12. Alterações nesta política</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. Alterações materiais serão
              comunicadas por e-mail ou aviso no sistema, com atualização da data no topo desta página.
            </p>
          </section>

          <section>
            <h2>13. Encarregado de dados (DPO)</h2>
            <p>
              Para todos os assuntos relacionados à proteção de dados pessoais, o encarregado de dados pode
              ser contatado pelo e-mail{" "}
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
