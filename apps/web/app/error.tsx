'use client';

import { ActionButton, StatusPanel } from '@kora-plus/ui';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
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
