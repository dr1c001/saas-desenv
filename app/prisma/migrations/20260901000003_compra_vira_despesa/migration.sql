-- A compra vira despesa.
--
-- Era o defeito mais caro do modulo de compras: a peca entrava no estoque e o
-- dinheiro NAO saia do caixa. A empresa comprava R$ 2.400 em pecas, o saldo
-- subia, e o Financeiro nao ficava sabendo — o lucro na tela ficava maior que
-- o lucro de verdade. Estoque que engorda sem despesa correspondente e a forma
-- mais silenciosa de um sistema mentir sobre o resultado do mes.
--
-- SetNull, e nao Cascade: apagar a ordem de compra nao pode apagar o registro
-- do dinheiro que saiu.
ALTER TABLE "Expense" ADD COLUMN "purchaseOrderId" TEXT;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Expense_purchaseOrderId_idx" ON "Expense"("purchaseOrderId");
