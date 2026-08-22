# ServiçoOS

SaaS de gestão para pequenas e médias empresas prestadoras de serviço no Brasil
— desentupidoras, assistências técnicas, elétrica, refrigeração. Substitui o
controle por WhatsApp, planilha e papel por um sistema que cobre o ciclo
inteiro: orçamento → ordem de serviço → execução em campo → financeiro → nota
fiscal.

Multi-tenant, por assinatura, cobrado via Asaas. Três planos (Starter, Pro,
Enterprise) e, desde 22/08/2026, ajuste por empresa em cima deles.

---

## Antes de mais nada: a escala real

**4 empresas · 6 clientes · 11 ordens de serviço · 7 receitas.** (22/08/2026)

Isto não é engano nem banco de desenvolvimento. O produto está bem à frente da
base de clientes, e é importante saber disso antes de abrir o código: decisões
que parecem exageradas para 11 registros foram tomadas pensando em não ter de
refazê-las depois, e otimizações que pareceriam óbvias foram **deliberadamente
não feitas** por não valerem a pena neste volume (estão listadas, com o número
em que passam a doer, na seção 7.2.30 do plano de engenharia).

---

## Por onde começar

| Você é | Leia primeiro |
|---|---|
| Engenheiro de software | [`PLANO_DE_ENGENHARIA.md`](PLANO_DE_ENGENHARIA.md) — 36 seções de decisão, cada uma com o *porquê* |
| Analista de dados | [`app/prisma/schema.prisma`](app/prisma/schema.prisma) — 39 modelos, comentados |
| Quem vai mexer no código | Este arquivo até o fim, principalmente **Armadilhas** |

O plano de engenharia é o documento principal, e não um resumo: registra o que
foi feito, por que, e o que foi deliberadamente deixado de fora. Quando o
código e o plano discordarem, o código está certo e o plano está desatualizado
— avise.

---

## Rodar localmente

```bash
cd app
npm install
npm run dev
```

Precisa de um `.env.local` com as variáveis abaixo. **Nenhuma delas está no
repositório** e nenhuma deve entrar:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres (Supabase) |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | autenticação |
| `SUPABASE_SERVICE_ROLE_KEY` | operações server-side |
| `ASAAS_TOKEN_B64` · `ASAAS_WEBHOOK_SECRET` | cobrança |
| `RESEND_API_KEY` | e-mail |
| `NFEIO_API_KEY` | nota fiscal |
| `GEOAPIFY_API_KEY` | endereço → coordenada (sem ela, cai no Nominatim) |
| `VAPID_PRIVATE_KEY` · `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | notificação push |
| `CRON_SECRET` | protege `/api/cron/daily` |
| `SUPER_ADMIN_EMAIL` | quem enxerga `/admin` |

⚠️ **Não existe banco de desenvolvimento separado.** `DATABASE_URL` aponta para
produção. Leia **Armadilhas** antes de rodar qualquer comando de schema.

---

## Comandos

```bash
npm test              # 715 testes. SEMPRE este, nunca `npx vitest run`
npm run lint
npm run build
npm run deploy:prod   # git push NÃO faz deploy
npm run backup        # dump do banco
npm run backup:provar # restaura num banco descartável e confere
npm run db:ensaio     # mostra o SQL que a próxima migration geraria
```

---

## Mapa das pastas

```
app/src/
  app/(dashboard)/   telas de quem usa o sistema
  app/admin/         painel do dono da plataforma
  app/api/           rotas HTTP — cron, webhooks, PDF, API pública v1
  app/p/ app/q/      páginas públicas: portal do cliente e do orçamento
  actions/           Server Actions (mutações)
  components/        UI, agrupada por assunto
  lib/               a regra de negócio — é aqui que mora o que importa
  test-utils/        harness de teste com Postgres embutido (PGlite)
app/prisma/          schema, migrations e seeds
app/messages/        traduções pt/en (a interface inteira passa por aqui)
```

**`lib/` é onde olhar primeiro.** A convenção do projeto é extrair toda regra
que dá para decidir sem banco nem rede para um módulo puro, com teste. Alguns
que explicam o sistema:

- `plan.ts` / `recursos.ts` — o que cada plano libera
- `funcoes.ts` — o que pode ser desligado por empresa (e por que nasce ligado)
- `auth.ts` — isolamento entre empresas; é onde um erro vaza dado de terceiro
- `acoes.ts` / `abas.ts` — permissão por ação e por aba
- `filial.ts` — escopo de multiunidade
- `pix.ts` — BR Code montado localmente, sem intermediário

---

## Armadilhas

Estas custaram tempo real. A lista completa está na seção 9 do plano; estas
são as que pegam alguém novo no primeiro dia.

**`npx vitest run` roda testes com o schema errado.** O `pretest` regenera
`test-schema.sql` a partir do `schema.prisma`, e chamar o vitest direto pula
esse passo — os testes falham por schema velho, apontando para o lugar errado.
Use `npm test`.

**`git push` não faz deploy.** A conexão Vercel↔GitHub existe no painel e não
dispara nada. Já houve um período de 16 dias em que tudo passava na CI e nada
chegava à produção. Deploy é `npm run deploy:prod`.

**Nunca rode `prisma migrate dev`.** O histórico de migrations tem drift em
relação ao banco real, e o comando oferece `migrate reset` como saída — que
**apaga todos os dados**, de produção, porque não há banco separado. Para
sincronizar schema localmente: `prisma db push`, seguido de
`prisma migrate resolve --applied <nome>` antes do próximo deploy.

**Toda função exportada de um arquivo `"use server"` é um endpoint HTTP**,
mesmo que nenhum componente a importe. Ela precisa conferir papel e empresa
**dentro de si mesma** — o redirect da página que a chama não protege nada.

**Nunca confie em `user.user_metadata` do Supabase para autorizar.** O próprio
usuário edita esse campo pelo SDK do navegador. A fonte de verdade é a tabela
`User`. Foi a causa da vulnerabilidade mais grave já encontrada aqui.

**`rm -rf .next` é normal e seguro** — o cache chega a vários GB.

**Esta versão do Next.js tem mudanças que quebram** o que você provavelmente
sabe. Veja `app/AGENTS.md`.

---

## Testes

715 testes, 57 arquivos, Postgres real embutido (PGlite) — sem Docker e sem
banco externo.

Quase todo teste explica no comentário **qual defeito real ele impede de
voltar**. Ler os testes de `lib/` é a forma mais rápida de entender as regras
do negócio, porque cada um começa dizendo o que aconteceu quando a regra não
existia.

---

## Aviso sobre dados

O banco contém nome, telefone e endereço dos clientes **finais** de empresas
reais. Não é dado nosso: é dado que elas confiaram ao sistema.

Por isso `backups/` e `.env*` estão no `.gitignore`, e por isso um dump não
deve ser enviado a terceiros sem contrato de tratamento. Para análise, use
amostra anonimizada.
