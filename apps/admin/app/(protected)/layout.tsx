import { DashboardLayout } from '@adminlte/react';
import { BrandMark } from '@kora-plus/ui';
import type { ReactNode } from 'react';

import { adminMenuItems } from '../../lib/admin-navigation';
import { ProtectedSessionBoundary } from '../../lib/auth/admin-session-boundary';

export default function ProtectedAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ProtectedSessionBoundary>
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
        topbarEnd={
          <li className="admin-topbar-context nav-item">
            <span className="nav-link">Espace personnel sécurisé</span>
          </li>
        }
      >
        {children}
      </DashboardLayout>
    </ProtectedSessionBoundary>
  );
}
