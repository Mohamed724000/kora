import { AppContent } from '@adminlte/react';
import { StatusPanel } from '@kora-plus/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <AppContent title="Page introuvable">
      <StatusPanel
        action={
          <Link className="admin-return-link" href="/">
            Revenir au tableau de bord
          </Link>
        }
        description="Cette adresse ne correspond à aucune page d’administration."
        title="Page introuvable"
        variant="error"
      />
    </AppContent>
  );
}
