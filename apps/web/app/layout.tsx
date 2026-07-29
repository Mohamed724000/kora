import { BrandMark, SkipLink } from '@kora-plus/ui';
import '@kora-plus/ui/styles.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  applicationName: 'KORA+',
  category: 'culture',
  description: 'KORA+ est l’espace public de découverte des créations et cultures africaines.',
  robots: {
    follow: true,
    index: true,
  },
  title: {
    default: 'KORA+ — Cultures africaines',
    template: '%s — KORA+',
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <SkipLink href="#contenu-principal">Aller au contenu principal</SkipLink>
        <div className="public-shell">
          <header className="site-header">
            <div className="site-container site-header__inner">
              <Link aria-label="KORA+ — Accueil" className="site-logo" href="/">
                <BrandMark />
              </Link>
              <nav aria-label="Navigation principale">
                <Link className="site-nav-link" href="/#catalogue-public">
                  Catalogue
                </Link>
              </nav>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div className="site-container site-footer__inner">
              <BrandMark />
              <p>Site public KORA+</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
