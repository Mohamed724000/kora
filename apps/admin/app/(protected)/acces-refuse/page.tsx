'use client';

import { AppContent } from '@adminlte/react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

export default function AccessDeniedPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <AppContent breadcrumbs={[{ label: 'Administration' }, { label: 'Accès refusé' }]}>
      <div className="admin-protected-content" id="contenu-principal" tabIndex={-1}>
        <section className="admin-status-card" role="alert">
          <p className="admin-eyebrow">Autorisation serveur</p>
          <h1 ref={headingRef} tabIndex={-1}>
            Accès refusé
          </h1>
          <p>
            Votre session ne dispose pas de l’autorisation requise. Aucun détail interne n’est
            exposé.
          </p>
          <Link className="admin-primary-link" href="/">
            Revenir à l’accueil
          </Link>
        </section>
      </div>
    </AppContent>
  );
}
