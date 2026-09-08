-- Aviso automático ao cliente final: configuração por empresa.
--
-- Escrita à mão de propósito. `migrate diff --from-config-datasource` compara
-- com o banco de PRODUÇÃO, que ainda não tem a migration de contratos — o
-- arquivo gerado viria duplicando tudo aquilo. Para uma coluna só, escrever é
-- mais seguro que gerar.
--
-- Nasce NULL: sem configuração, nada é enviado.
ALTER TABLE "Tenant" ADD COLUMN "clientNotifications" JSONB;
