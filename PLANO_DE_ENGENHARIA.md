# Plano de Engenharia — ServiçoOS

> Última atualização: 21/07/2026
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

**Pendência que virou ainda mais crítica:** `ASAAS_WEBHOOK_SECRET` continua sem configurar no Asaas/Vercel (seção 7.1) — sem isso, ninguém é liberado depois de pagar. Antes disso já era importante; agora é o único caminho de entrada no sistema inteiro.

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

**Pendências — ação manual fora do código:**
- Configurar `ASAAS_WEBHOOK_SECRET` no dashboard do Asaas (Integrações → Webhooks → Token de autenticação), mesmo valor do `.env` local
- Adicionar `ASAAS_WEBHOOK_SECRET` nas env vars de produção da Vercel — sem isso o webhook do Asaas rejeita tudo com 401 em produção

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

---

## 8. Infraestrutura e deploy

- **Hospedagem:** Vercel, projeto `adriel5/app`, região `gru1`
- **Deploy (CD):** automático — o projeto Vercel está conectado ao repositório GitHub, faz deploy a cada push (nativo, fora do GitHub Actions). Deploy manual via `npx vercel --prod --yes` continua disponível como alternativa pontual
- **CI:** `.github/workflows/ci.yml` — a cada push (`master`, `improve/readme`) e PR pra `master`, roda `npm ci && npm run lint && npm test && npm run build` num runner limpo. `npm test` não precisa de nenhum segredo real (banco embutido, ver item "Testes automatizados" abaixo); `npm run build` usa valores fictícios pras env vars só pra passar no `prisma generate`/`next build`, já que nenhuma página faz fetch no banco em build time
- **Build de produção (`vercel.json`):** `prisma generate && (prisma migrate resolve --applied 20260630000001_add_rbac_push_location || true) && prisma migrate deploy && next build` — o `migrate resolve` no meio é um patch permanente pra um drift de migration específico (ver seção 9, itens 9-10)
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
14. **Vercel já tinha integração nativa com o GitHub (deploy automático a cada push) — a documentação antiga deste arquivo dizia "deploy manual" e estava desatualizada.** Descoberto só ao montar o CI/CD (roadmap #7). Lição: **confirmar com o usuário como a infra realmente funciona hoje antes de assumir a partir de docs antigas** — este próprio arquivo é fonte de verdade só até a próxima vez que a realidade mudar sem ele ser atualizado junto.

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

| # | Item | Por quê |
|---|---|---|
| 1 | Ativar WhatsApp (Z-API) | Pendência mais antiga, diferencial de venda citado na própria landing page |
| 2 | Reconciliar drift de migrations | Pré-requisito real pra confiar 100% em `migrate deploy`/CI futuro (ver seção 9, itens 10 e 13) |
| 3 | Expandir cobertura de testes | Infra pronta (seção 9, item 13) — faltam testes para `service-orders.ts`, `nfse.ts`, `billing.ts` |
| 4 | Ícones PWA + imagem `og:image` | Precisa de asset de design real (192x192, 512x512, 1200x630) |
| 5 | Decidir sobre bônus de indicação sem rate-limit | Risco baixo hoje, mas fica registrado pra decisão consciente (ver seção 7.2) |

---

## 12. Como este documento deve ser mantido

Atualizar este arquivo sempre que:
- Uma nova integração externa for adicionada
- Uma decisão de arquitetura importante for tomada ou revertida
- Um "gotcha" caro em tempo de debug for descoberto
- Um item do roadmap for concluído (mover pra seção 5, remover da seção 11)
