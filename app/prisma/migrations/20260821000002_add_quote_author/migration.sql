-- Quem emitiu o orcamento.
--
-- Existe para a assinatura CERTA sair no PDF. O sistema nao registrava o autor
-- de um orcamento, entao a unica coisa que daria para carimbar seria quem esta
-- BAIXANDO o documento — e um administrador baixando o orcamento da Ana sairia
-- com a assinatura dele no papel.
--
-- Assinatura errada e pior que assinatura nenhuma: e atestado falso, e num
-- documento comercial que vai para o cliente final.
--
-- ON DELETE SET NULL: desligar a pessoa nao pode apagar o orcamento dela. O
-- documento volta a sair com a linha para assinar a mao, que e o mesmo
-- comportamento dos orcamentos criados antes desta coluna.

ALTER TABLE "Quote" ADD COLUMN "createdById" TEXT;

CREATE INDEX "Quote_createdById_idx" ON "Quote"("createdById");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
