-- O orçamento passa a apontar para um cliente CADASTRADO, e registra o envio.
--
-- Até aqui o cliente do orçamento era texto livre: `clientName` digitado à mão,
-- sem vínculo nenhum com a aba Clientes. Dava para emitir um orçamento para
-- "joão da esquina" e nunca mais conseguir achar quem era.
--
-- ─── Por que NULL, e não NOT NULL ────────────────────────────────────────────
--
-- Há orçamentos em produção sem cliente cadastrado, alguns já aprovados. Uma
-- coluna NOT NULL falharia na migration, e um DEFAULT inventado apontaria todos
-- eles para um cliente que não existe. A obrigatoriedade vive na Action, para
-- os orçamentos NOVOS; os antigos continuam abrindo, editando e imprimindo.
--
-- ─── Por que clientName CONTINUA existindo ───────────────────────────────────
--
-- Vira RETRATO do cliente no dia do orçamento. São seis telas e o PDF que leem
-- esses campos sem join, e — o que importa mais — um orçamento é um documento
-- que saiu da empresa: mudar o endereço do cliente em novembro não pode
-- reescrever o papel enviado em setembro.

ALTER TABLE "Quote" ADD COLUMN "clientId" TEXT;

ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Quote_clientId_idx" ON "Quote"("clientId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Liga sozinho o que dá para ligar com segurança.
--
-- Casa `Quote.clientName` com `Client.name` da MESMA empresa, sem diferenciar
-- maiúsculas e ignorando espaço nas pontas. Só liga quando o nome bate com
-- EXATAMENTE UM cliente: dois "Silva" no cadastro e o orçamento fica sem
-- vínculo, para uma pessoa decidir — ligar ao cliente errado mandaria o
-- orçamento para o e-mail de outro.
--
-- Isto não é enfeite: sem ele, o dono abriria a segunda-feira com um mutirão de
-- cadastro antes de conseguir editar qualquer orçamento antigo.
UPDATE "Quote" q
SET "clientId" = c.id
FROM "Client" c
WHERE c."tenantId" = q."tenantId"
  AND lower(btrim(c.name)) = lower(btrim(q."clientName"))
  AND q."clientId" IS NULL
  AND (
    SELECT count(*) FROM "Client" c2
    WHERE c2."tenantId" = q."tenantId"
      AND lower(btrim(c2.name)) = lower(btrim(q."clientName"))
  ) = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- O registro do envio.
--
-- Duas colunas em vez de uma tabela de log de e-mail: é o molde que o
-- repositório já usa (ServiceOrder.npsSentAt, Revenue.remindersSent), e a
-- pergunta que a tela precisa responder é só "já mandei? para quem? quando?".
--
-- `sentTo` guarda o endereço USADO, e não o atual do cliente: seis meses depois
-- a pergunta é para onde o orçamento foi, não para onde iria hoje.
ALTER TABLE "Quote" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "sentTo" TEXT;

ALTER TABLE "ServiceOrder" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "ServiceOrder" ADD COLUMN "sentTo" TEXT;
