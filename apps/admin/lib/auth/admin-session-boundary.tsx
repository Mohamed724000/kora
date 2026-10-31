'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';

import { useAdminSession } from './admin-session-context';

const ADMIN_LTE_THEME_STORAGE_KEY = 'lte-theme';

function enforceLightOnlyTheme(): void {
  document.documentElement.setAttribute('data-bs-theme', 'light');
  window.localStorage.removeItem(ADMIN_LTE_THEME_STORAGE_KEY);
}

export function PublicSessionBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const { logout, recoveryCodes, refreshSession, state } = useAdminSession();
  const pathname = usePathname();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!started.current && state.status === 'CHECKING') {
      started.current = true;
      void refreshSession();
    }
  }, [refreshSession, state.status]);

  const preAuthDestination =
    state.status === 'PREAUTH'
      ? state.preAuth.nextStep === 'TOTP_VERIFY'
        ? '/2fa/verify'
        : '/2fa/setup'
      : undefined;
  const preAuthRouteAllowed =
    state.status === 'PREAUTH' &&
    (pathname === preAuthDestination ||
      (state.preAuth.nextStep === 'TOTP_VERIFY' && pathname === '/2fa/recovery'));
  const recoveryCodesRouteAllowed =
    state.status === 'AUTHENTICATED' &&
    pathname === '/2fa/recovery-codes' &&
    recoveryCodes !== null;

  if (state.status === 'ANONYMOUS' || preAuthRouteAllowed || recoveryCodesRouteAllowed) {
    return <div className="admin-auth-main">{children}</div>;
  }
  if (state.status === 'PREAUTH') {
    return (
      <div className="admin-session-gate">
        <section className="admin-status-card" role="alert">
          <p className="admin-eyebrow">Authentification en cours</p>
          <h1>Reprenez le parcours actif</h1>
          <p>Un contexte de préauthentification est déjà actif dans cet onglet.</p>
          <Link className="admin-primary-link" href={preAuthDestination ?? '/login'}>
            Continuer le parcours sécurisé
          </Link>
        </section>
      </div>
    );
  }
  if (state.status === 'AUTHENTICATED' || state.status === 'REFRESHING') {
    return (
      <div className="admin-session-gate">
        <section className="admin-status-card">
          <p className="admin-eyebrow">Session déjà ouverte</p>
          <h1>Choisissez votre contexte</h1>
          <p>
            Fermez explicitement la session actuelle avant de commencer un autre parcours public.
          </p>
          <div className="auth-actions">
            <Link className="admin-primary-link" href="/">
              Conserver ma session
            </Link>
            <button
              className="auth-secondary auth-secondary--danger"
              onClick={() => {
                void logout().then(
                  () => router.replace('/login?reason=signed-out'),
                  () => router.replace('/login?reason=logout-result-unknown'),
                );
              }}
              type="button"
            >
              Me déconnecter
            </button>
          </div>
        </section>
      </div>
    );
  }
  if (state.status === 'UNSUPPORTED') {
    return (
      <div className="admin-session-gate">
        <section className="admin-status-card" role="alert">
          <p className="admin-eyebrow">Session sécurisée</p>
          <h1>Navigateur non pris en charge</h1>
          <p>La coordination sécurisée requise est indisponible.</p>
        </section>
      </div>
    );
  }
  return (
    <div aria-busy="true" className="admin-session-gate">
      <section aria-live="polite" className="admin-status-card" role="status">
        <p className="admin-eyebrow">Session sécurisée</p>
        <h1>Vérification en cours</h1>
        <p>Le contexte existant est vérifié avant d’afficher ce parcours.</p>
      </section>
    </div>
  );
}

export function ProtectedSessionBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const { refreshSession, state } = useAdminSession();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    enforceLightOnlyTheme();
    const timer = window.setTimeout(enforceLightOnlyTheme, 0);
    return () => {
      window.clearTimeout(timer);
      enforceLightOnlyTheme();
    };
  }, [state.status]);

  useEffect(() => {
    if (!started.current && state.status === 'CHECKING') {
      started.current = true;
      void refreshSession();
    }
  }, [refreshSession, state.status]);

  useEffect(() => {
    if (state.status === 'ANONYMOUS') {
      const reason =
        state.reason === undefined ? '' : `?reason=${encodeURIComponent(state.reason)}`;
      router.replace(`/login${reason}`);
    } else if (state.status === 'PREAUTH') {
      const destination = state.preAuth.nextStep === 'TOTP_VERIFY' ? '/2fa/verify' : '/2fa/setup';
      router.replace(destination);
    }
  }, [router, state]);

  if (state.status === 'AUTHENTICATED' || state.status === 'REFRESHING') return children;
  if (state.status === 'UNSUPPORTED') {
    return (
      <main className="admin-session-gate" id="contenu-principal" tabIndex={-1}>
        <div className="admin-status-card" role="alert">
          <p className="admin-eyebrow">Session sécurisée</p>
          <h1>Navigateur non pris en charge</h1>
          <p>
            La coordination sécurisée entre onglets est indisponible. Utilisez un navigateur
            compatible.
          </p>
        </div>
      </main>
    );
  }
  return (
    <main aria-busy="true" className="admin-session-gate" id="contenu-principal" tabIndex={-1}>
      <div aria-live="polite" className="admin-status-card" role="status">
        <p className="admin-eyebrow">Session sécurisée</p>
        <h1>Vérification en cours</h1>
        <p>Votre session est vérifiée avant tout affichage protégé.</p>
      </div>
    </main>
  );
}
