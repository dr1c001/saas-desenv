# Ambiente de teste (staging)

> **Não é período de teste para cliente.** É uma cópia particular do sistema, só
> para conferir mudanças antes que elas cheguem em quem paga. Nenhum cliente
> entra, nenhum acesso é liberado, nada muda em plano ou preço.

---

## Por que existe

Até 11/08/2026 não havia nenhum passo entre "o código mudou" e "o cliente está
usando". Todo deploy ia direto para `servicoos.com.br`, onde a assinante
trabalha. Uma alteração de banco que falhe no meio derruba o sistema para todo
mundo, e a correção acontece com o cliente esperando.

---

## As travas (já no código, valem sozinhas)

O maior perigo de um ambiente de teste é ele ser **bom demais**: o banco de
teste é uma cópia, e uma cópia tem os e-mails e telefones **reais** dos clientes
finais. Testar o aviso de inadimplência dispararia cobrança para gente que não
deve nada.

Quem decide o ambiente é a própria Vercel (`VERCEL_ENV`), não uma variável que
alguém pode esquecer de trocar. A regra é **lista de permissão**: só o que for
comprovadamente produção toca o mundo real; qualquer outro valor fica contido.

| Integração | Fora de produção | Onde |
|---|---|---|
| **E-mail** (Resend) | Desviado para o seu endereço, com `[TESTE]` no assunto e o destinatário original visível. Sem endereço seguro configurado, **aborta** em vez de enviar | `lib/resend.ts` |
| **Nota fiscal** (nfe.io) | **Bloqueado.** Não existe modo de teste: nota emitida é documento fiscal de verdade, com número, e o cancelamento tem prazo | `lib/nfeio.ts` |
| **Cobrança** (Asaas) | Sempre sandbox, mesmo que a chave de produção vaze para lá | `lib/asaas.ts` |
| **WhatsApp** (Z-API) | Não dispara; registra no log. O fluxo continua testável até o fim | `lib/whatsapp.ts` |
| **Rotina diária** | Não roda | `api/cron/daily` |
| **Google** | Não indexa | `app/robots.ts` |

Além disso, uma **faixa amarela fixa no topo** aparece em toda página fora de
produção — some sozinha em produção, sem configuração.

Tudo isso é coberto por testes (`lib/__tests__/ambiente.test.ts` e
`resend-ambiente.test.ts`): se alguém remover uma trava numa refatoração, o
teste quebra.

---

## O que falta configurar (uma vez só, ~10 minutos)

Precisa do seu login — não dá para fazer pelo terminal.

### 1. Criar o banco de teste no Supabase

1. https://supabase.com/dashboard → **New project**
2. Nome: `servicoos-teste` · região: **South America (São Paulo)** · plano **Free**
3. Guarde a senha do banco que ele pedir para criar

> O plano gratuito hiberna sem uso e leva alguns segundos para acordar.
> Irrelevante aqui.

### 2. Copiar as chaves do projeto novo

No projeto **de teste**, em **Settings**:

- **Database → Connection string**: pegue as duas URLs (a *pooled* e a *direct*)
- **API**: `Project URL`, `anon public` e `service_role`

### 3. Colar na Vercel, no ambiente **Preview**

https://vercel.com → projeto `app` → **Settings → Environment Variables**.

Para cada uma abaixo, marque **apenas o ambiente `Preview`** (nunca Production):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string *pooled* do projeto de teste |
| `DIRECT_URL` | connection string *direct* do projeto de teste |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do projeto de teste |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon public` do projeto de teste |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` do projeto de teste |
| `STAGING_EMAIL` | `adrielwellington02@gmail.com` |
| `SUPER_ADMIN_EMAIL` | `adrielwellington02@gmail.com` |
| `ASAAS_SANDBOX` | `true` |
| `RESEND_API_KEY` | **a mesma de produção** (o e-mail é desviado de qualquer forma) |
| `CRON_SECRET` | qualquer texto diferente do de produção |

**Confira duas vezes que `DATABASE_URL` do Preview aponta para o projeto de
teste.** É o único erro aqui que teria consequência real.

Não precisa copiar: `NFEIO_API_KEY` (bloqueado), `ASAAS_TOKEN_B64`,
`ASAAS_WEBHOOK_SECRET`, chaves do Sentry e VAPID.

---

## Como usar no dia a dia

```bash
npm run deploy:teste
```

Sobe para uma URL de teste da Vercel e imprime o endereço. Confira lá.

```bash
npm run deploy:prod
```

Só depois de conferir. Este é o que chega no cliente.

Para ensaiar só a alteração do banco, sem subir nada:

```bash
npm run db:ensaio
```

Mostra o SQL exato que rodaria em produção. Vale a leitura antes de qualquer
mudança de schema — é a parte que pode derrubar o sistema.

---

## Depois de configurar

O primeiro `npm run deploy:teste` cria as tabelas no banco de teste
automaticamente (o build roda `prisma migrate deploy`). O banco começa vazio:
cadastre uma empresa de mentira pela própria tela de cadastro.
