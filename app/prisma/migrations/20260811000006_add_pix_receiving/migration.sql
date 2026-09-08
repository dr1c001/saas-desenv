-- Cobranca do cliente final por PIX: a empresa recebe na conta que ja tem.
-- Nada aqui e segredo: chave PIX e um dado publico (e o que a empresa manda
-- pro cliente pagar). Nao ha token de gateway porque nao ha gateway.
ALTER TABLE "Tenant" ADD COLUMN "pixKey" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "pixKeyType" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "pixReceiver" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "pixCity" TEXT;
