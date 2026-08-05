# Plano de Engenharia — ServiçoOS

> Última atualização: 05/08/2026
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
| E-mails de boas-vindas/onboarding convidam "responda este e-mail" mas o remetente é `noreply@` sem reply-to | `reply-to: suporte@servicoos.com.br` em todos os envios (ver débito técnico — endereço ainda sem hospedagem de e-mail de verdade) |
| `nfeio.ts` lia a API key no escopo do módulo (padrão diferente do resto, que adia a leitura de propósito) | Movido pra dentro da função |
| Cron do dia-3 calculava a janela com hora local do servidor (UTC), não horário de Brasília — mesma classe de bug já corrigida em dashboard/finance/reports | `todayInBRT`/`brtMidnightUTC` aplicados |
| Portal público permitia reassinar (trocar a assinatura) de uma OS já faturada | Bloqueado, mesmo padrão de `completeServiceOrder`/`updateServiceOrder` |
| Typo "ordems" (em vez de "ordens") na contagem de OS/OM — plural de "ordem" no PT-BR não é regular | Corrigido |
| `id` HTML duplicado (`name`, `document`, `phone`) entre `TenantForm` e `ProfileForm`, ambos renderizados juntos em `/settings` — quebra a associação `label for=` (clicar no label focava o campo errado) | `id`s do `ProfileForm` prefixados (`profile-name`, etc.) |

**Achado não resolvido, precisa confirmação manual:** `api/webhooks/supabase/route.ts` é um SEGUNDO caminho de criação de tenant/usuário (Database Webhook do Supabase no INSERT de `auth.users`), independente do `getTenant()` — se estivesse configurado no painel do Supabase, venceria a corrida e criaria a conta sem e-mail de boas-vindas nem crédito de indicação. `WEBHOOK_SECRET` está configurado na Vercel há 54 dias (não é código morto por falta de segredo). Desativado por segurança (virou no-op 200) até confirmar no painel do Supabase (Database Webhooks / Authentication → Hooks) se algo aponta pra essa rota — se não estiver, o hook pode ser removido de lá também.

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

- `suporte@servicoos.com.br` (usado como reply-to nos e-mails e em `/expired`) ainda não tem hospedagem de e-mail configurada — só existem registros DNS de *envio* (DKIM, MX do Resend em `send.servicoos.com.br`), não de recebimento na raiz do domínio. Hoje uma resposta de cliente pra esse endereço provavelmente bate/falha silenciosamente. Precisa de um MX real na raiz + uma caixa de fato (Google Workspace, Zoho Mail, etc.)
- `api/webhooks/supabase/route.ts` desativado (vira no-op) até confirmar no painel do Supabase se está mesmo configurado — ver seção 7.3
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

| # | Item | Por quê |
|---|---|---|
| 1 | Modo claro/escuro | Pedido explícito do usuário, 05/08/2026 — hoje `<html>` fica travado em `className="dark"` |
| 2 | Suporte a idioma PT/EN | Pedido explícito do usuário, 05/08/2026 — projeto grande, todo texto do sistema (UI, e-mails, PDFs) está em PT-BR fixo, sem infra de i18n |
| 3 | Confirmar/remover o Database Webhook do Supabase | Ver seção 7.3 — rota já desativada no código, falta confirmar no painel se existe algo apontando pra ela |
| 4 | Hospedagem de e-mail pra `suporte@servicoos.com.br` | Reply-to novo (seção 7.3) só funciona de verdade com MX + caixa configurados (ver débito técnico) |
| 5 | Ativar WhatsApp (Z-API) | Pendência mais antiga, diferencial de venda citado na própria landing page |
| 6 | Reconciliar drift de migrations | Pré-requisito real pra confiar 100% em `migrate deploy`/CI futuro (ver seção 9, itens 10 e 13) |
| 7 | Expandir cobertura de testes | Infra pronta (seção 9, item 13) — faltam testes para `service-orders.ts`, `nfse.ts`, `billing.ts` |
| 8 | Ícones PWA + imagem `og:image` | Precisa de asset de design real (192x192, 512x512, 1200x630) |
| 9 | Decidir sobre bônus de indicação sem rate-limit | Risco baixo hoje, mas fica registrado pra decisão consciente (ver seção 7.2) |

---

## 12. Como este documento deve ser mantido

Atualizar este arquivo sempre que:
- Uma nova integração externa for adicionada
- Uma decisão de arquitetura importante for tomada ou revertida
- Um "gotcha" caro em tempo de debug for descoberto
- Um item do roadmap for concluído (mover pra seção 5, remover da seção 11)
