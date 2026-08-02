import { StatusPanel } from '@kora-plus/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="state-page" id="contenu-principal">
      <div className="site-container">
        <StatusPanel
          action={
            <Link className="primary-link" href="/">
              Revenir à l’accueil
            </Link>
          }
          description="Cette adresse ne correspond à aucune page publique."
          title="Page introuvable"
          variant="error"
        />
      </div>
    </main>
  );
}
