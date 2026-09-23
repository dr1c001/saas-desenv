-- Foto no orcamento.
--
-- A OS ja tinha fotos; o orcamento nao tinha nenhuma. E e no orcamento que a
-- foto mais trabalha: e o documento que o cliente le para DECIDIR. Mostrar o
-- cano estourado, o quadro queimado, o telhado que precisa trocar responde
-- sozinho a pergunta "por que custa isso".
--
-- ─── Uma tabela para os dois donos, e nao duas tabelas ───────────────────────
--
-- Duplicar Attachment em QuoteAttachment duplicaria junto o upload, a
-- validacao, o teto por registro, a exclusao e a limpeza do armazenamento —
-- cinco lugares para divergir. A tabela passa a aceitar QUALQUER um dos dois
-- donos, e o vinculo continua obrigatorio.
ALTER TABLE "Attachment" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN "quoteId" TEXT;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A trava que substitui o NOT NULL perdido.
--
-- Sem ela, "orderId opcional" viraria "foto sem dono nenhum": uma linha que
-- nao aparece em tela alguma, ocupa armazenamento e ninguem consegue apagar
-- pela interface. E o oposto — os DOIS preenchidos — faria a mesma foto ser
-- contada duas vezes no teto e aparecer em dois documentos.
--
-- O banco recusa as duas situacoes, e nao depende de nenhuma action lembrar.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_um_dono_so"
  CHECK (("orderId" IS NOT NULL AND "quoteId" IS NULL)
      OR ("orderId" IS NULL AND "quoteId" IS NOT NULL));

CREATE INDEX "Attachment_quoteId_idx" ON "Attachment"("quoteId");
