# Plano de Marketing — ServiçoOS

> Última atualização: 20/07/2026
> Contexto assumido: orçamento zero/quase zero (100% orgânico), sem foco em um nicho único (anunciar para todos os segmentos que o sistema já atende), já existem clientes piloto/beta usando o produto.
> Este documento é a referência viva da estratégia de aquisição. Atualizar sempre que um canal for testado (o que funcionou / o que não funcionou).

---

## 0. Prioridade #1 (fazer antes de qualquer divulgação): consertar a prova social da landing page

A landing page (`app/src/app/page.tsx`) já está com uma estrutura boa — hero claro, dor→solução, "como funciona", grid de features, planos, FAQ. O problema é que parte da prova social **é fictícia**:

| O quê | Onde | Problema |
|---|---|---|
| 3 depoimentos ("Carlos S.", "Ana P.", "Marcos R.") | `page.tsx:36-40` | Dados de exemplo, não são clientes reais |
| "Mais de 50 empresas já gerenciam seus serviços" | `page.tsx:127` | Claim específica e verificável — se não for verdade, é publicidade enganosa (Código de Defesa do Consumidor) |
| Botão flutuante do WhatsApp | `page.tsx:371` | Aponta para `5511999999999` (placeholder) — quem clicar não fala com ninguém |

**Por que isso é a prioridade #1 e não um item qualquer do backlog:** é a correção de maior impacto de todo esse plano, custa zero, leva menos de um dia, e reduz um risco jurídico real — não é só "ficar mais bonito". Além disso, você já tem clientes piloto (confirmado), então dá pra resolver com dado real imediatamente:

1. **Trocar os 3 depoimentos por depoimentos reais dos pilotos.** Peça um texto curto (2-3 frases) para 3-5 clientes piloto — pode ser por WhatsApp mesmo, transcrevendo a resposta. Se algum topar gravar 20-30s de vídeo pelo celular, melhor ainda (vídeo curto na seção de depoimentos converte muito mais que texto).
2. **Trocar "mais de 50 empresas" por um número real, ou por uma prova que não dependa de contagem** (ex.: nota média de NPS dos pilotos, "aprovado por quem testou", etc.) até o número real justificar a frase.
3. **Trocar o número do WhatsApp** pelo número comercial real antes de divulgar o link em qualquer canal.

---

## 1. Posicionamento

**Mensagem central (já está boa no hero, manter):** *"Chega de controlar OS pelo WhatsApp e planilha."*

A dor não é "falta de sistema" — é que o dono já tenta se organizar com WhatsApp, Excel e papel, e isso quebra em algum ponto do ciclo (esquece OS, perde papel, não sabe se está tendo lucro, demora pra emitir nota). O ServiçoOS não compete com "nenhum sistema", compete com **caderno, planilha e grupo de WhatsApp** — é esse o adversário em toda a comunicação, não outro SaaS.

Ângulo secundário forte (menos explorado hoje): **"do orçamento à nota fiscal, sem sair do sistema"** — a maioria das ferramentas do segmento resolve só um pedaço (só OS, só financeiro, só orçamento). Cobrir o ciclo completo (orçamento → aprovação online → OS → execução com assinatura → financeiro → NFS-e) é o diferencial mais defensável e mais difícil de copiar rápido.

---

## 2. Público-alvo

Empresas de serviço pequenas (dono + 1 a ~10 técnicos) que hoje operam de forma manual: desentupidora, assistência técnica (eletrônicos/eletrodomésticos), elétrica, refrigeração/climatização, e correlatos (chaveiro, dedetização, manutenção predial, jardinagem, etc.).

Traço comum, independente do segmento: **quem decide é o próprio dono**, não é uma pessoa técnica, e o processo atual é WhatsApp + Excel/papel. A mensagem deve falar com esse dono, não com "gestores de TI".

Como a decisão foi não focar em 1 nicho agora, a landing e os canais gerais ficam amplos — mas o **conteúdo** (posts, vídeos) pode e deve variar o exemplo por segmento (ideias na seção 8), porque exemplo específico converte mais que "empresa de serviço" genérico, mesmo dentro de uma campanha ampla.

---

## 3. Canais de aquisição com orçamento zero, em ordem de prioridade

### 3.1 Ativar os pilotos atuais (semana 1 — maior retorno, custo zero)
Já são clientes reais usando o produto. Antes de buscar cliente novo, extrair valor de quem já está dentro:
- Pedir depoimento (ver seção 0)
- Pedir avaliação — o sistema já tem NPS embutido (`sendNpsEmail`, disparado automaticamente após OS concluída); conferir se os pilotos estão recebendo e respondendo
- Ativar indicação ativamente (ver seção 4) — não esperar o piloto lembrar sozinho, pedir direto

### 3.2 Grupos e comunidades de nicho (WhatsApp / Facebook)
No Brasil existem muitos grupos regionais e por categoria (ex.: "assistência técnica SP", "eletricistas autônomos", "desentupidora RJ", "refrigeração e climatização"). Estratégia:
- Entrar e **ajudar de verdade** antes de vender — responder dúvida, compartilhar dica
- Mencionar o sistema só quando genuinamente relevante à conversa ("uso uma ferramenta que resolve isso, te mostro se quiser")
- Divulgação direta costuma levar a ban nesses grupos — o soft-touch é o que funciona a médio prazo

### 3.3 Conteúdo + SEO
O básico de SEO técnico já está implementado (`robots.ts`, `sitemap.ts` — roadmap item #3). Falta o conteúdo em si. Prioridade: palavras-chave de **dor**, não de produto — quem busca isso ainda não sabe que "sistema de OS" existe:
- "como organizar ordem de serviço sem perder papel"
- "como emitir NFS-e sendo MEI / prestador de serviço"
- "planilha de controle de ordem de serviço" (oferecer o template grátis + o sistema como próximo passo natural)
- "quanto cobrar de visita técnica"

Ritmo sustentável sozinho: 1 post/semana, cada um terminando com CTA para criar conta e assinar.

### 3.4 Redes sociais visuais (Reels / TikTok / YouTube Shorts)
Ferramenta B2B pequena converte bem com conteúdo de "bastidor do produto", não com conteúdo institucional:
- Tela do mapa GPS ao vivo mostrando técnico se movendo
- Criação de uma OS do zero em 30 segundos
- PDF sendo gerado e mandado automaticamente pro cliente
- Antes/depois: caderno de anotações vs. sistema

Produção baixa: gravação de tela + voz é suficiente, não precisa de equipamento.

### 3.5 Prospecção direta (outreach pessoal)
Sem orçamento, isso é trabalho manual, mas é o canal mais controlável no curto prazo:
- Buscar prestadores no Google Maps / Instagram comercial dentro dos segmentos atendidos
- Mensagem pessoal (não copiar e colar o mesmo texto pra todo mundo), se propondo a ajudar a configurar a conta na primeira semana
- Meta sugerida: 10-15 contatos/dia — é pouco por dia, mas sustentável, e onboarding assistido nessa fase inicial aumenta muito a conversão de cadastro em assinatura paga

### 3.6 Parcerias sem concorrência direta
- **Contadores** que atendem MEI/pequenas empresas de serviço — veem a dor de nota fiscal e financeiro bagunçado o tempo todo, e não competem com o produto
- Distribuidores/fornecedores de peças e insumos dos segmentos-alvo (elétrica, refrigeração) — têm relação direta com a base de clientes
- Associações comerciais locais

---

## 4. Programa de indicação (já existe no produto — usar ativamente)

Mecânica real, conferida no código (`actions/referral.ts`, `api/referral/join/route.ts`, webhook do Asaas):
- Cada tenant tem um código de indicação único
- Quem se cadastra com um código válido ganha **10% de desconto** no primeiro pagamento
- Quem indicou ganha **20% de desconto** (acumulável, até 100%) para cada indicado que **converter para pago**

> Atualizado: o produto não tem mais período de teste gratuito (ver nota abaixo) — o programa de indicação foi redesenhado de "dias extra de trial" para desconto percentual, já que não existe mais trial pra estender.

Isso é um motor de crescimento viral B2B pronto, só não está sendo ativado proativamente. Ação: mandar mensagem direta pra cada piloto com o link/código pessoal deles, explicando o benefício em termos concretos ("cada empresa que você indicar e virar cliente pagante te dá 20% de desconto").

---

## 5. Oferta e funil

> **Atualizado:** o produto deixou de ter período de teste gratuito — agora é preciso assinar um plano (boleto ou cartão) para usar o sistema. Os pontos abaixo foram ajustados; ver também a seção 0 e o FAQ da landing page.

- CTA principal: criar conta e assinar — aceita boleto ou cartão via Asaas, cancelamento sem multa a qualquer momento. Manter isso em destaque em todo canal
- Considerar um **"programa fundador"** por tempo limitado: condição especial (desconto vitalício ou meses grátis) para os primeiros N clientes pagantes pós-lançamento, em troca de feedback ativo + autorização para usar como case público. Gera urgência genuína e alimenta o banco de depoimentos/conteúdo
- Onboarding assistido (concierge) para os clientes vindos de prospecção direta — maior alavanca de conversão cadastro → assinatura paga nessa fase inicial, mesmo não sendo escalável

---

## 6. Cronograma sugerido — 6 semanas

| Semana | Foco |
|---|---|
| 1 | Prioridade #0 (depoimentos reais, número de WhatsApp, claim de "50 empresas"). Ativar indicação com os pilotos atuais. |
| 1-2 | Primeiro post de blog. Entrar nos primeiros grupos de nicho. |
| 2-3 | Começar prospecção direta (10-15 contatos/dia). Primeiros Reels/vídeos curtos. |
| 3-4 | 2º e 3º post de blog. Medir o que está gerando cadastro (pergunta manual "como você conheceu a gente?" no cadastro, já que não há orçamento pra UTM pago). Dobrar no canal que estiver funcionando. |
| 4-6 | Lançar o "programa fundador" com prazo definido. Ativar parcerias com contadores/fornecedores. |

---

## 7. Métricas para acompanhar

- Cadastros iniciados por semana, e origem de cada um (perguntar no cadastro ou em conversa — sem orçamento pago não há UTM automático, então isso precisa ser coletado manualmente no começo)
- Taxa de conversão cadastro → assinatura paga
- Número de indicações geradas e convertidas
- NPS médio dos pilotos (já é coletado pelo sistema)
- Churn dos primeiros clientes pagantes

---

## 8. Banco de pautas de conteúdo (ponto de partida)

Gerais (qualquer segmento):
- "5 sinais de que sua empresa de serviço precisa sair do caderno"
- "Planilha de controle de OS grátis" (lead magnet + CTA pro sistema)
- "Como emitir NFS-e sendo prestador de serviço"

Por segmento (mesmo sem campanha focada em 1 nicho, o exemplo específico converte mais):
- Desentupidora / hidráulica: urgência do chamado + mapa GPS pra saber qual técnico está mais perto
- Assistência técnica: orçamento com aprovação online do cliente antes de mexer no aparelho, histórico do equipamento
- Elétrica / refrigeração: manutenção preventiva recorrente (módulo de manutenção interna)

---

## 9. Fora do escopo deste plano, mas vale registrar

- O "0 orçamento" é o ponto de partida — se algum canal orgânico mostrar tração clara (ex.: um post de blog trazendo cadastros de forma consistente), vale reavaliar investir um valor pequeno em impulsionar especificamente esse conteúdo, em vez de abrir uma frente paga nova do zero.
- Pesquisa de concorrentes brasileiros (Operand, Moskit, Movidesk e afins) não foi feita a fundo neste plano — se for útil, dá pra rodar uma pesquisa dedicada depois pra refinar o posicionamento competitivo.
