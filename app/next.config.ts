import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  // org, project e authToken vêm das env vars SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN
});
