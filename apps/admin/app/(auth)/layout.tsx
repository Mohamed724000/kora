import { AuthLayout } from '@adminlte/react';
import { BrandMark } from '@kora-plus/ui';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { PublicSessionBoundary } from '../../lib/auth/admin-session-boundary';

const GLOBAL_STATE_PROBE_HEADER = 'x-kora-c3-global-state-probe';
const GLOBAL_STATE_LOADING_DELAY_MS = 5_000;

async function C3GlobalStateProbe({ children }: Readonly<{ children: ReactNode }>) {
  const probe = (await headers()).get(GLOBAL_STATE_PROBE_HEADER);
  if (probe === 'loading') {
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, GLOBAL_STATE_LOADING_DELAY_MS),
    );
    notFound();
  }
  if (probe === 'not-found') {
    notFound();
  }
  if (probe === 'error') {
    throw new Error('C3 global error boundary probe.');
  }
  return children;
}

export default function AdminAuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  const publicSessionBoundary = <PublicSessionBoundary>{children}</PublicSessionBoundary>;

  return (
    <main id="contenu-principal" tabIndex={-1}>
      <AuthLayout authType="login" logo={<BrandMark context="Administration" />} logoHref="/login">
        {process.env.KORA_C3_GLOBAL_STATE_PROBE === '1' ? (
          <C3GlobalStateProbe>{publicSessionBoundary}</C3GlobalStateProbe>
        ) : (
          publicSessionBoundary
        )}
      </AuthLayout>
    </main>
  );
}
