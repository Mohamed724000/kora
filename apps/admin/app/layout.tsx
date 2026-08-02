import { DashboardLayout } from '@adminlte/react';
import '@adminlte/react/css';
import { BrandMark } from '@kora-plus/ui';
import '@kora-plus/ui/styles.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { adminMenuItems } from '../lib/admin-navigation';
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-bs-theme="light" lang="fr">
      <body>
        <DashboardLayout
          colorModeToggle={false}
          fixedHeader
          fixedSidebar
          footer={<span>KORA+ · Administration</span>}
          initialColorMode="light"
          logo={<BrandMark context="Administration" />}
          logoHref="/"
          menuItems={adminMenuItems}
          sidebarTheme="light"
        >
          {children}
        </DashboardLayout>
      </body>
    </html>
  );
}
