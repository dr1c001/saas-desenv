import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  silent: false,
  debug: true,
  widenClientFileUpload: true,
  // org, project e authToken vêm das env vars SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN
  // Se o upload de source maps falhar (token invalido/expirado), so avisa no log do build
  // em vez de derrubar o deploy inteiro — o app tem que subir mesmo se o Sentry falhar.
  errorHandler: (err) => {
    console.warn("[Sentry] upload de source maps falhou (deploy continua normalmente):", err.message);
  },
});
