'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { RecoveryCodesPanel } from '../../../../components/auth/recovery-codes-panel';
import { useAdminSession } from '../../../../lib/auth/admin-session-context';

export default function RecoveryCodesPage() {
  const { clearRecoveryCodes, recoveryCodes } = useAdminSession();
  const router = useRouter();
  const [displayedCodes] = useState(recoveryCodes);

  useEffect(() => {
    return clearRecoveryCodes;
  }, [clearRecoveryCodes]);

  if (displayedCodes === null) {
    return (
      <section className="auth-card auth-card--wide">
        <header className="auth-card__header">
          <p className="admin-eyebrow">Affichage unique</p>
          <h1>Codes indisponibles</h1>
          <p>
            Ces codes ne sont conservés ni après un rechargement ni dans le stockage du navigateur.
          </p>
        </header>
        <Link className="admin-primary-link" href="/login">
          Revenir à la connexion
        </Link>
      </section>
    );
  }

  return (
    <RecoveryCodesPanel
      codes={displayedCodes}
      onContinue={() => {
        router.replace('/');
      }}
    />
  );
}
