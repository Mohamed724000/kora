'use client';

import type { AdminSessionSummary } from '@kora-plus/contracts';
import { type FormEvent, useRef, useState } from 'react';

import { AdminRetryAfterStatus } from './auth-form-field';
import { TotpInput } from './totp-input';

type AccountSecurityPanelProps = {
  error?: string | undefined;
  loading: boolean;
  onLogout: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onRotate: (totpCode: string) => Promise<void>;
  rotationBlocked: boolean;
  rotationRateLimited: boolean;
  rotationRetryAfterSeconds: number;
  sessions: readonly AdminSessionSummary[];
};

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Date indisponible';
}

export function AccountSecurityPanel({
  error,
  loading,
  onLogout,
  onRefresh,
  onRotate,
  rotationBlocked,
  rotationRateLimited,
  rotationRetryAfterSeconds,
  sessions,
}: Readonly<AccountSecurityPanelProps>) {
  const [totpCode, setTotpCode] = useState('');
  const [rotating, setRotating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [totpError, setTotpError] = useState<string>();
  const rotationInFlight = useRef(false);
  const logoutInFlight = useRef(false);
  const totpRef = useRef<HTMLInputElement>(null);

  const rotate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rotationInFlight.current || rotationBlocked || rotationRateLimited) return;
    setTotpError(undefined);
    if (!/^\d{6}$/u.test(totpCode)) {
      setTotpError('Saisissez les six chiffres de votre application d’authentification.');
      totpRef.current?.focus();
      return;
    }
    rotationInFlight.current = true;
    setRotating(true);
    try {
      await onRotate(totpCode);
    } finally {
      rotationInFlight.current = false;
      setRotating(false);
    }
  };

  const signOut = async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      logoutInFlight.current = false;
      setLoggingOut(false);
    }
  };

  return (
    <div className="account-security-grid">
      {error === undefined ? null : (
        <p className="auth-alert" role="alert">
          {error}
        </p>
      )}
      <section aria-labelledby="sessions-title" className="admin-personal-card">
        <p className="admin-eyebrow">Votre compte</p>
        <h2 id="sessions-title">Sessions actives</h2>
        {loading ? (
          <p aria-live="polite" role="status">
            Chargement des sessions…
          </p>
        ) : (
          <ul className="admin-session-list">
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <strong>{session.current ? 'Session actuelle' : 'Autre session active'}</strong>
                <span>Dernière activité : {dateTime(session.lastSeenAt)}</span>
                <span>Expiration d’inactivité : {dateTime(session.idleExpiresAt)}</span>
                <span>Expiration absolue : {dateTime(session.absoluteExpiresAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          className="auth-secondary"
          disabled={loading}
          onClick={() => void onRefresh()}
          type="button"
        >
          Actualiser la liste
        </button>
      </section>

      <section aria-labelledby="rotation-title" className="admin-personal-card">
        <p className="admin-eyebrow">Accès de secours</p>
        <h2 id="rotation-title">Renouveler mes codes de récupération</h2>
        <p>La rotation invalide les anciens codes. Le code TOTP est vérifié par le serveur.</p>
        <form aria-busy={rotating} className="auth-form" onSubmit={(event) => void rotate(event)}>
          <TotpInput
            disabled={rotating || rotationBlocked || rotationRateLimited}
            error={totpError}
            onChange={(event) => setTotpCode(event.currentTarget.value)}
            ref={totpRef}
            value={totpCode}
          />
          <button
            className="auth-submit"
            disabled={rotating || rotationBlocked || rotationRateLimited}
            type="submit"
          >
            {rotating
              ? 'Rotation en cours…'
              : rotationBlocked
                ? 'Résultat inconnu — rotation bloquée'
                : rotationRateLimited
                  ? 'Veuillez patienter'
                  : 'Créer dix nouveaux codes'}
          </button>
          <AdminRetryAfterStatus remainingSeconds={rotationRetryAfterSeconds} />
        </form>
      </section>

      <section aria-labelledby="logout-title" className="admin-personal-card">
        <p className="admin-eyebrow">Session actuelle</p>
        <h2 id="logout-title">Se déconnecter</h2>
        <p>La session locale sera effacée même si la réponse du serveur reste incertaine.</p>
        <button
          className="auth-secondary auth-secondary--danger"
          disabled={loggingOut}
          onClick={() => void signOut()}
          type="button"
        >
          {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </section>
    </div>
  );
}
