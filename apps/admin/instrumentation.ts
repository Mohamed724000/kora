import { initializeSentry } from './lib/observability/sentry';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN) {
    return;
  }

  const Sentry = await import('@sentry/node');
  initializeSentry(Sentry, {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    release: process.env.SENTRY_RELEASE,
  });
}
