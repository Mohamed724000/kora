'use client';

import * as Sentry from '@sentry/react';
import { useEffect, useRef } from 'react';
import { captureSentryException } from '../lib/observability/sentry';

type ErrorPageProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
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
    <main className="admin-session-gate" id="contenu-principal" ref={mainRef} tabIndex={-1}>
      <section aria-live="assertive" className="admin-status-card" role="alert">
        <p className="admin-eyebrow">Administration KORA+</p>
        <h1>Un problème est survenu</h1>
        <p>
          L’interface n’a pas pu être affichée. Aucune opération n’est relancée automatiquement.
        </p>
        <button className="auth-submit" onClick={retry} type="button">
          Réessayer l’affichage
        </button>
      </section>
    </main>
  );
}
