# Plano de Engenharia — ServiçoOS

> Última atualização: 08/08/2026
> Este documento é a referência técnica viva do projeto. Deve ser atualizado sempre que uma decisão de arquitetura importante for tomada.

---

## 1. Visão geral do produto

**ServiçoOS** é um SaaS de gestão para pequenas e médias empresas prestadoras de serviço (desentupidoras, assistências técnicas, elétrica, refrigeração, etc.) no mercado brasileiro.

**Proposta de valor:** substituir o controle manual via WhatsApp/planilha/papel por um sistema único que cobre todo o ciclo — orçamento, ordem de serviço, execução em campo, financeiro e nota fiscal.

**Modelo de negócio:** SaaS multi-tenant por assinatura, 3 planos pagos (Starter/Pro/Enterprise) cobrados via Asaas. **Sem trial gratuito** — cadastro não dá acesso; é preciso assinar (boleto ou cartão) para usar o sistema (ver seção 1.1).

### 1.1 Mudança de modelo: fim do trial gratuito (21/07/2026)

Decisão de produto: o trial gratuito de 15 dias foi removido. Cadastro não dá mais acesso — o tenant nasce bloqueado e só libera com uma assinatura `ACTIVE` confirmada pelo webhook do Asaas. Vale pra todo mundo, inclusive os clientes piloto que já estavam usando de graça (decisão explícita, não descuido).

**Gating simplificado** (`(dashboard)/layout.tsx`): de "trial dentro do prazo, não cancelado, não inadimplente" pra só `subscriptionStatus === ACTIVE`. Única exceção: `PAST_DUE` (falha numa renovação) ganha 3 dias de carência antes de bloquear de vez, reaproveitando o `currentPeriodEnd` que já existia na `Subscription` (sem campo novo) — evita perder cliente por uma falha pontual de cobrança que uma nova tentativa resolveria. `TRIAL` (nunca assinou), `PENDING` (aguardando confirmação) e `CANCELLED` bloqueiam na hora, sem carência. `/billing` continua acessível pra um tenant bloqueado poder se pagar e se desbloquear sozinho.

**Programa de indicação redesenhado.** O bônus antigo ("dias extra de trial") nunca tinha sido de fato aplicado em lugar nenhum — `extraDaysEarned` era só um número calculado (`converted * 30`) pra mostrar na tela do `/referral`, sem nenhum trigger real que estendesse o trial de ninguém. Sem trial pra estender, virou um campo `referralDiscountPercent` de verdade no `Tenant`: quem indica ganha 20% (acumulável, até 100%) por indicado convertido — creditado no webhook do Asaas, na primeira confirmação de pagamento de cada indicado (não em renovações); quem se cadastra com código ganha 10% no primeiro pagamento. Aplicado ao preço e consumido (zerado) dentro de `subscribeToPlan`.

**Limpeza decorrente:** banner de contagem regressiva do trial (removido, tinha virado código morto), stats/alerta de "trial expirando" no `/admin`, os 2 blocos do cron diário que buscavam trial expirando em 3/1 dias (nunca mais achariam nada), e-mail de trial expirando (sem chamador depois disso, removido), e-mail de onboarding do dia 3 (linkava pra `/service-orders/new` — quem não assinou não acessa mais essa rota; reescrito pra apontar pra `/billing`), e todos os textos de "15 dias grátis sem cartão" na landing page, registro e plano de marketing.

**Pendência que tinha virado ainda mais crítica, resolvida em 21/07/2026:** `ASAAS_WEBHOOK_SECRET` estava sem configurar no Asaas/Vercel (seção 7.1) — sem isso, ninguém seria liberado depois de pagar, o único caminho de entrada no sistema inteiro. Configurado e verificado (ver seção 7.1).

---

## 2. Stack tecnológico

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.9 |
| UI runtime | React | 19.2.4 |
| Linguagem | TypeScript | ^5 |
| Estilo | Tailwind CSS | v4 |
| Componentes | shadcn/ui sobre `@base-ui/react` | — |
| ORM | Prisma (`@prisma/adapter-pg`) | ^7.8.0 |
| Banco de dados | PostgreSQL (Supabase) | — |
| Autenticação | Supabase Auth (`@supabase/ssr`) | — |
| Formulários | react-hook-form + zod | ^7.78 / ^4.4 |
| Gráficos | recharts | ^3.8 |
| PDF | @react-pdf/renderer | ^4.5 |
| Push notifications | web-push (VAPID) | ^3.6 |
| E-mail transacional | Resend | ^6.16 |
| Monitoramento de erros | Sentry (`@sentry/nextjs`) | — |
| Pagamentos | Asaas (gateway BR) | API v3 |
| Nota fiscal | nfe.io | API |
| Hospedagem | Vercel (região `gru1` — São Paulo) | — |

**Nota importante sobre esta versão do Next.js:** o arquivo de middleware se chama `proxy.ts` (não `middleware.ts`) e exporta uma função `proxy`, não `middleware` — convenção mudou na v16. Ver `AGENTS.md` no repo.

---

## 3. Arquitetura

```
Cliente (navegador/PWA)
        │
        ▼
  Vercel Edge (gru1 — São Paulo)
   ├─ proxy.ts (auth guard + injeta header x-pathname)
   ├─ Server Components / Server Actions
   └─ API Routes (webhooks, cron, PDF, push)
        │
        ├──► Supabase (Postgres + Auth) — sa-east-1, mesma região da Vercel
        ├──► Asaas (pagamentos, boleto/cartão)
        ├──► Resend (e-mails transacionais)
        ├──► nfe.io (emissão de NFS-e)
        ├──► Sentry (erros, source maps)
        └──► Z-API (WhatsApp — integração parcial, ver seção 9)
```

**Decisão de região:** funções da Vercel rodam propositalmente em `gru1` (São Paulo), mesma região do banco Supabase (`sa-east-1`). Antes disso as funções rodavam em `iad1` (EUA), causando latência real e perceptível em toda navegação — cada clique fazia idas e voltas transatlânticas ao banco. Corrigido e confirmado como ganho real de performance.

**Multi-tenancy:** isolamento lógico por `tenantId` em todas as tabelas (não há isolamento físico/schema por cliente). Todo acesso a dados passa por `getTenant()`, que resolve o tenant do usuário autenticado.

---

## 4. Modelo de dados

21 modelos Prisma, organizados em 4 domínios:

**Conta e cobrança:** `Tenant`, `User`, `UserAddress`, `Plan`, `Subscription`, `TabPermission`

**Operação (CRM/OS):** `Client`, `Address`, `ServiceOrder`, `ChecklistItem`, `ServiceItem`, `Attachment`, `Quote`, `Equipment`

**Financeiro:** `Revenue`, `Expense`

**Prestadores/manutenção interna:** `Provider`, `MaintenanceOrder`, `MaintenanceItem`

**Infra de app:** `PushSubscription`, `UserLocation`

---

## 5. Módulos funcionais implementados

| Módulo | Rota | Observação |
|---|---|---|
| Landing page pública | `/` | Hero, dores, como funciona, features, planos, FAQ |
| Cadastro / Login | `/register`, `/login` | Supabase Auth |
| Recuperação de senha | `/forgot-password`, `/reset-password` | Via `generate_link` do Supabase (não `/admin/invite`, descontinuado) |
| Dashboard | `/dashboard` | KPIs, gráfico de receita, OS ativas |
| CRM de Clientes | `/clients` | CRUD, busca, status |
| Orçamentos | `/quotes` | PDF, link de aprovação pública (`/q/[token]`) |
| Ordens de Serviço | `/service-orders` | PDF, checklist, assinatura digital, GPS, NFS-e |
| Histórico | `/history` | OS concluídas/faturadas |
| Manutenção interna | `/maintenance` | Frota/equipamentos próprios |
| Prestadores | `/providers` | Terceirizados |
| Recibos | `/receipts` | Gerados após pagamento |
| Agendamento | `/schedule` | Calendário mensal |
| Financeiro | `/finance` | Receitas/despesas, alertas de vencimento |
| Relatórios | `/reports` | DRE, top clientes, OS por status/período |
| Equipe | `/team` | Convite por e-mail, RBAC (Owner/Admin/Técnico) |
| Mapa GPS | `/map` | Localização de técnicos em tempo real |
| Assinatura/Billing | `/billing` | Asaas, redireciona pro checkout hospedado |
| Indicação (referral) | `/referral` | Link único, desconto percentual (não mais dias de trial — ver seção 1.1) |
| Painel admin | `/admin` | Visão de todos os tenants, MRR (acesso restrito ao dono) |
| Configurações | `/settings`, `/settings/fiscal`, `/settings/permissions` | Dados da empresa, config fiscal (NFS-e), RBAC por aba |
| Bloqueio de acesso | `/expired` | Bloqueia tudo exceto `/billing` — cobre "nunca assinou", pagamento em confirmação, cancelado e inadimplente |
| Termos e Privacidade | `/terms`, `/privacy` | LGPD |
| Busca na sidebar | — | Filtra abas por nome |

**E-mails automáticos (via cron diário, 09h BRT):** boas-vindas (aponta pra escolher um plano, não mais "seu teste começa agora"), lembrete no dia 3 pra quem se cadastrou e ainda não assinou, pagamento confirmado, convite de equipe, recuperação de senha, NPS pós-OS concluída.

---

## 6. Integrações externas

| Serviço | Uso | Observação |
|---|---|---|
| Supabase | Auth + Postgres | `sa-east-1`, mesma região das funções |
| Asaas | Cobrança recorrente | `billingType: UNDEFINED` (PIX não é permitido para assinaturas nesta conta — só boleto/cartão). Webhook autenticado por `ASAAS_WEBHOOK_SECRET` (header `asaas-access-token` — ver seção 7.1) |
| Resend | E-mail transacional | Todos os e-mails do sistema |
| Sentry | Monitoramento de erros | Captura server+client, source maps via `SENTRY_AUTH_TOKEN` |
| nfe.io | Emissão de NFS-e | Configurado por tenant em `/settings/fiscal` |
| Z-API | WhatsApp | **Parcial** — campos `zapiInstance`/`zapiToken` existem no schema, botão de envio existe, mas a instância nunca foi configurada de ponta a ponta (ver roadmap) |

---

## 7. Segurança e conformidade

- Autenticação via Supabase, sessão em cookie, verificada em `proxy.ts` a cada requisição
- RBAC por `role` (OWNER/ADMIN/TECHNICIAN) + `TabPermission` para customizar abas de técnicos — aplicado tanto na UI (abas/seções visíveis) quanto no servidor (Server Actions e rotas sensíveis validam `role` de novo, não confiam só na UI escondida)
- Painel `/admin` restrito por e-mail hardcoded (dono do sistema)
- Chave do Asaas armazenada em base64 na env var (não em texto puro — ver seção 9)
- Webhook do Asaas autenticado por header `asaas-access-token` contra `ASAAS_WEBHOOK_SECRET` (mesmo padrão do webhook do Supabase, que já usava `x-webhook-secret`)
- Termos de Uso e Política de Privacidade publicados, com aceite obrigatório no cadastro
- Rate limiting em login/cadastro/recuperação de senha (por IP e por e-mail, Postgres) — login/cadastro passaram a chamar o Supabase Auth via Server Action em vez de direto do browser, já que um rate limit só numa rota nossa não protegia nada enquanto a chamada real ia direto pra API do Supabase
- Exportação self-service de dados (LGPD art. 18) em Configurações, restrita a OWNER

### 7.1 Auditoria de segurança — 19/07/2026

Revisão completa do app: 5 frentes paralelas (auth/sessão, pagamentos/webhooks, isolamento entre tenants, rotas públicas, PDF/integrações) e cada achado verificado de forma adversarial e independente antes de virar correção. 14 vulnerabilidades confirmadas — nenhum falso positivo. Todas corrigidas no commit `4039c67`.

**Críticas:**

| Achado | Correção |
|---|---|
| `getTenant()` confiava em `user.user_metadata.tenantId`/`role` do Supabase (editável pelo próprio usuário via SDK client-side) para decidir tenant/papel no primeiro login — permitia se declarar OWNER de qualquer tenant, inclusive reentrar num tenant após ser removido | Primeiro login sempre cria tenant novo; nunca mais junta a um tenant existente via metadata. `removeTeamMember` limpa o metadata no Supabase ao remover alguém (defesa extra) |
| Webhook do Asaas processava `PAYMENT_RECEIVED`/`SUBSCRIPTION_DELETED`/etc. sem verificar origem — qualquer um podia forjar eventos | Exige header `asaas-access-token` batendo com `ASAAS_WEBHOOK_SECRET` |
| `subscribeToPlan` marcava a assinatura `ACTIVE` (acesso pago completo) antes de qualquer pagamento confirmado | Novo estado `PENDING` no enum `SubscriptionStatus`; só o webhook, ao confirmar pagamento real, marca `ACTIVE` |

**Escalação de privilégio / RBAC:**
- `updateTeamMemberRole` só validava o papel em compile-time (ADMIN podia se auto-promover a OWNER) → validação em runtime + bloqueio de alterar quem já é OWNER
- `/settings` (dados da empresa + WhatsApp) e `/finance` sem checagem de papel nenhuma — technician via até o token do WhatsApp em texto puro → ambos exigem OWNER/ADMIN, no servidor e na UI
- `deleteClient` e as mutações de `providers`/`maintenance orders` sem checagem de papel → exigem OWNER/ADMIN

**Isolamento entre tenants (multi-tenancy):**
- `updateServiceOrder` apagava/recriava itens da OS antes de validar que ela pertencia ao tenant do usuário → validação de posse roda antes, tudo dentro de uma transação
- `clientId`/`technicianId` (ordens de serviço) e `providerId` (manutenção) aceitos sem checar se pertenciam ao tenant do usuário — inclusive a notificação push de atribuição de OS, que buscava inscrições por `userId` sem nenhum filtro de tenant → todos validados contra o tenant antes de usar
- XSS armazenado nos popups do mapa GPS (Leaflet `bindPopup()` usa `innerHTML`) — nome de cliente/OS/técnico entravam sem escapar → todos os campos de usuário escapados antes de montar o popup

**Outros:**
- `/api/referral/join` sem sessão e sem idempotência — permitia estender o trial indefinidamente → exige sessão (tenant vem dela, nunca do corpo da requisição) e é idempotente
- `/api/nps` e `/api/quote-approval` autenticavam só pelo `id` bruto do registro (que vaza em URLs internas do dashboard) em vez do `clientToken` do link público → exigem o `clientToken`
- `/api/push/subscribe` aceitava qualquer endpoint sem validar o host (SSRF cego via `web-push`) → allowlist de hosts de push reais (FCM, Mozilla, Apple, Windows)
- `/api/auth/callback`: open redirect via truque de userinfo na URL (`next=@evil.com/x`) → `next` validado como caminho relativo simples

**Pendências — ação manual fora do código (resolvidas em 21/07/2026):**
- ~~Configurar `ASAAS_WEBHOOK_SECRET` no dashboard do Asaas~~ — feito
- ~~Adicionar `ASAAS_WEBHOOK_SECRET` nas env vars de produção da Vercel~~ — feito via `vercel env add` + redeploy. Verificado em produção: `POST /api/webhooks/asaas` sem o header retorna 401, com o token correto retorna 200

### 7.1.1 Domínio próprio e e-mail transacional — 05/08/2026

O sistema rodava em `app-olive-six-67.vercel.app`. Descoberto ao investigar
"e-mail de recuperação de senha não chega": o Resend nunca conseguiu enviar
nenhum e-mail do sistema (boas-vindas, convite, pagamento, NPS, recuperação de
senha) desde sempre — 403 "domain is not verified", porque um subdomínio
`*.vercel.app` pertence à Vercel e nunca pode ser verificado como domínio de
envio. Comprado `servicoos.com.br` (registro.br), configurado DNS (DKIM +
MX/SPF do Resend, A record pra Vercel) e migrado `NEXT_PUBLIC_APP_URL` e todos
os 8 fallbacks hardcoded no código. E-mail confirmado funcionando (envio de
teste real via API do Resend).

**Certificado SSL não emitido automaticamente.** Depois do DNS propagado
corretamente (`nslookup` confirmando o A record), o site novo continuou de
fora por ~7 horas — `vercel certs ls` mostrava "No certificates found", ou
seja, a Vercel nunca sequer tentou emitir o certificado sozinha (não é só
demora normal). Resolvido forçando na mão: `vercel certs issue <domínio>`.

### 7.2 Segunda auditoria de segurança — 20/07/2026

Pedido explícito de reverificar tudo depois da 7.1. Metodologia: 6 revisões paralelas (4 focadas em atacar adversarialmente as próprias correções da 7.1, 2 fazendo varredura fresca no resto do app) + verificação adversarial independente por achado. 12 vulnerabilidades novas confirmadas — nenhuma sobreposta com a 7.1, nenhuma refutada. Corrigidas no commit `2dfe2a1`.

**Altas:**

| Achado | Correção |
|---|---|
| `billing.ts` (`subscribeToPlan`/`cancelSubscription`) sem checagem de papel — qualquer technician cancelava a assinatura paga da empresa toda navegando direto pra `/billing` | Guard OWNER/ADMIN em ambas |
| `cancelSubscription()` marcava o tenant `CANCELLED` incondicionalmente (mesmo sem assinatura ativa) e engolia falhas do cancelamento no Asaas em silêncio | Só marca `CANCELLED` se achou e cancelou de verdade; loga falha e mostra erro em vez de fingir sucesso |
| `nfse.ts` (`emitNfse`/`registerFiscalCompany`) sem checagem de papel — technician emitia NFS-e real (e a função de cancelar nota existe na lib mas nunca é chamada em lugar nenhum) | `emitNfse` exige OWNER/ADMIN; `registerFiscalCompany` exige OWNER (mesma restrição já aplicada à página) |
| `quotes.ts` sem checagem de papel — technician deletava ou forjava aprovação de qualquer orçamento | Guard OWNER/ADMIN em create/update/status/delete |
| SSRF via URL do logo da empresa — `@react-pdf/renderer` busca a URL no servidor a cada PDF gerado, sem validar host | Bloqueia IPs privados/loopback/link-local e exige `https`. Não cobre DNS rebinding (domínio que resolve pra IP público na validação e pra IP privado no fetch real) — mitigação completa exigiria buscar a imagem nós mesmos com IP pinning, fora do escopo desta correção |
| `/api/location/list` e `/api/location/orders` sem checagem de papel — a página `/map` já é OWNER/ADMIN-only, as APIs por trás não eram | Guard OWNER/ADMIN nas duas rotas |

**Médias:**
- Webhook do Asaas podia reativar (`PAYMENT_RECEIVED`) uma assinatura já `CANCELLED` via pagamento atrasado/duplicado, sobrescrevendo o plano do tenant → guard `sub.status !== "CANCELLED"` (PENDING/PAST_DUE → ACTIVE continuam permitidos)
- `getFinanceSummary` sem checagem de papel — o Action ID já existe registrado e é despachável pelo Next.js independente de quem importa a função hoje, então não dava pra confiar só no redirect da página → auto-defesa igual ao `getSettings()`
- `clients.ts`: `updateClient` sem checagem (permite marcar cliente como `DEFAULTER`); `createClient` ficou de fora da correção — technician cadastra cliente em campo, fluxo legítimo
- `equipment.ts`: `deleteEquipment` sem checagem nem confirmação; `createEquipment` ficou de fora — technician cadastra equipamento em campo

**Baixa:**
- Race condition no `/api/referral/join` (check-then-act, não atômico) → trocado por `updateMany` condicionado a `referredByCode: null`

**Não corrigido (decisão consciente, não esquecimento):** o bônus de indicação também é concedido via `user_metadata.ref_code` no cadastro (`/register?ref=CODE` → `auth.ts`), caminho totalmente separado do `/api/referral/join` e sem rate-limit. Mas o cadastro em si já não tem rate-limit/captcha nenhum independente de indicação — corrigir isso de verdade exigiria CAPTCHA ou redesenhar o mecanismo de indicação, uma decisão de produto, não um patch de segurança pontual.

**Lição arquitetural confirmada nesta rodada** (ver seção 9, item 12): toda função exportada de um arquivo `"use server"` vira um endpoint despachável pelo Next.js assim que é exportada — não quando alguém a chama do client. Um redirect na página que chama a função **não protege a função em si**. Cada Server Action sensível precisa se defender sozinha.

### 7.2.1 Incidente: primeira cliente pagante sem acesso — 07/08/2026

**Sintoma reportado:** cliente pagou (R$ 97, PIX, 06/08) e continuou vendo
"Aguardando confirmação do pagamento"; junto disso, "todas as abas do sistema
estão dando erro".

**Causa raiz (uma só, para os dois sintomas):** na migração de
`app-olive-six-67.vercel.app` para `servicoos.com.br` (seção 7.1.1) o código,
o DNS e as env vars foram atualizados, mas **a URL dos webhooks no painel da
Asaas não** — os dois webhooks continuaram apontando pro domínio antigo. Após
as falhas consecutivas a Asaas os marcou `"interrupted": true` e parou de
entregar. Sem o `PAYMENT_RECEIVED`, a `Subscription` ficou `PENDING`.

E `PENDING` **bloqueia todas as abas**: `(dashboard)/layout.tsx` redireciona
pra `/expired` tudo que não seja `/billing` ou `/settings`. Ou seja, uma falha
de webhook não se apresenta como "pagamento pendente" — se apresenta como
"o sistema inteiro quebrou", que foi exatamente como a cliente descreveu.

**Correções:**
1. Webhooks apontados pra `https://servicoos.com.br/api/webhooks/asaas`,
   `interrupted` limpo e `authToken` reconfigurado. Os dois eram duplicados
   com eventos sobrepostos (a Asaas rejeita URL igual com eventos iguais) —
   consolidados num só, com `SUBSCRIPTION_DELETED` incluído, e o segundo
   desativado.
2. Acesso da cliente liberado **reenviando o evento real pelo próprio
   webhook** (`pay_ulhdt0rtag3oafpc`) em vez de editar o banco na mão — assim
   a correção também serviu de teste de ponta a ponta do fluxo.
3. Rede de segurança no cron diário: reconcilia contra a Asaas qualquer
   `Subscription` `PENDING` cujo pagamento já esteja `RECEIVED`/`CONFIRMED`,
   loga o caso e ativa. Idempotente, mesmo caminho do webhook.

**Lição:** trocar de domínio exige uma varredura em **todos os serviços
externos que apontam de volta pra nós**, não só nos que nós chamamos. Nesta
migração o Resend foi lembrado (DKIM/SPF) e o Asaas não. Vale reler a lista de
integrações da seção 6 a cada troca de domínio. Pior ainda: um webhook morto é
**silencioso por natureza** — ninguém erra, nada loga, e o primeiro sinal é o
cliente reclamando. Daí a reconciliação diária.

**Erro de diagnóstico que custou tempo (registrar pra não repetir):** ao
investigar as "abas com erro" pelo navegador headless, todas apareciam presas
num esqueleto de carregamento, com o conteúdo real dentro de `<template>` sem
ser aplicado. Cheguei a fazer rollback de produção achando que era regressão
do i18n. Não era: o painel do navegador não estava sendo exibido, então a aba
**não compõe frames** e os scripts inline finais do streaming do React nunca
executam. O servidor estava saudável o tempo todo (18/18 abas em 200, 15
requisições concorrentes sem falha, em ambas as versões). **Antes de suspeitar
do código, confirmar o sintoma por um caminho que não dependa de renderização**
— `fetch()` do HTML e conferência de status/tamanho já teria descartado a
hipótese em um passo.

### 7.2.2 Capacidade medida e auditoria rodada 4 — 08/08/2026

**Capacidade (medida, não estimada).** Rajadas de requisições simultâneas em
produção, na landing (pública) e no `/dashboard` (autenticado, com sessão
real):

| Simultâneas | p50 | p95 | Falhas |
|---|---|---|---|
| 5 | 1378ms | 1729ms | 0 |
| 20 | 519ms | 1685ms | 0 |
| 40 | 477ms | 2328ms | 0 |
| 80 | 911ms | 2646ms | 0 |
| 120 | 1329ms | 1805ms | 0 |

Zero falhas até 120 requisições simultâneas. **Requisição simultânea ≠
usuário**: alguém usando o sistema dispara uma requisição a cada 10-30s, então
120 simultâneas correspondem a algo na casa de centenas de pessoas usando ao
mesmo tempo. O teto conhecido não é a aplicação: é `max_connections = 60` no
Postgres do Supabase (13 em uso em repouso). Como a conexão vai pelo pooler em
modo transação (porta 6543), que multiplexa, e cada instância da Vercel abre
só 1 conexão (`lib/prisma.ts`, `max: 1`), esse limite não foi alcançado nos
testes. **Ressalva honesta:** o teste saiu de um único cliente/IP; carga real
distribuída sobe mais instâncias na Vercel — provavelmente melhor, mas não
medido.

**Auditoria rodada 4.** Varredura sistemática das 47 Server Actions,
classificando cada uma por: é mutação? checa papel? checa assinatura? Dois
achados reais:

| Achado | Correção |
|---|---|
| O aviso de "link já usado" (adicionado horas antes, ver 7.2.3) viajava como **texto** na URL e era renderizado dentro da caixa de aviso oficial do login — qualquer um montaria `/login?error=<mensagem convincente>` e aplicaria um golpe com a cara do sistema | Passa um **código** (`invite_used`/`recovery_used`/`invalid_link`); a tela só reconhece esses três e ignora o resto |
| `getReferralInfo` sem checagem de papel — TECHNICIAN via o código de indicação e o saldo de desconto da empresa, e a função ainda **escreve** (gera o código na primeira leitura) | Exige OWNER/ADMIN, mesma régua de `/billing` e `/finance`; a página trata a recusa em vez de mostrar campo vazio |

Os demais casos sem checagem de papel foram confirmados como **intencionais e
documentados**: técnico precisa criar cliente, marcar checklist e concluir OS
em campo; `updateProfile` só altera o próprio usuário (`where: { id: userId }`).

**Nota sobre "blindar pra ninguém hackear":** não existe. O que dá pra fazer é
reduzir superfície e impacto — e é o que estas 4 rodadas fizeram. O ponto
frágil que permanece não é código: são credenciais (as chaves de serviço no
`.env`/Vercel) e o fato de `/admin` ser liberado por e-mail hardcoded.

### 7.2.3 Convidado caindo em "cadastrar nova empresa" — 08/08/2026

**Sintoma:** integrante de equipe convidado relatou receber "o link para
cadastrar uma nova empresa".

**O convite em si estava certo** — link, domínio e criação do `User` no tenant
correto, tudo verificado nos dados (o convidado inclusive aceitou e entrou com
sucesso: `invited_at` 01:13, `last_sign_in_at` 01:44, metadata com o
`tenantId` e papel certos).

**A falha é no segundo clique.** Links do Supabase são de **uso único**. Ao
reabrir o e-mail, `/api/auth/confirm` falha e redireciona pra
`/login?error=...` — só que **a tela de login nunca leu esse parâmetro**. O
convidado via uma tela de login limpa, sem explicação nenhuma, tendo
"Cadastrar empresa" como link mais visível. Daí criar empresa nova em vez de
entrar na do empregador.

Corrigido nos dois lados: a tela passou a exibir o aviso (`useSearchParams` +
Suspense) e a mensagem virou específica por tipo de link — a de convite manda
entrar ou usar "Esqueci minha senha" com o e-mail convidado, e desaconselha
explicitamente criar outra empresa.

**Lição:** redirecionar com uma mensagem de erro na query string não serve de
nada se a página de destino não a lê. Vale conferir o par (quem manda, quem
exibe) sempre que um fluxo de erro atravessa páginas — e preferir código a
texto livre, senão o parâmetro vira vetor de golpe (foi o achado 1 da 7.2.2).

### 7.2.4 OS sumindo do mapa e trabalho sumindo do dashboard — 10/08/2026

Dois relatos do usuário no mesmo dia, com a mesma raiz: **o sistema descartava
dado em silêncio em vez de mostrar o que sabia.**

**1. "As OS abertas e em andamento não aparecem no mapa."**

O mapa filtra por `client.address.latitude != null`. A geocodificação
(`lib/geocode.ts`, Nominatim/OpenStreetMap) rodava **uma tentativa só**, com o
endereço completo, e falha em silêncio (`catch {}` + `return null`). Qualquer
abreviação ou erro de digitação na rua derrubava a tentativa inteira — e o
cliente ficava sem coordenada **para sempre**, porque só criar/editar o cliente
dispara nova geocodificação.

Medido em produção: **4 dos 5 endereços cadastrados** estavam nesse estado.
Testado direto na API: `av abel fraancisco pereira, Piracicaba` → `[]`;
`avenida abel francisco pereira, Piracicaba` → acha na hora. Ou seja: a
abreviação "av" e um "fraancisco" bastavam.

Três correções:
- **Cascata** em `geocodeAddress()`: rua+número → rua → só cidade/estado, com
  abreviações brasileiras expandidas (`av`→`avenida`, `r`→`rua`, etc.). Pino
  aproximado no bairro certo é muito melhor que pino nenhum.
- **Backfill** no cron diário (lote de 10, orçamento de 25s, respeitando o
  limite de 1 req/s do Nominatim) — conserta o passivo sem ninguém mexer.
  Exigiu `maxDuration = 60` na rota.
- **Aviso na tela**: OS abertas cujo cliente não tem coordenada agora aparecem
  num bloco "N OS fora do mapa", com link direto pra editar o endereço. Antes
  elas não apareciam em lugar nenhum — nem no mapa, nem no contador.

Os 4 endereços foram corrigidos em produção na mesma sessão (5/5 com
coordenada). Um deles caiu no nível cidade por causa do "fraancisco".

**2. "OS concluídas também têm que aparecer no valor do dashboard, porque não
são todas as OSs [que] precisam ser faturadas."**

`Revenue` só nasce na transição pra `INVOICED` (`updateOrderStatus` e
`completeServiceOrder` com `invoiceImmediately`). Quem conclui o serviço,
recebe na hora e não emite nota deixa a OS em `DONE` — e o card "Faturado no
mês", que somava só `Revenue.status = PAID`, ignorava esse trabalho por
completo.

O card passou a somar `PAID` + total das OS `DONE` concluídas no mês, filtradas
por `revenues: { none: {} }` pra não contar duas vezes uma receita lançada à
mão (quando a OS é faturada ela sai deste filtro e entra pelo agregado de
receitas). Como um número só esconderia a origem do valor, o rodapé do card
mostra a composição sempre que houver OS concluída sem faturar. Em produção:
R$ 4.339,00 pagas + R$ 350,00 concluídas = R$ 4.689,00 (antes: R$ 4.339,00).

Aproveitando o mesmo arquivo: o card usava `new Date(ano, mês, 1)`
(meia-noite **UTC** do servidor da Vercel) enquanto o gráfico logo abaixo já
usava `brtMidnightUTC` — o mês do card começava às 21h do último dia do mês
anterior. Unificado. Removida também uma `count()` de OS `DONE` calculada a
cada carregamento e nunca renderizada.

**Lição:** filtro de exibição que descarta linha incompleta precisa contar o
que descartou. "Nenhuma OS no mapa" e "nenhuma OS no mapa que eu consiga
posicionar" parecem iguais na tela e são problemas completamente diferentes —
o usuário concluiu, com razão, que o mapa estava quebrado.

### 7.2.5 PWA morto e banco sem índice nenhum — 10/08/2026

Achados respondendo a duas perguntas do usuário ("o que falta pra aguentar 30
mil simultâneos?" e "dá pra virar aplicativo?"). Nenhum dos dois era sintoma
relatado — os dois estavam quebrados em silêncio.

**1. O middleware engolia todo arquivo estático.**

O `matcher` do proxy excluía nominalmente só `_next/static`, `_next/image`,
`favicon.ico` e `api/auth`. Tudo o mais em `public/` caía no redirect pra
`/login`. Quatro arquivos de uma vez, todos com efeito invisível:

| Arquivo | Consequência |
|---|---|
| `/sw.js` | `serviceWorker.register()` recebia o HTML do login em vez de JS. **As notificações push nunca funcionaram em produção** — a funcionalidade constava como pronta desde o início. |
| `/manifest.json` | Sem manifest, o navegador não oferece "instalar app". |
| `/robots.txt` | O Google nunca leu. |
| `/sitemap.xml` | Idem — os dois foram criados na tarefa de SEO e nunca chegaram a ser acessíveis. |

Somando: os ícones `icon-192.png` e `icon-512.png`, referenciados no manifest,
**nunca existiram** — `public/` só tinha os SVGs padrão do Next.

Corrigido excluindo qualquer caminho com extensão de arquivo
(`.*\..*`), em vez de manter uma lista nominal que já provou não escalar.
Isso não afrouxa segurança: o proxy só faz redirect de conveniência; a
proteção real é o `getTenant()` de cada página e Server Action. Ícones gerados
com `sharp` a partir do glifo de chave inglesa do lucide — o mesmo que já
identifica OS na interface —, mais `src/app/apple-icon.png` pela convenção do
App Router.

**Conclusão sobre "virar aplicativo":** já é um PWA; faltava só ele funcionar.
Com isso instala na tela inicial de Android e iPhone. O que ainda **não** tem é
modo offline — o service worker só trata push, não guarda nada em cache. Para
técnico em campo sem sinal, esse é o próximo passo que importa. Loja de
aplicativos exigiria empacotar com Capacitor (2–4 semanas, sem reescrever
tela).

**2. O schema não tinha um único `@@index`.**

Só chaves primárias e 13 `@unique`. Duas consequências:

- Toda consulta do produto é `WHERE tenantId = ? [+ status] ORDER BY createdAt
  DESC`. `Client`, `Revenue` e `Expense` não tinham nem cobertura parcial —
  varriam a tabela inteira de todos os tenants. (`ServiceOrder` e `Quote`
  tinham o prefixo salvo por acidente, via o `@@unique([tenantId, number])`.)
- **O Postgres não indexa chave estrangeira automaticamente** (ao contrário do
  MySQL). Todo JOIN e todo `onDelete: Cascade` varria a tabela filha inteira.

Adicionados 28 índices, escolhidos consulta a consulta a partir do código real
em `actions/` e `app/`, não por precaução. Migration puramente aditiva (28
`CREATE INDEX`, nenhum `DROP`/`ALTER`).

Verificação: com 12 registros o planejador prefere varredura mesmo tendo
índice, então rodei `EXPLAIN` com `enable_seqscan = off` — as 14 consultas
quentes do sistema são atendidas por índice. Entre índices que compartilham as
colunas iniciais o planejador escolhe arbitrariamente nesse volume; com dados
de verdade ele passa a escolher pela coluna final.

**Lição:** os dois problemas eram do mesmo tipo — **coisa que não dá erro**.
Push que nunca registra não aparece no Sentry; consulta sem índice em tabela de
12 linhas não aparece em lugar nenhum. Só apareceram porque alguém perguntou
"isso funciona?" em vez de esperar quebrar. Vale repetir a pergunta de tempos
em tempos sobre funcionalidade que ninguém usa ainda.

### 7.2.6 Modo offline para campo — 10/08/2026

Pedido do usuário logo depois de o PWA voltar a funcionar (7.2.5): sem sinal, o
app era inútil — o técnico num subsolo ou em zona rural via a tela de "sem
internet" do navegador e pronto.

**O que foi feito** (`public/sw.js`, versão `v2`):

- **Precache do essencial** na instalação: `/offline`, ícones e manifest. Um a
  um, com `catch` por item — `addAll()` aborta a instalação inteira do service
  worker se um único arquivo falhar.
- **Navegação: rede primeiro, cache depois.** Online o comportamento é
  idêntico ao de hoje; sem rede, entrega a última cópia daquela página.
- **Estáticos do Next: cache primeiro.** Têm hash no nome, são imutáveis.
- **Tela `/offline`** como último recurso, quando não há nem rede nem cópia.
  Fica fora do grupo `(dashboard)` — aquele layout consulta banco, que é
  exatamente o que não funciona aqui — e entrou na lista de rotas públicas do
  proxy, senão o service worker guardaria um redirect pro `/login` no lugar
  dela.
- **Aviso visual** no topo do dashboard quando `navigator.onLine` é falso: dado
  velho passando por dado atual é pior que erro visível.
- **Limpeza no logout.** O cache guarda HTML renderizado com dados da empresa;
  num celular compartilhado entre técnicos, sair da conta precisa levar isso
  junto.

**Decisões de recusa, que importam tanto quanto o que entrou:**

- **Nada de POST no service worker.** Server Actions são POST; uma escrita
  respondida pelo cache seria pior que um erro de rede honesto.
- **Payload de navegação do App Router (`?_rsc=`) fica de fora.** A mesma URL
  devolve conteúdo diferente conforme os cabeçalhos de roteamento do Next —
  guardar por URL serviria a resposta errada. Consequência assumida: offline,
  clicar num link do menu falha; recarregar entrega a versão guardada.
- **Só guarda resposta 200 e não-redirecionada.** Um 307 pro `/login` guardado
  no lugar de uma página quebra a navegação seguinte de um jeito difícil de
  diagnosticar (o navegador recusa resposta redirecionada em navegação).
- **`/api/`, telas de autenticação e `/admin` nunca entram no cache.**

**O que NÃO está incluído: gravar offline.** Criar ou concluir OS ainda exige
conexão. Fila de escrita com sincronização posterior é um projeto à parte —
envolve interceptar Server Actions (POST), persistir a intenção, e resolver
conflito de edição quando duas pessoas mexem na mesma OS. O aviso de tela e a
página `/offline` dizem isso ao técnico com todas as letras, em vez de deixar
ele achar que salvou.

**Correção achada no caminho:** o registro do service worker morava dentro do
`PushSubscriber`, atrás de `if (!("PushManager" in window)) return`. No iPhone
o `PushManager` só existe depois que o app é instalado na tela inicial — ou
seja, no Safari comum o service worker nunca era registrado. O registro virou
componente próprio (`ServiceWorkerRegistrar`): offline não deveria depender de
notificação estar disponível.

**Verificação:** servidor de desenvolvimento derrubado de verdade (`fetch` a
uma URL nova falhando, confirmado antes de concluir qualquer coisa). Com o
servidor morto: página já visitada abriu do cache com conteúdo íntegro; URL
nunca visitada caiu na tela `/offline` com o texto explicativo. As duas
metades do `navegacao()` exercidas de ponta a ponta.

### 7.2.7 Planos não entregavam o que a tela vendia — 10/08/2026

Pedido do usuário: "certifique que cada plano será liberado o que estamos
prometendo na assinatura". A auditoria encontrou o pior resultado possível.

**Não existia nenhuma verificação de plano no sistema.** `plan.slug` e
`maxUsers` não apareciam em lugar nenhum do código fora da própria tela de
preços. `hasActiveSubscription()` verificava apenas se `subscriptionStatus`
era `ACTIVE` — nunca **qual** plano. Na prática, **quem pagava R$ 97 recebia
exatamente o mesmo que quem pagava R$ 397.**

| Promessa da tela | Estava verificado? |
|---|---|
| Até 3 / 10 / ∞ usuários | ✗ dava pra convidar sem limite em qualquer plano |
| 50 OS por mês (Starter) | ✗ nada contava |
| Mapa GPS (Pro+) | ✗ o comentário no código dizia "feature paga (Pro+)" desde julho, mas a trava nunca existiu |
| Checklist + Assinatura (Pro+) | ✗ |
| Emissão de NFS-e (Pro+) | ✗ |
| Relatórios básicos × avançados | ✗ não havia distinção nenhuma |
| API de integração (Enterprise) | ✗ **o recurso não existe no produto** |

**O que foi construído:** `lib/plan.ts` como fonte única, com os limites em
código e chaveados por `Plan.slug`. Os limites não vieram de `Plan.features` do
banco de propósito — aquele campo é texto de vitrine ("Até 3 usuários"), serve
pra mostrar na tela, não pra decidir permissão.

Travas aplicadas em: convite de equipe, criação de OS, Mapa GPS (página + as
duas rotas de API), NFS-e (2 Server Actions + página fiscal), assinatura
digital (rota, nos dois ramos), checklist e relatórios. A aba some do menu via
`getAllowedTabs`, mas **cada página e rota se defende sozinha** — menu
escondido nunca foi proteção, a URL continua digitável.

**Decisões que exigiram julgamento:**

- **Relatórios básicos × avançados** não estava definido em lugar nenhum.
  Linha adotada: básico responde "como foi o meu mês" (resumo de receita,
  despesa, resultado e OS por status); avançado responde "como foi o período X
  e quem são meus melhores clientes" (período personalizado, ranking de
  clientes, detalhamento de receitas e despesas). O período é forçado no
  servidor, não escondido na tela — a Action é despachável direto com
  qualquer `from`/`to`.

- **Cliente existente perdendo recurso.** A primeira cliente pagante estava no
  Starter e já havia coletado 2 assinaturas digitais — recurso que a tela vende
  como Pro. Ligar a trava tiraria da mão de quem já paga e já usa. Decisão do
  dono do produto: manter pra ela. Daí o campo `Tenant.extraFeatures`, que soma
  recursos ao que o plano dá. Clientes novos seguem a regra.

- **Slug desconhecido cai no permissivo.** Troca deliberada: um plano novo mal
  cadastrado libera recurso a mais; o inverso — travar quem está pagando por
  causa de um slug que o código não conhece — é muito pior. Tenant sem plano
  nenhum também cai aí, e não é brecha: sem assinatura ACTIVE o layout do
  dashboard já manda pra `/expired` antes de qualquer coisa.

- **Checklist: só a criação é barrada.** Marcar ou apagar item existente
  continua livre, senão quem trocasse de plano ficaria com um checklist preso
  na tela, sem como limpar.

- **Assinatura digital vale para os dois ramos da rota**, inclusive o portal
  público. Isso é diferente do bloqueio por assinatura vencida que já existia
  ali: lá, o cliente final não pode ser punido por um pagamento atrasado da
  empresa no meio de um serviço; aqui, a empresa nunca comprou o recurso, então
  ele não deveria nem ter sido oferecido ao cliente dela.

- **"API de integração" saiu da vitrine.** Vendida no Enterprise por R$ 397 e
  inexistente — sem rota pública, sem chave de API, nada. Não dá pra "travar" o
  que não existe. Removida da tela por decisão do dono do produto; construir
  fica como projeto à parte (chaves por empresa, autenticação, endpoints,
  controle de uso, documentação).

**Também corrigido:** `Plan.features` no banco estava fora de sincronia com a
vitrine — o Pro não listava "Checklist + Assinatura digital" nem "Emissão de
NFS-e", e o Enterprise ainda listava a API. Sincronizado com o i18n.

**Verificação:** 14 testes novos em `lib/__tests__/plan.test.ts`, cobrindo os
três planos, o efeito do `extraFeatures`, o isolamento do contador de usuários
entre tenants e — o caso que quebraria mais silenciosamente — OS de meses
anteriores **não** consumirem a cota do mês corrente (contar tudo desde sempre
transformaria "50 por mês" em "50 pra vida inteira"). Conferido também contra
os dados reais de produção, tenant por tenant.

**Lição:** um comentário dizendo "feature paga (plano Pro+)" ficou três semanas
no código sem nenhuma trava embaixo dele. Intenção escrita em comentário não é
regra aplicada — e regra de cobrança que não existe não gera erro, não aparece
no Sentry e não aparece em teste nenhum. Só aparece na margem.

### 7.2.8 Etapa 1 de capacidade: consulta repetida — 10/08/2026

Continuação da 7.2.5 (índices). Medido antes de mexer: **um carregamento do
dashboard disparava ~25 consultas ao banco.**

| Origem | Antes | Depois |
|---|---|---|
| `getTenant()` | 1 | 1 |
| `hasActiveSubscription()` | 2 | 1 |
| `getLimites()` | 1 | 1 |
| Alertas de vencidos | 2 | 2 |
| Cards do dashboard | 7 | 7 |
| Gráfico de 6 meses | 12 | **2** |
| **Total** | **~25** | **~14** |

**Duas causas, duas correções:**

**1. Só o `getTenant()` estava embrulhado em `cache()` do React.** O
`hasActiveSubscription()` e o `getLimites()` não estavam — e ambos leem a
mesma linha de `Tenant`. Como `requireActiveSubscription()` aparece de 4 a 6
vezes por arquivo de actions, a mesma informação era buscada várias vezes na
mesma requisição.

Antes de cachear, foi verificado que nada altera assinatura/plano e relê no
mesmo request: `subscribeToPlan` escreve `PENDING` e redireciona sem reler, e
o webhook da Asaas nunca chama essas funções. Essa checagem não é preciosismo
— servir estado de assinatura velho foi exatamente o que deixou uma cliente
sem acesso em 07/08/2026 (seção 7.2.1).

**2. O gráfico fazia 2 consultas por mês, num laço de 6.** Virou 2 consultas
agrupadas no banco, com `date_trunc` + `GROUP BY`.

O detalhe que quase passou: `paidAt` é `timestamp without time zone` guardando
UTC. Agrupar direto em UTC jogaria um pagamento das 22h de 31/07 (BRT) para
agosto — sem erro, sem exceção, só o dinheiro no mês errado. A conversão
correta é `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'`.

Segundo detalhe: a chave do mês volta como **texto** (`'AAAA-MM'`), não como
data. Se voltasse como data, o driver interpretaria o timestamp sem fuso usando
o fuso do processo Node — UTC na Vercel, BRT na máquina local. Resultado
diferente conforme onde roda.

**Verificação:** as duas implementações foram rodadas lado a lado contra o
banco de produção, tenant por tenant — zero divergência, incluindo os tenants
com R$ 4.339 e R$ 2.580 no período. As quatro fronteiras de mês foram testadas
diretamente no Postgres (01:00, 02:59, 03:00 UTC e fim de mês). Ficaram 5
testes de regressão em `actions/__tests__/dashboard.test.ts`, sendo um
especificamente para o pagamento das 22h da virada.

**Lição:** o gargalo de capacidade mais barato quase nunca é infraestrutura —
é trabalho repetido que ninguém contou. Antes de aumentar instância, vale
medir quantas vezes a mesma linha é lida na mesma requisição.

### 7.2.9 Painel do dono da plataforma — 10/08/2026

O `/admin` existia desde o início, mas com quatro problemas — e o usuário só
perguntou onde administrava o negócio porque **não havia link nenhum para ele
em lugar algum do sistema**; só se chegava digitando a URL.

| Problema | Correção |
|---|---|
| Nenhum link na interface | Item no rodapé da barra lateral, visível só pro dono |
| Somente leitura — nenhum botão | 4 ações, cada uma com confirmação |
| `PENDING` invisível nos cartões | Cartão próprio + aviso destacado |
| MRR errado no plano anual | `priceYearly / 12` |

**O MRR tinha um ternário morto:**

```ts
sub?.billingCycle === "YEARLY" ? price : price   // os dois lados iguais
```

Não aparecia porque a única assinante é mensal. No primeiro assinante anual, o
painel contaria R$ 97 em vez de R$ 80,83 — MRR inflado em 20%, justo o número
que orienta decisão de negócio.

**Segurança.** A regra de quem é o dono saiu do `app/admin/layout.tsx` para
`lib/admin.ts`, e **toda Server Action do painel chama `requireSuperAdmin()`
por conta própria** — layout não protege Action despachável, lição que já
custou caro aqui (7.1, 7.2). A verificação usa `getUser()`, que valida o token
junto ao Supabase, e não `getSession()`, que só lê cookie: para o resto do
sistema o cookie basta; para a conta que pode entrar na conta dos outros, não.

**Entrar na conta do cliente (impersonation)** é a funcionalidade mais
perigosa do produto. Desenho:

- Cookie `admin_ver_como`, `httpOnly`, expira em 1 hora.
- **O cookie sozinho não concede nada.** `tenantImpersonado()` só devolve algo
  se a sessão real — verificada no Supabase — for a do dono. Forjar o cookie
  em outra conta não tem efeito nenhum.
- **Custo zero no caminho normal:** sem o cookie, a função retorna antes de
  qualquer verificação. Sem isso, seria uma ida de rede ao Supabase por
  carregamento de tela — regressão de capacidade disfarçada de segurança,
  logo depois da 7.2.8 ter reduzido consultas.
- Faixa vermelha permanente no topo, saída em um clique.
- Devolve o papel e o id do OWNER daquela empresa, então o suporte enxerga
  exatamente o que o cliente enxerga, inclusive bloqueio por assinatura
  vencida.
- Tudo registrado em `AdminAuditLog` — entrada, saída e cada ação. Acesso a
  dado de terceiro sem registro é problema de LGPD, não só de organização.

**Uma limitação assumida:** durante a impersonação, uma escrita fica atribuída
ao OWNER da empresa, não ao admin. Impedir isso exigiria bloquear toda mutação
(muito mais invasivo) ou criar um usuário fantasma no tenant do cliente (pior:
polui a equipe dele). O log de auditoria é o que amarra a ação ao suporte.

**Gráficos** (12 meses): novas empresas × total pagante, MRR e usuários
cadastrados. O histórico de pagantes é **reconstruído** das datas de
`Subscription` (criação e cancelamento) porque não existe histórico de
mudanças de status guardado — o mês corrente é exato, o passado é
aproximação. Se isso vier a importar, o caminho é uma tabela de snapshot
mensal.

**Verificação:** 9 testes em `lib/__tests__/admin.test.ts`, sendo os três mais
importantes: cookie sem sessão de dono não impersona; cookie com sessão de
outro usuário não impersona; e sem cookie a sessão nem chega a ser consultada
(prova de que não há custo no caminho normal).

### 7.2.10 Retrato mensal, relatório PDF e o buraco na reconciliação — 10/08/2026

**Bloqueio automático de inadimplente: já existia.** O usuário pediu como
novidade; a verificação mostrou o ciclo inteiro funcionando —
`PAYMENT_OVERDUE` põe o tenant em `PAST_DUE`, `hasActiveSubscription` só
libera dentro da carência, o redirect do layout **não olha papel** (bloqueia
técnico junto), e o webhook de pagamento devolve pra `ACTIVE`. Só a carência
mudou: 3 → 5 dias.

**Mas havia um buraco na rede de segurança.** A reconciliação diária, criada
depois do incidente de 07/08, cobria apenas `PENDING`. Um cliente
**inadimplente** que paga e cujo webhook se perde ficava bloqueado
indefinidamente — o mesmo defeito, só que na renovação, e agora com a equipe
inteira parada em vez de um cadastro novo travado.

A extensão para `PAST_DUE` exigiu um cuidado que o caso `PENDING` não tem:

| Estado | O que serve como prova de pagamento |
|---|---|
| `PENDING` | Qualquer pagamento liquidado — nunca pagou nada antes |
| `PAST_DUE` | Só pagamento **não processado** e com vencimento a partir do ciclo vencido |

Sem essa distinção, a rede de segurança reativaria de graça quem parou de
pagar: os pagamentos dos ciclos antigos continuam `RECEIVED` para sempre na
Asaas, e um `find(p => p.status === "RECEIVED")` acharia um deles todo dia.

**Retrato mensal (`MonthlySnapshot`).** Os gráficos do painel nasceram
deduzindo o passado das datas de assinatura. Isso apaga inadimplência: uma
empresa que ficou dois meses sem pagar e voltou aparecia como pagante o tempo
todo, porque só existem as datas das pontas. Agora o cron grava o retrato do
mês corrente todos os dias (upsert pela chave `AAAA-MM`), então meses passados
congelam com o último valor real que tiveram e o mês atual é calculado ao vivo
no painel — sem job de virada de mês, que seria mais uma coisa para falhar
calada.

**Decisão: não fabricar histórico.** Seria fácil semear os 12 meses anteriores
com a reconstrução antiga, e o gráfico ficaria bonito hoje. Mas esses números
entrariam na tabela indistinguíveis dos reais — exatamente a mentira silenciosa
que motivou a mudança. Só entram meses de fato fotografados; o gráfico começa
curto e cresce.

**Relatório em PDF** (`/api/pdf/admin-report`): resumo, evolução mensal, tabela
de empresas e últimas ações do painel, respeitando o filtro da busca. Checa
super admin por conta própria — junta dados de **todas** as empresas num
arquivo feito para ser encaminhado; se vazar, vaza tudo de uma vez. `no-store`
no cache e rodapé dizendo que é documento interno.

**Busca** por nome e CNPJ, via GET: o termo fica na URL, então dá para
recarregar e mandar o link já filtrado para alguém da equipe.

**Verificação:** 5 testes gerando o PDF de verdade (inclusive lista vazia,
empresa sem plano e 120 empresas com quebra de página), e em produção o
endpoint responde 403 sem sessão — confirmado que o corpo devolvido **não** é
um PDF, não bastando olhar o código de status.

### 7.2.11 Aviso antes do corte por inadimplência — 10/08/2026

Até aqui o cliente inadimplente era bloqueado **sem aviso nenhum**: a primeira
notícia do problema era a equipe inteira parada na tela de acesso expirado.
Quem perde acesso sem aviso trata como defeito do sistema, não como cobrança
pendente — e cancela.

Agora saem dois e-mails: **1º e 3º dia de atraso**, com o corte no 5º.

**A regra virou módulo puro** (`lib/past-due.ts`), com `PAST_DUE_GRACE_DAYS`
morando lá dentro. Antes o número de dias vivia em `lib/auth.ts` e o e-mail
teria que recalcular "faltam X dias" por conta própria — dois lugares, e um dia
o aviso diria "faltam 2 dias" com o bloqueio chegando no dia seguinte.

**Contador, não data.** `Subscription.pastDueWarningsSent` guarda quantos
avisos já saíram no ciclo vencido. A alternativa óbvia — comparar se hoje é
exatamente o dia 1 ou o dia 3 — tem um defeito que este projeto já pagou: se o
cron não rodar naquele dia exato, o marco some para sempre (foi o que
aconteceu com o cron de NPS, seção 9). Com contador, o cron que falha nos dias
1 e 2 manda **um** e-mail no dia 3 — o mais urgente — e segue.

**Marca antes de enviar.** Se o envio falhar, o cliente perde aquele aviso;
recuperável no marco seguinte. Marcar depois e falhar no meio faria o mesmo
e-mail sair todo dia até o corte, o que é pior.

**Zera nos três caminhos que reativam:** webhook da Asaas, reconciliação do
cron e liberação manual no painel. Sem isso, um cliente que atrasou uma vez
nunca mais receberia aviso nos atrasos seguintes.

**Conteúdo do e-mail**, além do prazo: diz que **nada é apagado**, que o
bloqueio pega **toda a equipe** (inclusive técnicos em campo), que o acesso
**volta sozinho** quando o pagamento cair, e trata o caso de quem já pagou e
está esperando a confirmação. O tom muda no segundo aviso — assunto e cor
diferentes.

**Verificação:** 19 testes novos. 11 na regra (incluindo cron fora do ar por
uma semana, e uma checagem de que nenhum marco de aviso é ≥ à carência — um
e-mail que chega depois do corte é pior que não avisar) e 8 montando o e-mail
de verdade com o Resend trocado por espião, conferindo plural, idioma e
conteúdo. O cron de produção **não** foi disparado para testar: ele também
manda NPS e onboarding, e chamaria e-mail real para cliente real. A consulta
foi simulada em leitura — hoje ela devolve zero inadimplentes.

### 7.2.12 Equipe de administração da plataforma — 10/08/2026

Até aqui o painel aceitava **um único e-mail**, fixo em código: não havia como
adicionar ninguém sem substituir o dono. Agora a equipe é dado, com área.

**Matriz de permissões** (mora inteira em `lib/admin.ts`, legível de cima a
baixo):

| | Dono | Financeiro | Comercial | Logística | TI |
|---|---|---|---|---|---|
| Ver painel e empresas | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ver faturamento e MRR | ✓ | ✓ | ✓ | — | — |
| Relatório em PDF | ✓ | ✓ | ✓ | — | — |
| Liberar acesso | ✓ | ✓ | — | — | ✓ |
| Cancelar acesso | ✓ | ✓ | — | — | — |
| Trocar plano | ✓ | ✓ | ✓ | — | — |
| Entrar na conta do cliente | ✓ | — | — | ✓ | ✓ |
| Administrar a equipe | ✓ | — | — | — | — |

O raciocínio de cada recusa importa mais que o de cada permissão:
**financeiro e comercial não entram na conta de cliente** porque não precisam
dos dados dele pra fazer o trabalho, e acesso a mais é exposição a mais
perante a LGPD; **logística e TI não veem faturamento** pelo mesmo motivo
invertido; **TI libera acesso** porque destravar cliente preso por falha
técnica (o caso do webhook em 07/08) é trabalho de TI, não de financeiro.

**Decisões que evitam armadilha:**

- **O fundador é DONO no código, não na tabela.** Se ele se remover por
  engano, ou a tabela ficar vazia, o painel não pode trancar sem ninguém
  dentro. É a chave reserva.
- **DONO não é atribuível pela tela.** Só as quatro áreas aparecem no
  formulário — conceder "dono" por formulário seria conceder o poder de
  remover o próprio dono.
- **Desativar, nunca apagar.** O `AdminAuditLog` guarda o e-mail de quem fez
  cada ação; apagar a linha deixaria o histórico órfão.
- **Convite não cria empresa fantasma.** Sem cuidado, o primeiro acesso de um
  funcionário ao `/dashboard` cairia na branch de `getTenant()` que cria
  tenant, e ele viraria uma "empresa cliente" na lista, nos gráficos de
  crescimento e no relatório em PDF. Uma guarda nessa branch — e só nela,
  onde não custa nada no caminho normal — manda o funcionário pro `/admin`.
- **Esconder botão é cortesia, não proteção.** Toda Server Action chama
  `requireSuperAdmin(permissao)` por conta própria, porque tem ID próprio e é
  despachável sem passar por tela nenhuma.
- **A tela explica o que cada área libera** antes de convidar, não depois.

**Verificação:** 19 testes em `lib/__tests__/admin.test.ts`. A matriz inteira
é testada célula a célula contra uma tabela-espelho — se alguém mudar quem
pode o quê sem querer, quebra. Os mais importantes são os de recusa: membro
desativado não entra nem com cookie válido; o financeiro, mesmo estando na
equipe e com cookie legítimo, não entra na conta de cliente; e comercial
disparando `cancelarAcesso` direto (sem passar pela tela) é barrado.

### 7.2.13 Parecer jurídico aplicado — contrato v1.1 — 10/08/2026

O contrato v1.0, gerado por cliente e anexado ao e-mail de confirmação de
pagamento, foi submetido a revisão jurídica junto com um roteiro de 11 pontos
sobre os quais havia dúvida. O parecer confirmou 2 e mandou ajustar 9.

**Confirmados, mantidos sem alteração:**
- **Legítimo interesse (5.3)** — não exige LIA prévia como condição de
  validade; a ANPD pode pedir *a posteriori*. Documentar internamente é
  recomendação de compliance, não redação contratual.
- **Suboperadores por função (5.7)** — a LGPD, diferente do art. 28 do GDPR,
  não exige nomeação individualizada no corpo do contrato.

**Ajustados, com a redação literal proposta pelo parecer:**

| Cláusula | O que mudou |
|---|---|
| 2.3 | Reajuste ganhou índice objetivo (IPCA/IBGE) — antes era discricionário |
| 3.4 (nova) | Rescisão pela CONTRATADA: não existia hipótese nenhuma |
| 5.1 | Segregado: nos dados do assinante o ServiçoOS é **controlador**, não operador |
| 5.8 | Cláusulas-Padrão da Resolução CD/ANPD nº 19/2024, no lugar de redação genérica |
| 5.9 | Prazo objetivo de 24h operador→controlador (a ANPD dá 3 dias úteis ao controlador) |
| 5.10 | Ressalva de guarda fiscal — conflitava com a eliminação em 30 dias |
| 8.4 (nova) | Teto de responsabilidade não vale para dolo, culpa grave ou arts. 42-45 da LGPD |
| 11 | Foro da comarca da CONTRATADA para PJ, preservando o do consumidor (art. 101, I, CDC) |
| 12 (nova) | Prevalência do contrato sobre os Termos de Uso em caso de divergência |
| — | Aceite eletrônico: fundamento trocado para art. 107 do CC + art. 10, §2º da MP 2.200-2/2001 |

**Dois achados que importam além do texto:**

1. **A limitação de responsabilidade sem exceções era risco de nulidade
   total**, não de afastamento pontual: cláusula que limita indiscriminadamente
   qualquer dano — inclusive dolo — pode ser declarada nula por inteiro
   (arts. 421, 422 e 424 do CC, este último para contratos de adesão).
2. **A eleição de foro cobria só a exceção.** Escrevi foro do consumidor
   "quando a CONTRATANTE for consumidora" — mas pela teoria finalista a maioria
   dos clientes é PJ contratando insumo para a atividade-fim, ou seja, *não*
   consumidora. A regra ficou sem foro; só a exceção tinha.

**Fora do contrato, pendente de ação:** o período de adoção das Cláusulas-Padrão
da ANPD encerrou em 23/08/2025. Referenciá-las no contrato não basta — é preciso
**firmá-las com cada fornecedor estrangeiro**. Registrado como pendência
operacional, não de código.

**Verificação:** além dos testes de geração, um teste lê o código-fonte do
contrato e confere que as citações exigidas pelo parecer continuam lá (artigos
42-45, Resolução 19/2024, Resolução 15/2024, art. 101 I, IPCA, e outras), e
que a Lei 14.063/2020 — apontada como fundamento errado — não voltou. Cláusula
legal apagada por engano não gera erro em lugar nenhum: o PDF continua saindo
bonito, só que sem a proteção.

### 7.3 Auditoria completa pré-venda — 05/08/2026

Pedido explícito de revisar o código inteiro (não só o diff), todas as abas,
os 6 e-mails e a segurança, antes da primeira venda real. Como o branch já
estava 100% sincronizado com o `origin` (sem diff pra revisar), a revisão foi
feita lendo a árvore inteira na mão — todo `lib/*.ts`, `actions/*.ts`,
`app/api/**/route.ts`, `proxy.ts`, e as páginas/componentes de maior risco
(portal público, PDFs, mapa, sidebar) — mais um teste funcional navegando
pelas 16 abas do dashboard com um tenant de teste descartável (criado e
apagado direto no banco, sem tocar em dado real).

**Achados corrigidos:**

| Achado | Correção |
|---|---|
| `getReferralInfo()` não exigia assinatura ativa (único de leitura sem essa checagem) | `requireActiveSubscription` adicionado |
| `updateOrderStatus()` sem checagem de papel — TECHNICIAN faturava uma OS direto (cria Revenue) e dava pra "desfaturar" mudando o status de novo | Exige OWNER/ADMIN pra ir pra `INVOICED`; bloqueia qualquer mudança de status numa OS já `INVOICED` |
| `getMonthlyRevenueChart()` sem checagem de papel — expunha receita/despesa (financeiro é OWNER/ADMIN em todo o resto do sistema) pra qualquer TECHNICIAN no `/dashboard` | Exige OWNER/ADMIN; página só busca/renderiza o gráfico se for admin |
| `nextOrderNumber`/`nextQuoteNumber`/`nextOmNumber` sem lock — duas criações simultâneas podiam calcular o mesmo número (protegido por `@@unique([tenantId, number])`, mas a segunda falhava com erro cru em vez de tentar de novo) | `retryOnUniqueConflict` (novo, `lib/retry.ts`) recalcula e tenta de novo até 5x num P2002 |
| `getTenant()`: colisão de unique constraint na criação do `User` assumia sempre ser no `id` (corrida esperada) — se fosse no `email` (linha órfã com outro id), `findUniqueOrThrow` por id quebrava com "not found" | Distingue via `err.meta.target`; colisão de e-mail vira erro claro em vez de crash genérico |
| `/settings/fiscal` (config. de NFS-e) sem nenhum link na UI — nem sidebar, nem dentro de `/settings` — apesar da própria mensagem de erro do `emitNfse` dizer "Configurações → Fiscal" | Item "Config. Fiscal" adicionado à sidebar |
| Link de nota do e-mail de NPS (GET, grava direto) vulnerável a scanner de e-mail corporativo pré-buscando os 11 links e gravando nota aleatória sem o cliente clicar | GET não grava mais — só pré-seleciona a nota no widget do portal (`?prefillScore=`); gravação exige o clique em "Enviar avaliação" (POST de verdade) |
| Aprovar orçamento e responder NPS no portal público mostravam "sucesso" mesmo quando a chamada ao servidor falhava (sem checar `res.ok`) | Ambos checam a resposta e mostram erro se falhar |
| E-mails de boas-vindas/onboarding convidam "responda este e-mail" mas o remetente é `noreply@` sem reply-to | `reply-to: suporte@servicoos.com.br` em todos os envios — endereço com hospedagem de verdade configurada no mesmo dia (Zoho Mail, ver seção 7.3.1) |
| `nfeio.ts` lia a API key no escopo do módulo (padrão diferente do resto, que adia a leitura de propósito) | Movido pra dentro da função |
| Cron do dia-3 calculava a janela com hora local do servidor (UTC), não horário de Brasília — mesma classe de bug já corrigida em dashboard/finance/reports | `todayInBRT`/`brtMidnightUTC` aplicados |
| Portal público permitia reassinar (trocar a assinatura) de uma OS já faturada | Bloqueado, mesmo padrão de `completeServiceOrder`/`updateServiceOrder` |
| Typo "ordems" (em vez de "ordens") na contagem de OS/OM — plural de "ordem" no PT-BR não é regular | Corrigido |
| `id` HTML duplicado (`name`, `document`, `phone`) entre `TenantForm` e `ProfileForm`, ambos renderizados juntos em `/settings` — quebra a associação `label for=` (clicar no label focava o campo errado) | `id`s do `ProfileForm` prefixados (`profile-name`, etc.) |

### 7.3.1 Hospedagem de e-mail pra suporte@servicoos.com.br — 06/08/2026

Resolvido no mesmo dia do achado acima. Duas tentativas:

1. **ImprovMX (grátis) + Gmail "enviar como"** — funcionou pro recebimento
   (encaminha pro Gmail pessoal), mas o Gmail exigiu configurar um servidor
   SMTP de verdade pra poder *enviar* como esse endereço, e o plano grátis do
   ImprovMX só recebe/encaminha, não manda — sem credencial de SMTP válida
   pra usar ali. Abandonado só pro envio (o domínio nunca chegou a ficar sem
   receber).
2. **Zoho Mail (plano grátis)** — caixa de e-mail de verdade, com SMTP
   próprio. MX/SPF/DKIM do ImprovMX trocados pelos do Zoho (`mx.zoho.com`,
   `mx2.zoho.com`, `mx3.zoho.com`, prioridades 10/20/50 — ver DNS abaixo). A
   tabela de "e-mails transacionais" que o Zoho mostra durante o setup
   (CNAME `bounce-zem` + DKIM `52056._domainkey`, produto ZeptoMail) foi
   ignorada de propósito — é redundante com o Resend, que já cobre isso.

**Cuidado real durante a configuração:** ao adicionar o TXT `zmail._domainkey`
(chave do Zoho), o registro **`resend._domainkey`** (chave do Resend, já
existente) acabou sendo sobrescrito por engano com o mesmo valor da chave do
Zoho — os dois registros ficaram idênticos por um tempo. Não chegou a
propagar (pego e corrigido antes do TTL de 1h expirar), mas seria um jeito
sorrateiro de quebrar a verificação DKIM do Resend (e-mails de boas-vindas,
recuperação de senha, etc. começarem a cair em spam ou serem rejeitados) sem
nenhum erro óbvio no momento da mudança. **Lição:** ao adicionar um DKIM novo
num domínio que já tem outro (padrão comum: `<algumacoisa>._domainkey`),
conferir com cuidado que não se está editando/duplicando o valor de um
registro `_domainkey` diferente que já existia.

Fluxo final: Gmail manda usando o SMTP do Zoho (`smtp.zoho.com:587`,
usuário/senha da caixa `suporte@`) — não é mais "tratar como alias" (esse
caminho simples parou de funcionar pro Google mesmo com a caixa marcada,
provavelmente restrição recente do Gmail pra contas pessoais). Testado de
ponta a ponta: recebimento (e-mail externo → chega na caixa do Zoho) e envio
(Gmail → sai como `suporte@servicoos.com.br`, cópia fica no enviados do Zoho)
confirmados funcionando.

**Achado confirmado e resolvido — 06/08/2026:** `api/webhooks/supabase/route.ts` era mesmo um SEGUNDO caminho de criação de tenant/usuário, e estava ativo. Confirmado direto no banco (Database Webhooks do Supabase viram triggers reais no Postgres) — `information_schema.triggers` mostrou `auth.users → INSERT → supabase_functions.on_auth_user_created()`, a assinatura exata de um Database Webhook configurado pelo painel apontando pro INSERT de `auth.users`. Como o `getTenant()` (lib/auth.ts) já cobre 100% dessa criação sozinho, o trigger foi removido (`DROP TRIGGER on_auth_user_created ON auth.users`) — confirmado sem nenhum trigger restante na tabela. A rota HTTP (já desativada como no-op desde a auditoria) pode ser deletada do código numa limpeza futura.

---

### 7.2.14 Posicionamento horizontal e importação de planilha — 11/08/2026

**O gatilho.** O dono corrigiu uma premissa que eu vinha repetindo: o ServiçoOS
não é para desentupidoras e assistências técnicas, é para **qualquer** empresa
prestadora de serviço, pequena ou média. A premissa errada tinha vazado para o
produto.

**Landing.** Os três depoimentos eram de refrigeração, assistência técnica e
elétrica — todos do mesmo nicho. Quem tem empresa de limpeza, jardinagem, TI,
consultoria ou eventos chegava ali e se auto-excluía. Trocados por uma seção de
12 segmentos atendidos.

No caminho, dois problemas de veracidade no mesmo bloco: os depoimentos eram
**inventados** (nomes fabricados, 5 estrelas cada) sob o título "Empresas reais,
resultados reais", e o topo dizia "mais de 50 empresas". Substituídos por
afirmações verificáveis (sem fidelidade, sem taxa de instalação, exportação dos
dados) — tudo que já existe no contrato e em Configurações. Vocabulário de
"técnicos" para "equipe em campo" onde era público-alvo, mantido onde é o nome
do cargo no sistema.

Corrigido também o botão flutuante do WhatsApp, fixo em `5511999999999` (número
de exemplo): agora vem de `SUPPORT_WHATSAPP` e, sem a variável, não renderiza.
**Pendência operacional:** definir essa env var na Vercel — o plano Enterprise
promete "Suporte 24h via WhatsApp" e hoje o botão está ausente.

**Importação de planilha (CSV e .xlsx), sem dependência nova.**

Por que não usar biblioteca: o `xlsx` (SheetJS) do npm parou em 2022 e carrega
CVEs; o `exceljs` traz 90 pacotes, incluindo o `archiver` — que *escreve* zip,
sendo que aqui só se lê. Um `.xlsx` é um zip com dois XMLs e o Node já tem
`zlib`, então `lib/planilha.ts` lê os dois formatos direto.

Três armadilhas que um parser genérico erra:

| Armadilha | Consequência se ignorada |
|---|---|
| Excel-BR salva CSV com `;` e em Windows-1252 | Planilha inteira vira uma coluna só, com acentos quebrados |
| No `.xlsx` a célula vazia é **omitida** do XML | Telefone sobe pra coluna do e-mail; todos os dados deslocados |
| Texto com formatação parcial vira vários `<t>` no mesmo `<si>` | Nome do cliente truncado |

Validado contra arquivo de ferramenta real (openpyxl) e contra `.xlsx` feito
pelo Excel de verdade: 830 células, 47 com acento, sem perda.

Decisões de produto: nome inválido é **erro** (pula a linha), e-mail inválido é
**aviso** (importa sem o e-mail) — perder o cliente inteiro por um erro de
digitação é pior. Duplicidade por documento (só dígitos) ou e-mail, nunca por
nome: "João Silva" repetido é legítimo.

**Gravação:** escrita aninhada, não `createMany` + `createMany`.
`createManyAndReturn` não garante que a ordem devolvida bate com a de entrada, e
casar endereço com cliente por posição erraria em silêncio — cada um com o
endereço do vizinho. Há teste com três cidades distintas cobrindo isso.

**Limite conhecido — geocodificação.** A importação não geocodifica: o Nominatim
(OpenStreetMap, gratuito) aceita 1 requisição por segundo, então centenas de
endereços não cabem no tempo da função. O backfill do cron diário pega quem está
sem coordenada, mas processa ~10 por dia — importar 800 clientes significa meses
até o mapa encher. A tela avisa que o preenchimento é gradual. **A correção real
é trocar de provedor de geocodificação** (LocationIQ, Mapbox, Google) — decisão
com custo, do dono. Este é o gargalo que a importação expôs, não criou.

`normalizar()` usa `\p{Diacritic}` em vez de uma classe com os caracteres
combinantes literais: como literal, eles ficam invisíveis no arquivo e qualquer
editor ou merge pode comer sem ninguém notar.

94 → 153 testes.

---

### 7.2.15 Campos personalizados por empresa — 11/08/2026

Continuação direta do posicionamento horizontal (7.2.14): o sistema atende
qualquer prestador de serviço, mas o cadastro era o mesmo para todo mundo. Um
pet shop precisa de "raça/porte", uma empresa de limpeza de "metragem", uma de
TI de "número de série". Sem isso, cada segmento novo esbarra numa parede e o
posicionamento fica só no discurso.

Cinco tipos (texto, número, data, lista de opções, sim/não), com obrigatoriedade
e ordem definidas pela empresa, para cadastro de cliente e ordem de serviço.

**Onde ficam os valores.** Num `Json` no próprio registro (`Client.customValues`
/ `ServiceOrder.customValues`), não numa tabela de valores com chave estrangeira
polimórfica. Dois motivos concretos:

- Apagar um campo não deixa valor órfão na tela: a exibição percorre as
  **definições**, não as chaves do Json. O valor continua guardado — recriar o
  campo traz tudo de volta — mas some de todo lugar.
- A exportação de dados (LGPD) leva os valores junto sem precisar lembrar de
  incluir mais uma relação. É exatamente o tipo de coisa que se esquece e vira
  dado faltando num pedido de titular.

Contrapartida assumida: não dá para filtrar por campo personalizado com índice.
Quando for pedido, o caminho é um índice GIN no Json, não remodelar.

**Guardas que a validação puxou:**

| Guarda | O que evita |
|---|---|
| Prefixo `cf_` no nome do input | Campo chamado "email" sobrescrevendo o e-mail do cliente |
| Descarta id de campo inexistente | Server Action é endpoint HTTP; dá para montar a requisição na mão |
| Recusa valor fora da lista | Ficaria gravado para sempre num campo que a tela apresenta como fechado |
| Número aceita vírgula decimal | `<input type="number">` recusa "1,5" em pt-BR sem explicar |
| `deleteMany` com `tenantId` no where | `delete` por id apagaria campo de outra empresa se o id vazasse |
| Reordenar regrava a sequência inteira | `position` tinha buracos e repetições de criações/remoções anteriores |
| Criar e editar usam o mesmo helper | Campo obrigatório cobrado num lugar e ignorado no outro |

153 → 194 testes.

**Gotcha novo (Prisma 7):** `migrate diff --to-schema-datamodel` foi renomeado
para `--to-schema`. E `npx vitest run` pula o hook `pretest` que regenera
`src/test-utils/test-schema.sql` — depois de mexer no schema, rodar `npm test`,
senão os testes batem num banco sem a tabela nova.

---

### 7.2.16 Vocabulário adaptável — 11/08/2026

Par do item anterior: campos personalizados adaptam os **dados**, este adapta as
**palavras**. Uma empresa de limpeza faz "visitas", uma de TI atende "chamados",
uma consultoria toca "projetos" — nenhuma fala "ordem de serviço". A empresa
configura dois termos (o que se abre para cada trabalho, e quem executa) em
Configurações → Vocabulário.

**Duas armadilhas que a medição revelou antes de escrever código.**

*1. Substituição cega destruiria os documentos jurídicos.* Dos 76 textos que
pareciam citar "OS", boa parte era o **artigo** "os" — "os dados", "os Termos".
Trocar por texto corromperia a política de privacidade. Por isso a marcação é
explícita (`[[...]]`), colocada à mão só onde é a entidade; 17 textos da landing
e dos documentos legais ficaram deliberadamente fora, com teste garantindo que
continuem fora.

*2. Português cobra concordância.* "a ordem de serviço" mas "o chamado";
"concluída" mas "concluído". Sem tratar isso, a tela diria "a chamado".

**Erro meu que o teste pegou:** eu tratava artigo e desinência de adjetivo como
a mesma coisa. São iguais no feminino ("a"), mas no masculino o adjetivo termina
em "o" (*cadastrado*) e o determinante irregular termina em **nada** (*nenhum*).
`Nenhum[[osFim]]` produzia "Nenhumo". Hoje há marcador próprio para cada papel,
e as frases com determinante irregular foram reescritas em construção neutra
("Sem …", "Ainda não há …").

| Marcador | Vale para | Exemplo |
|---|---|---|
| `[[os]]` / `[[Os]]` | singular, minúsculo / capitalizado | ordem de serviço |
| `[[osP]]` / `[[OsP]]` | plural | ordens de serviço |
| `[[osC]]` | forma curta, como a empresa escreveu | OS |
| `[[osArt]]` / `[[osArtP]]` | artigo | a / as |
| `[[osFim]]` / `[[osFimP]]` | desinência de adjetivo regular | concluíd**a** |

**Por que `[[...]]` e não `{...}`:** `{...}` é sintaxe do ICU — o next-intl
exigiria passar os valores em **toda** chamada de tradução, em ~59 pontos do
código. Aqui a troca acontece uma vez, ao carregar as mensagens, com cache por
idioma + vocabulário. O vocabulário vem na **mesma consulta** que já buscava o
idioma do tenant: zero query a mais em qualquer página.

"Voltar ao padrão" grava NULL, não o objeto de hoje — assim uma melhoria futura
no texto padrão alcança quem restaurou, em vez de congelar.

203 → 236 testes. Dois deles só falham em produção se faltarem: todo marcador
usado existe na tabela (erro de digitação apareceria cru na tela do cliente) e
nenhum marcador invadiu área proibida.

**Gotchas novos:**

- `Prisma.DbNull`, não `null`, para gravar NULL em coluna Json — em Json, `null`
  é ambíguo (pode ser "o valor JSON null") e o Prisma exige desambiguar.
- **Nunca use `JSON.stringify(...).includes("[[")` para procurar marcador não
  substituído:** `[[` aparece sozinho sempre que uma lista tem outra lista
  dentro. Isso gerou falso positivo no teste e de novo na verificação da página
  publicada, onde o `[[` era do payload interno do Next (`__next_f.push`). A
  checagem certa percorre texto por texto.
- `vercel env pull` devolve valor **vazio** para toda variável criptografada,
  inclusive `DATABASE_URL`. Não serve para conferir se uma variável foi gravada.

---

### 7.2.17 Ambiente de teste, com travas — 11/08/2026

Até hoje não havia **nenhum passo** entre "o código mudou" e "o cliente está
usando": todo deploy ia direto para o domínio onde a assinante trabalha.

**A parte difícil não é a infraestrutura, é a contenção.** O risco de um
ambiente de teste não é ele ser ruim — é ele ser *bom demais*. O banco de teste
é uma cópia, e uma cópia tem os e-mails e telefones **reais** dos clientes
finais. Testar o aviso de inadimplência dispararia cobrança para gente que não
deve nada. Um staging que faz isso é pior que nenhum staging.

Quem decide o ambiente é a própria Vercel (`VERCEL_ENV`), não uma variável que
alguém pode esquecer de trocar. **Lista de permissão, não de bloqueio:** só o
que for comprovadamente produção toca o mundo real; valor desconhecido,
ambiente novo ou variável faltando ficam contidos.

| Integração | Fora de produção | Por quê |
|---|---|---|
| E-mail | Desviado para o dono, com `[TESTE]` no assunto. Sem endereço seguro, **aborta** | Banco de cópia tem e-mail real do cliente final |
| Nota fiscal | **Bloqueada** | Não existe modo de teste; nota emitida é documento fiscal com número e cancelamento tem prazo |
| Cobrança | Sempre sandbox | Chave de produção vazada para o teste cobraria cartão de verdade |
| WhatsApp | Não dispara, registra no log | Devolve sucesso para o fluxo seguir testável |
| Cron diário | Não roda | Manda e-mail de cobrança e reconcilia Asaas |
| Google | Não indexa | Cópia indexada compete com o site real |

Mais faixa amarela fixa no topo fora de produção — o jeito mais caro de errar é
achar que se está no teste quando se está em produção.

**A trava provou o valor antes do deploy:** derrubou `past-due-email.test.ts`,
que inspeciona o e-mail que o **cliente** recebe e portanto precisa declarar
ambiente de produção. Corrigido no teste, não na trava.

Fluxo novo: `npm run deploy:teste` → conferir → `npm run deploy:prod`. E
`npm run db:ensaio` mostra o SQL exato que rodaria em produção, sem subir nada.

236 → 253 testes. Falta só o banco de teste no Supabase, que exige login no
painel — passo a passo em [AMBIENTE_DE_TESTE.md](AMBIENTE_DE_TESTE.md). Até lá
o preview não tem credencial nenhuma, então não alcança dado real.

**Verificado em produção após o deploy:** sem faixa, `robots.txt` continua
liberando a landing, seção de segmentos intacta.

---

### 7.2.18 Geocodificação: troca de provedor e lote — 18/08/2026

**O gargalo.** A importação de planilha não geocodifica, e o backfill do cron
processava ~10 endereços por dia (limite de 1 req/s do Nominatim, dentro de um
orçamento de 25s). Uma empresa que importasse 800 clientes esperaria meses até
o mapa encher — e o mapa é um dos motivos de assinar. Este era o único item do
Nível 1 ainda aberto.

**Por que Geoapify, e por que Google está fora.** O decisivo não é preço, é o
direito de GUARDAR a coordenada: o sistema grava lat/long no `Address` e desenha
num Leaflet com tiles do OpenStreetMap.

| Provedor | Guardar | Mapa de terceiro | Situação |
|---|---|---|---|
| Google | não (cache restrito) | exige mapa do Google | inviável sem reescrever o mapa |
| HERE / TomTom | 30 dias | ok | inviável |
| Azure Maps | só com conta ativa | restringe | inviável |
| Geocodio | sim, irrestrito | ok | só EUA/Canadá |
| Mapbox permanente | sim | "preferencialmente mapa Mapbox" | US$ 5/mil |
| **Geoapify** | **sim** | **ok** | **grátis até 3.000 créditos/dia** |

O que se ganha é o LIMITE, não a precisão: Geoapify, LocationIQ e OpenCage são
todos OpenStreetMap — o mesmo dado do Nominatim. Se um dia a queixa for "o pino
cai na rua errada", nenhum deles resolve; o caminho seria o CNEFE do IBGE
(base do pacote `geocodebr`, do IPEA).

**Custo real medido:** 1 requisição = 1 crédito, lote custa metade. O grátis
comporta ~1.500 endereços/dia com a cascata. Para estourar seria preciso
geocodificar 1.500 endereços TODO dia — cerca de 5 empresas novas por dia.

**O lote é assíncrono**, e é isso que molda o desenho: uma execução envia, a
seguinte colhe. O job fica em `GeocodeBatch`; sem guardá-lo, um lote mais
demorado que o orçamento da função seria abandonado e reenviado todo dia para
sempre — o mapa nunca encheria e nada avisaria ninguém. Um lote em voo por vez,
de propósito: o pior caso vira "demora mais um dia", nunca "gastou a cota do mês
numa madrugada".

**Inanição da fila** (achado ao revisar o próprio desenho): endereço que nunca
resolve — cidade digitada errada — ficaria na frente da fila para sempre,
ocupando as vagas do lote e impedindo endereço NOVO de ser processado. Daí
`Address.geocodeTries`: a fila ordena por ele, e há teto de 6 tentativas.
Editar o endereço zera o contador, então corrigir a digitação devolve o cliente
para a fila.

**Defeito de produção corrigido junto.** `updateClient` geocodificava em TODA
edição e, quando a consulta falhava (tempo limite, provedor fora do ar),
gravava `null` — **apagando a coordenada que já existia**. Trocar o telefone de
um cliente podia tirá-lo do mapa, sem erro nenhum na tela. Agora só consulta
quando rua/número/cidade/UF mudam, e nunca sobrescreve coordenada boa com nula.

**Reserva:** sem `GEOAPIFY_API_KEY` tudo continua no Nominatim, um a um. Trocar
de provedor não pode ser um degrau onde o sistema fica sem geocodificação.

**Pendência operacional do dono:** criar conta no Geoapify e definir
`GEOAPIFY_API_KEY` na Vercel (Production e Preview), depois redeploy — env var
nova só vale em deploy novo (seção 9, item 18). Enquanto isso o sistema roda no
Nominatim, como antes. Vale também confirmar por escrito com o suporte deles a
cláusula de armazenamento permanente: está na documentação e no material
comercial, não em cláusula nominal dos Termos.

399 testes.

---

### 7.2.19 Recurso avulso pelo painel e primeiros passos guiados — 18/08/2026

**Conceder recurso sem tocar no banco.** Liberar um item pago para uma empresa
específica só era possível editando `extraFeatures` direto em produção. Isso
aconteceu duas vezes com a mesma cliente — assinatura digital (10/08) e Mapa
GPS (18/08) — e nenhuma das duas ficou registrada em lugar nenhum. Agora é o
botão **Recursos** na linha da empresa, com permissão própria
(`concederRecurso`, dada a quem já podia trocar plano — é estritamente menos
poderoso) e log de auditoria dizendo o que entrou e o que saiu.

A ação recebe o estado FINAL, não um incremento: conceder e revogar viram a
mesma operação, e não existe caminho em que a tela e o banco discordem sobre o
que foi tirado. Valor desconhecido é peneirado, o que o plano já dá não é
duplicado nos extras, e "nada mudou" não gera linha de log.

**Sobre "liberar todas as abas".** Levantado ao atender o pedido: das 17 abas,
**15 já aparecem** para todo OWNER/ADMIN de qualquer empresa. Só Mapa e Fiscal
dependem de recurso. E esconder uma aba hoje seria **cosmético** —
`getAllowedTabs` alimenta só o menu, e a URL continua digitável (as duas
páginas travadas se defendem por conta própria, via `requireRecurso`). Por
isso o diálogo mostra a lista de abas como INFORMAÇÃO, reagindo ao vivo aos
recursos marcados, e não como controle falso. Controle de aba por empresa de
verdade exigiria bloqueio em ~15 páginas — e tem armadilha: esconder
Assinatura tranca o cliente sem poder pagar.

**Primeiros passos guiados** (item 3 do Nível 1, o último em aberto). A empresa
assinava e encontrava tela vazia — e boa parte do que ela paga nasce
DESLIGADA por decisão nossa: PIX, termos, garantia, aviso ao cliente, campos
personalizados, vocabulário. Cada recurso somado aumentou a distância entre
"assinei" e "está configurado".

Os seis passos são DETECTADOS do banco, nunca marcados à mão: lista com
caixinha mente, some da tela sem o trabalho ter sido feito. Por consequência,
empresa que já roda não vê nada — não há exceção pra "cliente antigo", e
ninguém veterano é convidado a criar sua primeira OS. Um passo em destaque por
vez, com botão; os outros listados apagados — seis botões competindo viram
lista de tarefas, e lista de tarefas se ignora.

**Dois problemas achados no caminho, ambos invisíveis:**

| Achado | Sintoma |
|---|---|
| `reset()` dos testes truncava lista escrita à mão, defasada em 6 tabelas | Teste não quebra: passa a ver linhas do teste anterior, e o resultado depende da ORDEM de execução |
| `lib/plan.ts` importa Prisma; componente de cliente que só queria o nome dos recursos arrastava o driver do Postgres pro navegador | Build falha com `Can't resolve 'dns'`, que não diz nada sobre a causa |

O primeiro virou consulta ao catálogo do banco. O segundo motivou separar os
catálogos puros: `lib/recursos.ts` e `lib/abas.ts`, sem nenhum import de
servidor — `lib/plan.ts` e `lib/auth.ts` reexportam pra não quebrar quem já
importava de lá.

409 → 419 testes.

---

### 7.2.20 Estoque de peças e ordens de compra — 18/08/2026

Item 8 do Nível 2. Fecha o Nível 2 inteiro.

**A regra que sustenta o modelo: `Part.stock` NUNCA é editado direto.** Toda
mudança passa por um `StockMovement`, na mesma transação. Sem isso, histórico e
saldo passam a discordar e não há como saber qual dos dois está certo — que é
exatamente o momento em que a empresa para de confiar no estoque e volta pro
caderno.

`StockMovement.quantity` guarda a **variação com sinal** (+5 numa entrada, -2
numa saída, -3 num ajuste de 10 pra 7). Assim a soma dos movimentos de uma peça
tem que ser igual ao saldo dela — invariante testável, que um campo "quantidade
sempre positiva + tipo" não daria sem recalcular sinal em toda leitura.

Três decisões que mudam o comportamento:

| Decisão | Por quê |
|---|---|
| **AJUSTE define o saldo, não soma** | Quem conta a prateleira e acha 7 quer que fique 7. É o erro mais comum de sistema de estoque, e a tela mostra o saldo resultante antes de confirmar |
| **Saldo negativo é permitido** | O serviço aconteceu no mundo real. Recusar o registro porque o cadastro estava desatualizado só faz a empresa parar de registrar. O negativo fica visível como pendência |
| **Ajuste exige motivo** | Correção sem rastro é indistinguível de erro seis meses depois |

**Baixa pela OS.** `ServiceItem` ganhou `partId` opcional — item digitado na
hora (mão de obra, taxa) continua sendo o caminho normal. A peça sai do estoque
na **conclusão**, não na criação: antes disso ela ainda está fisicamente na
prateleira. É **idempotente** (a guarda é "já existe movimento desta OS?", pelo
índice `StockMovement.orderId`) porque a conclusão pode disparar mais de uma vez
— botão clicado duas vezes, OS reaberta. E **nunca lança**: OS concluída não
pode ser travada porque o estoque não fechou.

**Ordens de compra.** `Supplier` é separado de `Provider` de propósito: aquele é
prestador terceirizado que executa serviço; este é quem vende peça. Recebimento
é **parcial por item** — fornecedor mandar 8 de 10 é a regra, não a exceção, e
um sistema que só aceita "tudo ou nada" faz a empresa parar de registrar. Cada
item recebido vira ENTRADA na mesma transação em que o recebido é atualizado, e
o custo da peça é atualizado com o que foi pago agora.

Compra já recebida (total ou parcial) **não se cancela**: o estoque já entrou, e
desfazer daqui deixaria saldo e histórico discordando. Devolver ao fornecedor é
um movimento de saída, que fica registrado como tal.

**Plano.** Recurso novo `stock`, Pro+, destravando as duas abas juntas — ordem
de compra sem catálogo não tem o que comprar, e catálogo sem compra vira
digitação manual eterna. Concedível avulso a qualquer cliente pelo botão
Recursos do painel (7.2.19).

Um teste de plano que travava a contagem em 5 recursos foi reescrito: agora
compara com o catálogo inteiro, e ganhou o contraponto "Starter NÃO ganha
recurso novo por descuido" — o alarme que impede a diferença entre R$ 97 e
R$ 397 de evaporar em silêncio.

419 → 451 testes.

---

### 7.2.21 Histórico de alteração da OS — 18/08/2026

Item 9 do Nível 3.

Até aqui existia log de auditoria do painel da plataforma (`AdminAuditLog`,
7.2.9) mas **nenhum** dos dados do cliente. Quando aparecesse discussão — "esse
valor não era esse", "quem cancelou?", "o técnico era outro" — não havia como
saber quem mudou o quê nem quando. Numa empresa de serviço isso não é
curiosidade: é a diferença entre resolver em um minuto e perder o cliente.

**Nem toda mudança vira evento.** Registrar cada campo enterraria os que
importam no meio de ruído, e histórico que ninguém lê é o mesmo que não ter
histórico. Entram seis: status, responsável, agendamento, valor, conclusão e
garantia. Salvar a OS sem tocar em nada não gera linha nenhuma.

Três decisões que aparecem no comportamento:

| Decisão | Por quê |
|---|---|
| **`actorName` é texto, não só FK** | O registro precisa continuar legível depois que a pessoa sai da empresa. Guardar só o id faria a linha do tempo virar "responsável mudou para cmr04…" justamente quando alguém for consultá-la |
| **Valor comparado como número** | `"100"` e `"100.00"` são o mesmo dinheiro; comparar como texto geraria um evento a cada gravação e em um mês o histórico ficaria ilegível |
| **Da conclusão guarda só QUE mudou** | São parágrafos inteiros. Duplicá-los incharia a tabela sem ajudar ninguém — o texto atual está na própria OS |

Status é o único campo cujo valor guardado é um **código**, traduzido na tela —
senão o histórico ficaria em português numa conta em inglês. Os demais já são
gravados legíveis.

A gravação **nunca lança**: histórico é registro do que aconteceu, não parte do
que está acontecendo. Falhar aqui não pode impedir o técnico de concluir a OS
no meio da rua — um histórico com buraco ainda é melhor que uma OS que não
fecha.

Ganchos em `createServiceOrder`, `updateOrderStatus`, `completeServiceOrder` e
`updateServiceOrder`.

451 → 463 testes.

---

### 7.2.22 Backup testado — 18/08/2026

Item 12 do Nível 3, e o único da lista cuja falha é irreversível.

O ponto de partida: "o Supabase faz backup, mas ninguém nunca tentou
restaurar". Backup não testado não é backup — é um arquivo que ninguém sabe se
presta, e a hora de descobrir é a pior hora possível.

**O que existe agora**, três comandos:

| Comando | O quê |
|---|---|
| `npm run backup` | Exporta o banco inteiro para `backups/<data>/`: um `.jsonl` por tabela e um `manifest.json` com contagem por tabela e a última migration |
| `npm run backup:provar <pasta>` | Sobe um Postgres **descartável em memória**, aplica o schema, carrega o backup e confere linha a linha. Sem risco, sem credencial, sem banco de ensaio |
| `npm run backup:restaurar <pasta>` | Restauração num banco de verdade, com trava contra escrever em produção e confirmação digitada |

**A ordem de carga vem do catálogo do banco**, nunca de lista escrita à mão.
Essa lição já custou caro aqui: o `reset()` dos testes usava lista fixa e ficou
defasado em seis tabelas sem ninguém notar (7.2.19). Num restore o sintoma
seria pior — a carga falha por chave estrangeira, ou alguém desliga a checagem
"pra funcionar" e restaura dado órfão.

**Um defeito de corrupção silenciosa, achado pelo próprio teste.** A primeira
versão devolvia toda data **três horas adiantada** — exatamente o fuso de
Brasília. Causa: o driver lê coluna `timestamp` (sem fuso) interpretando no
fuso LOCAL, mas grava de volta em UTC. Cada ciclo de backup e restauração
deslocaria todas as datas do sistema. A correção é ler data/hora como TEXTO no
próprio Postgres (`selectDeColunas`), tirando o fuso da conta. É a prova de que
o teste de ida e volta se paga: sem ele, isso só apareceria numa restauração de
emergência, com as datas erradas e ninguém entendendo por quê.

**Executado de verdade**: backup de produção com 34 tabelas e 125 linhas,
verificado com sucesso. Não é mais "temos backup" — é "o backup restaura, e
está provado".

Por que não `pg_dump`: não está instalado em toda máquina, e a versão do
cliente precisa casar com a do servidor. O custo de não usá-lo é não trazer
objetos de banco além de dados — aceitável porque o schema já é reproduzível
pelas migrations (reparadas em 12/06) e isso é verificado pelo próprio ciclo.

`backups/` e `.env.restore` entraram no `.gitignore`: o arquivo contém dados
pessoais de clientes finais de terceiros.

463 → 483 testes.

**O que continua sendo do dono**, e nenhum script resolve:

- Confirmar no painel do Supabase qual retenção o plano atual dá.
- Guardar uma cópia FORA do Supabase — se a conta for perdida, o backup dele
  vai junto.
- Rodar `npm run backup` com alguma regularidade. Um backup de três meses atrás
  restaura, mas restaura o negócio de três meses atrás.

---

### 7.2.23 Monitoramento ativo — 19/08/2026

Item 11 do Nível 3. Fecha o Nível 3, exceto a página de status pública (13).

O ponto de partida: o Sentry pega exceção, mas ninguém é avisado quando o site
simplesmente para de responder às 2h da manhã — nem quando o cron diário morre
em silêncio. **Silêncio é indistinguível de sucesso**, e essa é a pior
propriedade que um sistema de fundo pode ter.

**O que decide o desenho:** um monitor que roda na mesma infraestrutura que
monitora não serve. Se a Vercel cair, um cron da Vercel não avisa ninguém. A
checagem de fora é, obrigatoriamente, serviço de terceiro. O que este trabalho
faz é dar a ela algo honesto para encontrar.

**`GET /api/health`** — pública (monitor não faz login), sem nenhum dado de
negócio no corpo. Verifica dois sinais:

| Sinal | Como |
|---|---|
| Banco | Uma consulta trivial. Se não responde, degradado |
| Cron | Última execução BEM-SUCEDIDA. Mais velha que 26h, degradado |

O detalhe que faz tudo funcionar: **503 quando degradado**. Monitor de uptime
alerta em resposta não-2xx e não lê corpo por padrão — devolver 200 com
`{"estado":"degradado"}` seria bonito e completamente inútil.

O cron é o sinal que de fora ninguém consegue enxergar: o site responde, tudo
parece bem, e há três dias ninguém recebe aviso de cobrança, contrato
recorrente não gera OS e coordenada não é preenchida. Por isso a tabela
`CronRun` registra cada execução, e `ok = false` quando houve **qualquer**
erro — cron que falha metade e conta como sucesso é pior que cron que não
roda, porque ninguém investiga.

**Tolerância de 26h, não 24.** A Vercel não garante o minuto exato, e um
atraso de meia hora não é queda. Alarme que dispara por atraso normal é alarme
que a pessoa aprende a ignorar — e aí ele deixa de funcionar justamente no dia
real. Pelo mesmo motivo, sistema recém-implantado que ainda não teve um cron
**não** nasce vermelho: só vira problema depois de ter passado tempo
suficiente para um cron ter acontecido.

**E-mail ao dono quando o cron falha.** Até aqui o erro era contado numa
variável e esquecido — o resultado ficava no corpo de uma resposta HTTP que
ninguém lê.

483 → 494 testes.

**O que só o dono pode fazer**, e sem o que nada disto alerta:

1. Contratar um monitor externo (UptimeRobot, Better Stack e similares têm
   plano grátis suficiente para isto).
2. Apontar para `https://servicoos.com.br/api/health`, intervalo de 5 minutos.
3. Configurar o alerta para o **celular**, não só e-mail — às 2h da manhã o
   e-mail não acorda ninguém.
4. Conferir que `SUPER_ADMIN_EMAIL` está definida em Production, senão o aviso
   de falha do cron não tem para onde ir.

Enquanto o passo 1 não for feito, a rota existe e ninguém a consulta — o que
é exatamente o mesmo que não ter monitoramento.

---

## 8. Infraestrutura e deploy

- **Hospedagem:** Vercel, projeto `adriel5/app`, região `gru1`
- **Deploy (CD):** **manual** — apesar do projeto aparecer conectado ao GitHub no dashboard da Vercel, na prática não dispara deploy automático (descoberto 21/07/2026, ver seção 9 item 14: 16-18 dias sem nenhum deploy novo apesar de dezenas de pushes). Deploy real é via `npx vercel --prod --yes` (CLI autenticada como o usuário) — rodar manualmente após cada push que deva ir pra produção, e novamente após qualquer `vercel env add` (env var nova só entra em vigor num redeploy — item 18)
- **CI:** `.github/workflows/ci.yml` — a cada push (`master`, `improve/readme`) e PR pra `master`, roda `npm ci && npm run lint && npm test && npm run build` num runner limpo. `npm test` não precisa de nenhum segredo real (banco embutido, ver item "Testes automatizados" abaixo); `npm run build` usa valores fictícios pras env vars só pra passar no `prisma generate`/`next build`, já que nenhuma página faz fetch no banco em build time
- **Build de produção (`vercel.json`):** `prisma generate && prisma migrate deploy && next build` — simplificado em 03/08/2026 (o patch `migrate resolve` acumulado de várias migrations passou do limite de 256 caracteres do `buildCommand` da Vercel; confirmado via `prisma migrate status` que os resolves já aplicados ficam gravados permanentemente no banco, não precisam ser reafirmados a cada build)
- **Build local (`package.json`):** `prisma generate && next build` — **não roda `migrate deploy`**. Mudança de schema feita localmente não sobe pro banco de produção sozinha (ver seção 9, item 9)
- **Cron:** `/api/cron/daily` às 12:00 UTC (09h BRT) via `vercel.json`
- **Migrations:** Prisma Migrate — aplicadas de verdade só no build da Vercel (`migrate deploy`), nunca no build local nem no CI
- **Testes automatizados:** Vitest + PGlite (Postgres real compilado pra WASM, roda embutido no processo — sem Docker, sem conta externa, sem tocar no banco de produção). `npm test` — ver seção 9, item 13

---

## 9. Decisões técnicas e "gotchas" (aprendidos na prática)

Estes pontos custaram tempo real de debug — não repetir os mesmos caminhos:

1. **Env vars recicladas na Vercel ficam vazias.** Um nome de variável que já foi removido (`vercel env rm`) e recriado fica permanentemente vazio em produção, mesmo com o valor certo. Sempre usar um nome **novo** ao trocar um segredo. A chave do Asaas por isso vive em `ASAAS_TOKEN_B64` (base64, nome nunca reciclado).
2. **PIX não é permitido como `billingType` de assinatura** nesta conta Asaas (só para cobrança avulsa). Usar `UNDEFINED` (cliente escolhe boleto/cartão na fatura) — exige `cpfCnpj` no cadastro do cliente.
3. **`/auth/v1/admin/invite` do Supabase foi descontinuado** — retorna 404 em texto puro (não JSON), quebra qualquer `res.json()` sem try/catch. Usar `/auth/v1/admin/generate_link` com `type: "invite"` (mesmo formato de resposta).
4. **Região das funções importa de verdade.** Rodar em região diferente do banco causa latência perceptível em toda a navegação — sempre colocar a função no mesmo datacenter do banco.
5. **`no-scrollbar` sem CSS correspondente** escondia a existência de scroll na sidebar sem indicar visualmente — itens "sumiam" em telas menores. Scrollbar precisa ser visível, não só funcional.
6. **Condição de corrida na criação automática de tenant.** Múltiplas Server Components chamando a mesma função de auto-provisionamento em paralelo no primeiro login podiam criar tenants duplicados órfãos. Corrigido tratando unique constraint violation como "outra requisição já venceu a corrida".
7. **TLS quebrado no ambiente de dev local** (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, provavelmente antivírus interceptando HTTPS) — não acontece em produção. Não gastar tempo tentando corrigir isso no código.
8. **`.next` acumula cache indefinidamente** — em projetos de várias semanas, pode chegar a vários GB. Limpar com `rm -rf .next` de vez em quando é normal e seguro.
9. **Mudança de schema local não sobe sozinha pra produção.** O build local só roda `prisma generate && next build` (sem `migrate deploy`) — só o build da Vercel aplica migrations de verdade no banco. Se uma mudança de schema for aplicada localmente via `prisma db push` (necessário quando `migrate dev` detecta drift — item 10) e precisar estar no banco antes do próximo deploy, rodar também `prisma migrate resolve --applied <nome_da_migration>` — senão o `migrate deploy` da Vercel tenta rodar o SQL de novo e falha (`already exists`), quebrando o build de produção. Foi o que aconteceu com a migration `20260719214104_add_pending_subscription_status` (seção 7.1), resolvido manualmente antes do próximo deploy.
10. **Histórico de migrations do Prisma está com drift em relação ao schema real de produção** (descoberto 19/07/2026: `prisma migrate dev` detectou que reconstruir o schema do zero a partir das migrations não bate com o banco real, e só ofereceu `migrate reset` — que **apaga todos os dados** — como saída). Causa provável: alguma mudança de schema foi aplicada via `db push` no passado sem gerar a migration correspondente; é o que já exigiu o patch permanente `migrate resolve --applied 20260630000001_add_rbac_push_location || true` no `buildCommand` da Vercel. **Nunca rodar `prisma migrate dev` neste projeto sem entender esse contexto** (ele conecta no mesmo banco de produção — não há banco de dev separado). Usar `prisma db push` pra sincronizar schema localmente, sempre seguido de `prisma migrate resolve --applied <nome>` antes do próximo deploy (item 9). Reconciliar esse drift de vez é trabalho futuro — ver débito técnico (seção 10).
11. **Nunca confiar em `user.user_metadata` do Supabase pra decisões de autorização.** É editável pelo próprio usuário autenticado via `supabase.auth.updateUser({data:{...}})` no client-side SDK — qualquer lógica server-side que leia esses campos pra decidir tenant/papel/permissão é, por definição, controlável por quem estiver logado. Foi a causa raiz da vulnerabilidade crítica corrigida em 19/07/2026 (seção 7.1: usuário podia se declarar OWNER de qualquer tenant). A fonte de verdade pra tenant/papel é sempre o registro `User` no Postgres, criado/atualizado só por código server-side com a service role key.
12. **Toda função exportada de um arquivo `"use server"` já é um endpoint HTTP despachável, mesmo que nenhum componente client a importe.** Confirmado na 2ª auditoria (seção 7.2) inspecionando o `server-reference-manifest.json` gerado no build: `getFinanceSummary` (chamada só de dentro de um Server Component) já tinha um Action ID registrado e despachável pelo dispatcher do Next.js — só não estava *descoberto* por nenhum client ainda, o que é bem diferente de estar protegido. Um redirect na página que chama a função, ou o fato de "hoje nada do lado client importa isso", não é controle de acesso — é só o ID não ter vazado ainda (log, source map, erro verboso, um teammate non-admin). Toda Server Action que mexe em dado sensível precisa checar `role`/`tenantId` **dentro de si mesma**, nunca só confiar em quem a chama.
13. **Testes de integração sem Docker: PGlite + `prisma migrate diff --from-empty` em vez de replay de `prisma/migrations/*.sql`.** Ao montar a infra de testes (roadmap #6), replay do histórico de migrations do zero falhou (`type "SubscriptionStatus" does not exist`) — confirmação na prática do drift do item 10. Contornado sem tocar no histórico de produção: `npm run pretest` gera `src/test-utils/test-schema.sql` direto do `schema.prisma` atual via `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (arquivo não versionado, sempre em sincronia). `@electric-sql/pglite` roda um Postgres real (WASM) embutido no processo Node — zero Docker, zero conta externa, zero risco pro banco de produção. Server Actions são testadas mockando `@/lib/prisma` (aponta pro client PGlite) e `@/lib/auth`'s `getTenant()` (simula `{tenantId, role}` do chamador); `redirect()`/`revalidatePath()` são mockados globalmente (`vitest.config.ts` → `setupFiles`) porque exigem o "static generation store" do Next.js, que não existe em teste puro Node.
14. **"Vercel conectada ao GitHub" não significa deploy automático de verdade — checar sempre pelo histórico real de deployments, nunca só por confirmação verbal ou pela tela de configuração.** Ao montar o CI/CD (roadmap #7, 20/07/2026) foi assumido, com base em confirmação direta do usuário, que a Vercel fazia deploy automático a cada push nesta branch — por isso o GitHub Actions ficou só com CI, sem step de deploy. Descoberto em 21/07/2026 que isso era falso na prática: o site em produção mostrava conteúdo de ~16 dias atrás (`x-vercel-cache: HIT` com `age` de 1,4M+ segundos; `vercel ls` mostrando os 20 deploys mais recentes — todos manuais via CLI, todos do mesmo usuário, todos de 16-18 dias atrás, nenhum em ambiente Preview; zero deployments/status checks da Vercel em qualquer commit recente no GitHub). Ou seja, nenhum push desta sessão inteira (segurança, rate limiting, testes, CI, remoção do trial) tinha de fato chegado a produção, apesar da CI passando a cada push. Corrigido rodando `vercel --prod` manualmente (CLI já autenticada como o usuário). **Lição:** "está conectado" no dashboard e "dispara deploy automático de verdade" são coisas diferentes — pra confirmar a segunda, olhar `vercel ls`/o histórico real de deployments, não só a tela de configuração ou perguntar.
16. **Domínio novo adicionado na Vercel não garante emissão automática do certificado SSL em tempo hábil.** Confirmado em 05/08/2026: DNS propagado e correto (`nslookup` batendo com o A record da Vercel) não foi suficiente — o site ficou fora do ar por ~7h, e `vercel certs ls` mostrava zero certificados pro domínio (não "ainda processando", literalmente nunca tentou). Verificação rápida e reaproveitável: `vercel certs ls` — se não aparecer o domínio depois de um tempo razoável, forçar com `vercel certs issue <domínio>` em vez de só esperar.
17. **`id` duplicado entre dois formulários renderizados na mesma página quebra a associação `label for=`** (o navegador resolve pro primeiro elemento com aquele id — clicar no label do segundo campo foca o campo errado). Achado em `/settings` (`TenantForm` e `ProfileForm` ambos usando `id="name"`/`"document"`/`"phone"`). Ao adicionar um novo formulário numa página que já tem outro, conferir que nenhum `id` colide.
18. **Env var nova na Vercel não entra em vigor na build já rodando — precisa de um redeploy depois de `vercel env add`.** Confirmado ao configurar o `ASAAS_WEBHOOK_SECRET` pendente (seção 7.1) em 21/07/2026: adicionar a variável via CLI não foi suficiente sozinho, foi preciso rodar `vercel --prod` de novo pra ela ficar disponível no runtime. Verificação simples e reaproveitável pra qualquer secret novo: `POST` na rota que o usa sem o header/valor esperado (deve dar 401/erro) e com o valor certo (deve dar 200) — comparar antes/depois do redeploy.

---

## 10. Débito técnico conhecido

- WhatsApp (Z-API): schema e UI prontos, integração nunca finalizada (único item do roadmap original ainda em aberto)
- Histórico de migrations do Prisma com drift em relação ao schema real de produção (ver seção 9, itens 10 e 13) — funciona hoje com workaround manual (`db push` + `migrate resolve --applied`) tanto pra deploy quanto pra testes, mas a reconciliação de verdade (fazer o histórico bater com o schema real) continua pendente
- Bônus de indicação via `user_metadata.ref_code` no cadastro (`/register?ref=CODE`) sem rate-limit/captcha — decisão consciente de não corrigir agora (ver seção 7.2); o cadastro base já não tem essa proteção independente de indicação, então o risco real é baixo
- Ícones do PWA quebrados: `manifest.json` referencia `/icon-192.png` e `/icon-512.png`, nenhum dos dois existe em `public/` — achado ao procurar uma imagem pra usar no Open Graph (roadmap #3). App instalável fica com ícone quebrado
- Sem imagem `og:image` (1200x630) — preview ao compartilhar link fica só texto. Precisa de asset de design real, não dá pra gerar
- Cobertura de testes automatizados ainda pequena (16 testes, 3 arquivos — `rate-limit.ts`, `clients.ts`, `quotes.ts`) — infraestrutura pronta e validada (seção 9, item 13), mas a maior parte das Server Actions (principalmente `service-orders.ts`, `nfse.ts`, `billing.ts`) ainda não tem teste cobrindo isolamento entre tenants/checagem de papel

---

## 11. Roadmap priorizado

Itens #2-#7 do roadmap anterior (rate limiting, SEO básico, exportação LGPD,
decisão sobre Plano Gratuito, testes automatizados, CI/CD) foram concluídos
em 20/07/2026 — detalhes na seção 7.2, seção 9 (itens 13-14) e commits
correspondentes. Plano Gratuito: decisão foi remover a ideia (na época, o
trial de 15 dias cobria esse papel; o trial em si foi removido depois, em
21/07/2026 — ver seção 1.1).

Modo claro/escuro (05/08/2026) e suporte a PT/EN (07/08/2026) foram
concluídos — ver seção 12.

| # | Item | Por quê |
|---|---|---|
| 1 | Ativar WhatsApp (Z-API) | Pendência mais antiga, diferencial de venda citado na própria landing page |
| 2 | Reconciliar drift de migrations | Pré-requisito real pra confiar 100% em `migrate deploy`/CI futuro (ver seção 9, itens 10 e 13) |
| 3 | Expandir cobertura de testes | Infra pronta (seção 9, item 13) — faltam testes para `service-orders.ts`, `nfse.ts`, `billing.ts` |
| 4 | Ícones PWA + imagem `og:image` | Precisa de asset de design real (192x192, 512x512, 1200x630) |
| 5 | Decidir sobre bônus de indicação sem rate-limit | Risco baixo hoje, mas fica registrado pra decisão consciente (ver seção 7.2) |
| 6 | Traduzir os textos de marketing com revisão humana | O EN de hoje foi traduzido por IA e não passou por revisão de um falante nativo — aceitável pra funcionar, arriscado pra copy de vendas |

---

## 12. Internacionalização (PT/EN) e tema claro/escuro

**Modo claro/escuro (05/08/2026).** O tema claro já existia inteiro no CSS
(shadcn/ui gera os dois desde o início do projeto), só nunca tinha sido
ativado — `<html>` ficava travado em `className="dark"`. Faltava só o
mecanismo de troca: script inline no `<head>` decide antes da hidratação
(localStorage, com fallback pro `prefers-color-scheme` do sistema) pra não
piscar a cor errada, e um toggle no rodapé da sidebar.

**PT/EN (07/08/2026).** next-intl, 29 namespaces, ~1090 chaves com paridade
exata entre `pt` e `en`. 116 arquivos migrados: landing, auth, as 16 abas do
dashboard, portal público do cliente, e-mails, PDFs, mensagens de WhatsApp,
push notifications e mensagens de erro/validação.

**Como o idioma é resolvido.** `Tenant.locale` é a fonte de verdade: toda a
equipe e tudo que é gerado pra aquela empresa (e-mail, PDF, WhatsApp) sai no
mesmo idioma, mesmo disparado fora de um navegador. `src/i18n/request.ts`
centraliza isso — com sessão, lê o tenant; sem sessão (páginas públicas), cai
pro cookie `locale`. Contextos que rodam fora do request do Next.js (e-mails
via cron/webhook, PDFs via `renderToBuffer`, WhatsApp, portal público)
recebem o locale explícito via `getTranslator(locale, ns)` em `lib/i18n.ts`,
porque `getTranslations()` não tem de onde resolver ali.

**Mensagens de validação do zod.** Schemas vivem no escopo do módulo, sem
request context, então guardam *códigos* (`"nameRequired"`) em vez de frases.
`lib/validation.ts` traduz logo depois do `safeParse`, no idioma de quem
chamou. Sem isso o formulário exibiria o código cru — pior que o português
fixo que havia antes.

### 12.1 Dois modos de falha que o typecheck não pega

A migração rodou com ~22 agentes em paralelo, e os dois problemas mais
sérios passaram limpos por `tsc`, lint e build:

1. **Escritas concorrentes no mesmo `messages/*.json` se sobrescreveram.**
   Os namespaces `team`, `schedule` e `billingReferral` sumiram inteiros:
   os agentes migraram os `.tsx` e gravaram as traduções, mas um escritor
   posterior salvou por cima (lost update clássico). As telas de Equipe,
   Agenda, Assinatura e Indicação ficaram apontando pra texto inexistente —
   e **o typecheck passou limpo**, porque next-intl não valida chave contra
   arquivo em tempo de compilação. Recuperados do journal do workflow, sem
   reprocessar agentes.

2. **~100 textos ficaram em português fixo** depois da migração
   "concluída" — entre eles a **página `/expired` inteira** (a tela que todo
   cliente sem assinatura vê), os rótulos das abas em Permissões e as
   mensagens de WhatsApp enviadas aos clientes finais.

**Lição:** num trabalho de i18n, "compila e o build passa" não é evidência
de nada. Duas verificações independentes fecham isso, e valem pra qualquer
mudança futura em tradução — rodar as duas antes de considerar pronto:

- casar **cada chave usada no código** contra os dois idiomas (hoje: 1148
  chaves em 102 arquivos, 0 não resolvidas);
- varrer **texto acentuado fora de comentários**, pra achar o que nunca
  chegou a virar chave.

Um terceiro cuidado, mais barato: comparar a contagem de folhas de `pt.json`
e `en.json` — divergência ali denuncia tradução faltando num dos lados.

### 12.2 Gotchas específicos

- **`str.replace` do Python substitui todas as ocorrências**, não a primeira.
  Ao aplicar edições em lote em Server Actions, isso inseriu a mesma
  declaração de tradutor duas vezes na mesma função. Usar `count=1` quando a
  substituição carrega uma declaração junto.
- **Detectar comentário com regex de `//` é frágil** — a primeira versão do
  verificador deixava comentários passarem e inflava a contagem de "texto
  pendente" de 20 pra 204, escondendo os achados reais no meio do ruído.
  Checar prefixo da linha (`//`, `*`, `/*`) é mais confiável.
- **Componente criado ≠ componente ligado.** O `PublicLanguageToggle` existia
  e funcionava, mas não estava referenciado em lugar nenhum: trocar de idioma
  deslogado só era possível editando o cookie na mão. Só apareceu no teste
  em produção, clicando na tela — nenhuma verificação estática pegaria isso.

---

## 13. Como este documento deve ser mantido

Atualizar este arquivo sempre que:
- Uma nova integração externa for adicionada
- Uma decisão de arquitetura importante for tomada ou revertida
- Um "gotcha" caro em tempo de debug for descoberto
- Um item do roadmap for concluído (mover pra seção 5, remover da seção 11)
