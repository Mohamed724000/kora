'use client';

import { AppContent } from '@adminlte/react';
import { ActionButton, StatusPanel } from '@kora-plus/ui';
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { captureSentryException } from '../lib/observability/sentry';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    captureSentryException(
      Sentry,
      {
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      },
      error,
    );
  }, [error]);

  return (
    <AppContent title="Erreur">
      <StatusPanel
        action={<ActionButton onClick={reset}>Réessayer</ActionButton>}
        description="Le shell d’administration ne peut pas être affiché."
        title="Un problème est survenu"
        variant="error"
      />
    </AppContent>
  );
}
