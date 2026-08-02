import { AppContent } from '@adminlte/react';
import { StatusPanel } from '@kora-plus/ui';

export default function Loading() {
  return (
    <AppContent title="Chargement">
      <StatusPanel
        description="Le shell d’administration est en cours de préparation."
        title="Chargement"
        variant="loading"
      />
    </AppContent>
  );
}
