-- FORNECEDOR de verdade.
--
-- Ate aqui o fornecedor tinha SEIS campos (nome, documento, e-mail, telefone,
-- observacoes) e nem tela propria: vivia num dialogo dentro de Compras, onde
-- so dava para criar e apagar. Corrigir um telefone errado exigia APAGAR e
-- cadastrar de novo — e apagar levava junto, em silencio, a participacao dele
-- em cotacoes ja fechadas (ver a trava no fim deste arquivo).
--
-- FORNECEDOR nao e PRESTADOR. Fornecedor VENDE peca e material para a empresa
-- (model Supplier, ligado a compra e cotacao); prestador PRESTA servico para
-- ela (model Provider, ligado a manutencao). Sao dois cadastros diferentes de
-- proposito, e continuam separados.

-- ─── Por que TODAS as colunas nascem opcionais ──────────────────────────────
--
-- Ja existem fornecedores gravados com nada alem do nome. Campo novo
-- obrigatorio travaria a EDICAO deles: a pessoa abriria a ficha para corrigir o
-- telefone e o formulario exigiria preencher razao social, CEP e condicao de
-- pagamento antes de deixar salvar. Cadastro pobre e melhor que cadastro
-- impossivel de corrigir.
--
-- A unica excecao e `active`, que tem DEFAULT: fornecedor que ja existe esta
-- ativo, e essa e a resposta certa para todas as linhas de hoje.

-- Identificacao. `name` continua sendo como a empresa CHAMA o fornecedor (nome
-- fantasia); `legalName` e a razao social que sai na nota.
ALTER TABLE "Supplier" ADD COLUMN "legalName"         TEXT;
ALTER TABLE "Supplier" ADD COLUMN "documentDigits"    TEXT;
ALTER TABLE "Supplier" ADD COLUMN "stateRegistration" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "cityRegistration"  TEXT;
-- Ramo em TEXTO LIVRE, e nao enum: enum obrigaria uma migration a cada ramo
-- novo que uma empresa inventar. Espelha Provider.specialty, que ja e assim.
ALTER TABLE "Supplier" ADD COLUMN "category"          TEXT;

-- Quem atende. O telefone da empresa e uma coisa; o celular do vendedor que
-- resolve e outra, e e esse que o dono liga.
ALTER TABLE "Supplier" ADD COLUMN "contactName"  TEXT;
ALTER TABLE "Supplier" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "website"      TEXT;

-- Endereco em colunas PROPRIAS, e nao na tabela Address.
--
-- Address e `clientId String @unique` com Cascade no Client e carrega a fila de
-- geocodificacao — apontar fornecedor para la exigiria generalizar o model e
-- herdaria logica de mapa que fornecedor nao quer.
--
-- Os nomes sao IDENTICOS aos de Address de proposito: no dia em que a
-- generalizacao valer a pena, e mover coluna, e nao renomear nada.
ALTER TABLE "Supplier" ADD COLUMN "zipCode"    TEXT;
ALTER TABLE "Supplier" ADD COLUMN "street"     TEXT;
ALTER TABLE "Supplier" ADD COLUMN "number"     TEXT;
ALTER TABLE "Supplier" ADD COLUMN "complement" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "district"   TEXT;
ALTER TABLE "Supplier" ADD COLUMN "city"       TEXT;
ALTER TABLE "Supplier" ADD COLUMN "state"      TEXT;

-- O lado comercial: e o que decide de quem comprar quando o preco empata.
ALTER TABLE "Supplier" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "leadTimeDays" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN "pixKey"       TEXT;
ALTER TABLE "Supplier" ADD COLUMN "bankName"     TEXT;
ALTER TABLE "Supplier" ADD COLUMN "bankAgency"   TEXT;
ALTER TABLE "Supplier" ADD COLUMN "bankAccount"  TEXT;

-- Ciclo de vida. Desativar substitui apagar — ver a trava no fim do arquivo.
ALTER TABLE "Supplier" ADD COLUMN "active"        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Supplier" ADD COLUMN "deactivatedAt" TIMESTAMP(3);

-- ─── A forma comparavel do documento ────────────────────────────────────────
--
-- `document` continua guardando o que a pessoa digitou, com mascara e tudo —
-- e o que ela reconhece ao reler. `documentDigits` e so os digitos, e serve
-- para descobrir que "12.345.678/0001-99" e "12345678000199" sao o MESMO
-- fornecedor cadastrado duas vezes.
UPDATE "Supplier"
   SET "documentDigits" = NULLIF(regexp_replace(COALESCE("document", ''), '\D', '', 'g'), '');

CREATE INDEX "Supplier_tenantId_active_idx" ON "Supplier"("tenantId", "active");
CREATE INDEX "Supplier_tenantId_documentDigits_idx" ON "Supplier"("tenantId", "documentDigits");

-- O indice NAO e unico, e isso e decisao consciente: empresa que ja gravou o
-- mesmo CNPJ duas vezes faria esta migration FALHAR no deploy, derrubando
-- tambem tudo que vier depois dela. Duplicata vira AVISO na tela. Unicidade so
-- depois de uma limpeza, e em outra migration.

-- ─── A trava que faltava: apagar fornecedor apagava historico ───────────────
--
-- A chave estrangeira de QuotationParticipant era CASCADE. Excluir um
-- fornecedor apagava, sem avisar e sem deixar rastro, a participacao dele em
-- TODA cotacao e os precos que ele tinha dado — exatamente o historico que o
-- modulo de cotacao existe para guardar. E como a unica forma de corrigir um
-- dado errado era apagar e recadastrar, o caminho para perder o historico era
-- o caminho NORMAL de uso.
--
-- Com RESTRICT o banco vira a ultima linha de defesa: fornecedor que ja
-- participou de cotacao nao se apaga, se DESATIVA (`active = false`).
ALTER TABLE "QuotationParticipant" DROP CONSTRAINT "QuotationParticipant_supplierId_fkey";
ALTER TABLE "QuotationParticipant" ADD CONSTRAINT "QuotationParticipant_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
