import '@adminlte/react/css';
import '@kora-plus/ui/styles.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { AdminSessionProvider } from '../lib/auth/admin-session-context';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'KORA+ Administration',
  description: 'Interface interne d’administration KORA+.',
  robots: {
    follow: false,
    index: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
  title: {
    default: 'Administration',
    template: '%s — KORA+ Administration',
  },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Reading request headers keeps nonce-bearing CSP responses dynamically rendered.
  await headers();
  return (
    <html data-bs-theme="light" lang="fr">
      <body>
        <a className="admin-skip-link" href="#contenu-principal">
          Aller au contenu principal
        </a>
        <AdminSessionProvider>{children}</AdminSessionProvider>
      </body>
    </html>
  );
}
