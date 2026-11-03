import { AppContent } from '@adminlte/react';
import { StatusPanel } from '@kora-plus/ui';
import Link from 'next/link';

export default function AdminHomePage() {
  return (
    <AppContent breadcrumbs={[{ label: 'Administration' }, { label: 'Tableau de bord' }]}>
      <div className="admin-protected-content" id="contenu-principal" tabIndex={-1}>
        <h1 className="admin-page-title">Tableau de bord</h1>
        <section aria-label="État du back-office" className="admin-foundation-state">
          <StatusPanel
            description="Aucune donnée métier n’est affichée dans ce lot. Les consoles opérationnelles restent hors périmètre."
            title="Session d’administration active"
            variant="empty"
          />
        </section>

        <section aria-labelledby="admin-personal-title" className="admin-personal-card">
          <p className="admin-eyebrow">Espace personnel</p>
          <h2 id="admin-personal-title">Sécurité de votre compte</h2>
          <p>Consultez vos sessions et gérez vos propres codes de récupération.</p>
          <Link className="admin-primary-link" href="/compte/securite">
            Ouvrir la sécurité du compte
          </Link>
        </section>
      </div>
    </AppContent>
  );
}
