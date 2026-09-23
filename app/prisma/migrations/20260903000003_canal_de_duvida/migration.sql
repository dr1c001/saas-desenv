-- O CANAL DE DUVIDA: o cliente escreve dentro do sistema, o dono responde pelo
-- painel, e a conversa fica gravada.
--
-- Ate hoje nao havia canal nenhum — nem chamado, nem chat, nem formulario de
-- contato. Quem tinha duvida ligava, mandava mensagem para o celular do dono,
-- ou desistia. E "desistia" nao deixa rastro nenhum.
--
-- ─── Por que a conversa SOBREVIVE a empresa ─────────────────────────────────
--
-- `tenantId` e `authorId` sao ANULAVEIS, com SET NULL. Nao e desleixo com o
-- multi-tenant: e o mesmo motivo pelo qual o AdminAuditLog guarda o e-mail do
-- admin como texto. Duas consequencias, as duas desejadas:
--
--   1. apagarEmpresaAbandonada() continua funcionando. Ela apaga os User e o
--      Tenant numa transacao; com RESTRICT, um cadastro abandonado que um dia
--      escreveu "como eu assino?" ficaria impossivel de apagar.
--
--   2. a duvida de quem desistiu e a mais valiosa que existe — e o motivo do
--      abandono, escrito pela propria pessoa. CASCADE apagaria justamente ela.
--
-- Por isso a linha carrega o RETRATO do momento da pergunta. Depois do
-- apagamento, e a unica memoria de que aquela pergunta foi feita.

CREATE TYPE "SupportThreadStatus" AS ENUM ('ABERTA', 'RESPONDIDA', 'FECHADA');

-- Quem falou. Dois lados so: a empresa cliente e a plataforma.
CREATE TYPE "SupportAuthorKind" AS ENUM ('CLIENTE', 'PLATAFORMA');

CREATE TABLE "SupportThread" (
  "id"                 TEXT NOT NULL,

  -- Vivos enquanto a empresa e a pessoa existirem.
  "tenantId"           TEXT,
  "authorId"           TEXT,

  -- O RETRATO do momento da pergunta. Guardado, e nao lido ao vivo: "por que
  -- nao vejo o mapa?" so faz sentido junto do plano que a empresa TINHA quando
  -- perguntou. Um upgrade no dia seguinte faria a duvida parecer maluca.
  "tenantName"         TEXT NOT NULL,
  "authorName"         TEXT NOT NULL,
  "authorEmail"        TEXT NOT NULL,
  -- Cargo como TEXTO, e nao enum: cargo pode sair do enum, e a linha antiga
  -- nao pode virar invalida por causa disso.
  "authorRole"         TEXT NOT NULL,
  "planName"           TEXT,
  "subscriptionStatus" TEXT NOT NULL,

  -- A tela em que a pessoa estava, pela rota CANONICA do catalogo
  -- (lib/codigos-abas.ts) — nunca o caminho cru. "/service-orders/ckx9f..."
  -- vira "/service-orders": assim nao entra id de cliente nem de OS no painel,
  -- e nao ha texto livre vindo de um endereco HTTP. NULL = fora do catalogo.
  "screenRoute"        TEXT,
  -- "1.1", para o dono reconhecer a tela de imediato.
  "screenCode"         TEXT,

  "status"             "SupportThreadStatus" NOT NULL DEFAULT 'ABERTA',
  "messageCount"       INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt"      TIMESTAMP(3) NOT NULL,
  "lastMessageFrom"    "SupportAuthorKind" NOT NULL,

  -- Quando o CLIENTE leu a ultima resposta. So do lado dele: do lado do painel,
  -- "nao lida" e simplesmente status = 'ABERTA', e uma coluna a menos e uma
  -- coluna a menos para dessincronizar.
  "readByClientAt"     TIMESTAMP(3),

  "closedAt"           TIMESTAMP(3),
  -- E-mail de quem fechou, ou "cliente".
  "closedBy"           TEXT,

  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
  "id"          TEXT NOT NULL,
  "threadId"    TEXT NOT NULL,
  "kind"        "SupportAuthorKind" NOT NULL,
  "body"        TEXT NOT NULL,
  -- Retrato tambem aqui: quem respondeu foi uma pessoa da equipe, que pode nao
  -- estar mais na PlatformAdmin daqui a um ano.
  "authorName"  TEXT NOT NULL,
  "authorEmail" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- ─── Ligacoes ───────────────────────────────────────────────────────────────
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cascade aqui, e so aqui: mensagem sem conversa nao e nada.
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "SupportThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Indices ────────────────────────────────────────────────────────────────
-- A fila do painel: as abertas primeiro, da mais recente para a mais velha.
CREATE INDEX "SupportThread_status_lastMessageAt_idx" ON "SupportThread"("status", "lastMessageAt");
-- A lista do cliente, e a contagem de abertas por empresa (o limite de 3).
CREATE INDEX "SupportThread_tenantId_status_idx" ON "SupportThread"("tenantId", "status");
-- As mensagens de uma conversa, em ordem.
CREATE INDEX "SupportMessage_threadId_createdAt_idx" ON "SupportMessage"("threadId", "createdAt");

-- ─── As travas de sanidade ──────────────────────────────────────────────────
--
-- Mensagem vazia nao e pergunta. O limite de tamanho vive tambem na regra
-- (lib/duvida.ts) para a mensagem de erro ser boa; aqui e a ultima defesa,
-- valendo para quem chamar a Server Action direto.
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_corpo_nao_vazio"
  CHECK (length(btrim("body")) BETWEEN 1 AND 2000);

-- Conversa fechada tem data de fechamento, e conversa aberta nao tem. Os dois
-- lados: sem isto, "fechada sem data" e "aberta com data" passariam, e a fila
-- do painel mostraria conversa que ninguem consegue explicar.
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_fechada_tem_data"
  CHECK (("status" = 'FECHADA') = ("closedAt" IS NOT NULL));
