import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // O sharp carrega o binario da plataforma por caminho DINAMICO
  // (`@img/sharp-${plataforma}`), e o rastreamento estatico do Next nao
  // consegue seguir isso — a biblioteca nativa ficava de fora do pacote da
  // funcao. Resultado: funcionava no Windows do desenvolvedor e morria na
  // Vercel com "libvips-cpp.so: cannot open shared object file", derrubando o
  // upload de logo e a gravacao de assinatura em producao, EM SILENCIO (o erro
  // era pego pelo catch e virava "tente de novo").
  //
  // So os binarios de LINUX-X64, que e o runtime da Vercel. Incluir a pasta
  // @img inteira arrastaria Windows e macOS junto, uns 50 MB por funcao.
  //
  // As rotas listadas sao as que usam sharp hoje. O teste em
  // src/lib/__tests__/sharp-empacotado.test.ts falha se alguem usar sharp numa
  // rota que nao esteja aqui — senao o defeito volta calado.
  outputFileTracingIncludes: {
    "/settings": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
    "/settings/**": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  experimental: {
    // O padrão é 1 MB e o upload de logo aceita até 2 MB — sem isto, o arquivo
    // é recusado pelo framework antes de chegar na validação, com erro genérico.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  widenClientFileUpload: true,
  // org, project e authToken vêm das env vars SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN
  // Se o upload de source maps falhar (token invalido/expirado), so avisa no log do build
  // em vez de derrubar o deploy inteiro — o app tem que subir mesmo se o Sentry falhar.
  errorHandler: (err) => {
    console.warn("[Sentry] upload de source maps falhou (deploy continua normalmente):", err.message);
  },
});
