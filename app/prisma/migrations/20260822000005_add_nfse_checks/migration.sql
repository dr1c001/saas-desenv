-- Contador de consultas ao emissor pelo estado da nota fiscal.
--
-- Emitir NFS-e e ASSINCRONO: quando o sistema chama o emissor, a nota nasce em
-- processamento e so depois a prefeitura devolve "emitida" ou "rejeitada".
--
-- Ate aqui o sistema gravava o estado daquele instante e NUNCA MAIS
-- perguntava — sem webhook, sem consulta periodica, e o cron sem uma unica
-- mencao a NFS-e. Resultado: o link do PDF ficava nulo (o arquivo ainda nao
-- existia na hora da chamada), o status congelava em "processando" para
-- sempre, e a OS era marcada como faturada MESMO SE A PREFEITURA REJEITASSE.
-- OS faturada, receita lancada, nota nenhuma, e ninguem sabendo.
--
-- Este contador existe para o sistema DESISTIR. O cron roda uma vez por dia,
-- entao o teto de 30 e um mes de tentativas: nota que nao resolveu em um mes
-- nao resolve sozinha — precisa de alguem olhando, e nao de mais uma consulta
-- diaria para sempre. Regra e testes em lib/nfse-status.ts.

ALTER TABLE "ServiceOrder" ADD COLUMN "nfseChecks" INTEGER NOT NULL DEFAULT 0;
