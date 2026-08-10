import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
