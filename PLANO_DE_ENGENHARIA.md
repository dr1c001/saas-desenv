# Plano de Engenharia — ServiçoOS

> Última atualização: 19/07/2026
> Este documento é a referência técnica viva do projeto. Deve ser atualizado sempre que uma decisão de arquitetura importante for tomada.

---

## 1. Visão geral do produto

**ServiçoOS** é um SaaS de gestão para pequenas e médias empresas prestadoras de serviço (desentupidoras, assistências técnicas, elétrica, refrigeração, etc.) no mercado brasileiro.

**Proposta de valor:** substituir o controle manual via WhatsApp/planilha/papel por um sistema único que cobre todo o ciclo — orçamento, ordem de serviço, execução em campo, financeiro e nota fiscal.

**Modelo de negócio:** SaaS multi-tenant por assinatura, com teste grátis de 15 dias (sem cartão), 3 planos pagos (Starter/Pro/Enterprise) cobrados via Asaas.

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
| Indicação (referral) | `/referral` | Link único, dias extras de trial/assinatura |
| Painel admin | `/admin` | Visão de todos os tenants, MRR, alertas de trial (acesso restrito ao dono) |
| Configurações | `/settings`, `/settings/fiscal`, `/settings/permissions` | Dados da empresa, config fiscal (NFS-e), RBAC por aba |
| Bloqueio por trial vencido | `/expired` | Bloqueia tudo exceto `/billing` |
| Termos e Privacidade | `/terms`, `/privacy` | LGPD |
| Busca na sidebar | — | Filtra abas por nome |

**E-mails automáticos (via cron diário, 09h BRT):** boas-vindas, dica de onboarding (dia 3), trial expirando (D-3 e D-1), pagamento confirmado, convite de equipe, recuperação de senha, NPS pós-OS concluída.

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
- **Gap conhecido:** sem rate limiting em `/login` e `/register` (ver roadmap)
- **Gap conhecido:** portabilidade de dados (exigência LGPD, prometida na Política de Privacidade) ainda não tem mecanismo self-service

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

---

## 8. Infraestrutura e deploy

- **Hospedagem:** Vercel, projeto `adriel5/app`, região `gru1`
- **Deploy:** manual via `npx vercel --prod --yes` (sem CI/CD automatizado ainda — todo deploy é disparado por mim/Claude após build local limpo)
- **Build de produção (`vercel.json`):** `prisma generate && (prisma migrate resolve --applied 20260630000001_add_rbac_push_location || true) && prisma migrate deploy && next build` — o `migrate resolve` no meio é um patch permanente pra um drift de migration específico (ver seção 9, itens 9-10)
- **Build local (`package.json`):** `prisma generate && next build` — **não roda `migrate deploy`**. Mudança de schema feita localmente não sobe pro banco de produção sozinha (ver seção 9, item 9)
- **Cron:** `/api/cron/daily` às 12:00 UTC (09h BRT) via `vercel.json`
- **Migrations:** Prisma Migrate — aplicadas de verdade só no build da Vercel (`migrate deploy`), nunca no build local
- **Sem testes automatizados** — verificação hoje é manual (TypeScript + build + checagem de rotas + testes diretos de API)

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

---

## 10. Débito técnico conhecido

- Sem testes automatizados (unitários ou E2E)
- Sem CI/CD — deploy é manual
- Sem rate limiting em rotas públicas de auth
- Sem SEO básico (`sitemap.xml`, `robots.txt`, Open Graph)
- Sem mecanismo de exportação de dados (LGPD)
- Plano Gratuito: seed criado, nunca executado, fluxo de assinatura R$0 não tratado
- WhatsApp (Z-API): schema e UI prontos, integração nunca finalizada
- Histórico de migrations do Prisma com drift em relação ao schema real de produção (ver seção 9, item 10) — funciona hoje com workaround manual, mas precisa ser reconciliado antes de confiar em CI/CD automatizado (roadmap #7)

---

## 11. Roadmap priorizado

| # | Item | Por quê |
|---|---|---|
| 1 | Ativar WhatsApp (Z-API) | Pendência mais antiga, diferencial de venda citado na própria landing page |
| 2 | Rate limiting em login/cadastro | Fecha brecha de segurança real, implementação rápida |
| 3 | SEO básico (sitemap, robots.txt, OG tags) | Afeta descoberta orgânica e preview ao compartilhar link |
| 4 | Exportação de dados (LGPD) | Compromisso já assumido publicamente na Política de Privacidade |
| 5 | Decidir sobre Plano Gratuito | Definir se ainda faz sentido no funil antes de investir tempo nisso |
| 6 | Testes automatizados | Reduz risco conforme o sistema cresce |
| 7 | CI/CD | Reduz dependência de deploy manual |

---

## 12. Como este documento deve ser mantido

Atualizar este arquivo sempre que:
- Uma nova integração externa for adicionada
- Uma decisão de arquitetura importante for tomada ou revertida
- Um "gotcha" caro em tempo de debug for descoberto
- Um item do roadmap for concluído (mover pra seção 5, remover da seção 11)
