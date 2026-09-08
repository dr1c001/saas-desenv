export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs")
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.2,
      enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    })
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs")
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.2,
      enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    })
  }
}

type RequestErrorArgs = Parameters<typeof import("@sentry/nextjs").captureRequestError>

export async function onRequestError(...args: RequestErrorArgs) {
  const Sentry = await import("@sentry/nextjs")
  Sentry.captureRequestError(...args)
}
