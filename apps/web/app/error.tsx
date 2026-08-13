'use client';

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
    <main className="state-page" id="contenu-principal">
      <div className="site-container">
        <StatusPanel
          action={<ActionButton onClick={reset}>Réessayer</ActionButton>}
          description="La page publique ne peut pas être affichée pour le moment."
          title="Un problème est survenu"
          variant="error"
        />
      </div>
    </main>
  );
}
