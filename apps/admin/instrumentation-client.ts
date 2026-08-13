'use client';

import * as Sentry from '@sentry/react';
import { initializeSentry } from './lib/observability/sentry';

initializeSentry(Sentry, {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
});
