-- A nota do fornecedor, anexada a ordem de compra.
--
-- O anexo ja servia a dois donos (OS e orcamento). Passa a servir a tres.

ALTER TABLE "Attachment" ADD COLUMN "purchaseOrderId" TEXT;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Attachment_purchaseOrderId_idx" ON "Attachment"("purchaseOrderId");

-- ─── A trava de dono unico, reescrita ───────────────────────────────────────
--
-- A antiga dizia "orderId OU quoteId, nunca os dois". Com um terceiro dono ela
-- ficaria com quatro combinacoes escritas a mao, e a quinta (quando um quarto
-- dono aparecer) seria esquecida.
--
-- `num_nonnulls` conta quantos dos argumentos NAO sao nulos. "Exatamente um" e
-- literalmente o que esta escrito, e acrescentar um dono no futuro e adicionar
-- um argumento — nao reescrever a logica.
--
-- O que a trava impede continua sendo o mesmo:
--   - NENHUM dono: linha que nao aparece em tela alguma, ocupa armazenamento e
--     ninguem consegue apagar pela interface;
--   - DOIS donos: o mesmo arquivo contado duas vezes no teto por registro, e
--     aparecendo em dois documentos diferentes.
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_um_dono_so";

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_um_dono_so"
  CHECK (num_nonnulls("orderId", "quoteId", "purchaseOrderId") = 1);
