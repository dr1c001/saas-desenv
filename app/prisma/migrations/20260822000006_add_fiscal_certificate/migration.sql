-- O certificado digital A1 da empresa, para emitir nota fiscal pelo ServicoOS.
--
-- TABELA PROPRIA, e nao colunas no Tenant, de proposito: assim o certificado
-- NUNCA vem junto num `include: { tenant: true }` distraido. Quem precisa dele
-- tem que pedir por nome — e pedir por nome e uma decisao, nao um acidente.
--
-- O ARQUIVO E A SENHA FICAM CIFRADOS (AES-256-GCM, lib/cofre.ts), com a chave
-- numa variavel de ambiente e NUNCA no banco. Um dump — backup vazado, acesso
-- indevido ao Postgres, engenheiro curioso — nao entrega certificado de
-- ninguem.
--
-- Isto nao e excesso. Um A1 e a IDENTIDADE JURIDICA da empresa: com ele e a
-- senha, alguem emite nota no CNPJ dela e assina documento como ela. Se um
-- token de WhatsApp vaza, troca-se o token. Se um certificado vaza, so existe
-- revogar na certificadora e comprar outro — e no meio disso alguem pode ter
-- emitido nota no nome dela.
--
-- O que a cifra NAO protege: quem ja executa codigo no nosso servidor tem a
-- chave e o banco. Nenhuma cifra do lado do servidor resolve isso, e dizer o
-- contrario seria mentira confortavel.

CREATE TABLE "FiscalCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "nomeArquivo" TEXT,
    "validoAte" TIMESTAMP(3),
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoPor" TEXT,

    CONSTRAINT "FiscalCertificate_pkey" PRIMARY KEY ("id")
);

-- Um por empresa: enviar de novo SUBSTITUI, que e o que acontece na renovacao
-- anual. Varios certificados por empresa criariam a pergunta "qual vale?", e a
-- resposta errada emite nota com certificado vencido.
CREATE UNIQUE INDEX "FiscalCertificate_tenantId_key" ON "FiscalCertificate"("tenantId");

ALTER TABLE "FiscalCertificate" ADD CONSTRAINT "FiscalCertificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
