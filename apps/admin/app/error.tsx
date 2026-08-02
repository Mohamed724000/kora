'use client';

import { AppContent } from '@adminlte/react';
import { ActionButton, StatusPanel } from '@kora-plus/ui';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
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
