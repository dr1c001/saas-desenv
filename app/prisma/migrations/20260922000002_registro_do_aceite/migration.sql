-- O REGISTRO DO ACEITE do contrato.
--
-- O quadro de fecho do contrato afirma, como fato consumado, que ficam
-- registrados "o endereco IP, a data, a hora e a identificacao da CONTRATANTE"
-- para comprovacao de autoria e integridade. Nada disso era gravado em lugar
-- nenhum: nao havia coluna de IP, de data de aceite nem de versao aceita. O
-- documento que deveria sustentar a defesa era o que a desmentia.
--
-- A VERSAO tambem entra aqui. `gerarContrato` montava o PDF sempre com a
-- VERSAO_CONTRATO de hoje e a carencia de hoje: quem assinou a v1.1 (carencia
-- de 5 dias) baixava o contrato e recebia um documento rotulado v1.2
-- prometendo 30 dias. O proprio cabecalho do contrato-pdf.tsx dizia que "o
-- prazo declarado no documento dela continua sendo o que ela assinou".
--
-- Nulo nas assinaturas existentes, de proposito: ninguem inventa um IP nem uma
-- data de aceite que nao foram registrados. Para elas o contrato segue sendo
-- gerado como hoje. (Achado na auditoria de 13/09/2026.)
ALTER TABLE "Subscription" ADD COLUMN "contractVersion" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "acceptedIp" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "acceptedByUserId" TEXT;
