'use client';

import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';

import { AuthCard } from '../../../../components/auth/auth-card';
import {
  AdminRetryAfterStatus,
  AuthFormField,
  useAdminRetryAfter,
} from '../../../../components/auth/auth-form-field';
import { validAdminPasswordLength } from '../../../../lib/auth/admin-auth-client';
import { AdminAuthRequestError } from '../../../../lib/auth/admin-auth-errors';
import { useAdminSession } from '../../../../lib/auth/admin-session-context';

export default function PasswordResetPage() {
  const { clearSession, client } = useAdminSession();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [resetCode, setResetCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string>();
  const [unknown, setUnknown] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmationError, setConfirmationError] = useState<string>();
  const retryAfter = useAdminRetryAfter();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (retryAfter.blocked) return;
    setError(undefined);
    setPasswordError(undefined);
    setConfirmationError(undefined);
    if (!validAdminPasswordLength(password)) {
      setPasswordError('Le mot de passe doit contenir entre 12 et 128 points de code Unicode.');
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirmation) {
      setConfirmationError('La confirmation ne correspond pas au mot de passe.');
      confirmationRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await client.resetPassword(resetCode, password);
      clearSession('password-reset');
      setCompleted(true);
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      if (cause instanceof AdminAuthRequestError && cause.outcome === 'UNKNOWN') {
        clearSession('password-reset-result-unknown');
        setUnknown(true);
      }
      setError(
        cause instanceof AdminAuthRequestError ? cause.message : 'Réinitialisation indisponible.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      description="Saisissez manuellement le code reçu. Aucun code n’est accepté dans l’URL."
      title="Choisir un nouveau mot de passe"
      wide
    >
      {completed ? (
        <div className="auth-form">
          <p className="auth-status" role="status">
            Le mot de passe a été remplacé. Reconnectez-vous avec sa valeur exacte.
          </p>
          <Link className="admin-primary-link" href="/login">
            Revenir à la connexion
          </Link>
        </div>
      ) : (
        <form aria-busy={busy} className="auth-form" onSubmit={(event) => void submit(event)}>
          {error === undefined ? null : (
            <p className="auth-alert" role="alert">
              {error}
            </p>
          )}
          <AuthFormField
            autoComplete="off"
            disabled={busy || unknown || retryAfter.blocked}
            label="Code de réinitialisation"
            onChange={(event) => setResetCode(event.currentTarget.value)}
            required
            spellCheck={false}
            value={resetCode}
          />
          <AuthFormField
            autoComplete="new-password"
            disabled={busy || unknown || retryAfter.blocked}
            error={passwordError}
            hint="12 à 128 points de code Unicode ; aucun espace n’est supprimé."
            label="Nouveau mot de passe"
            onChange={(event) => setPassword(event.currentTarget.value)}
            ref={passwordRef}
            required
            type="password"
            value={password}
          />
          <AuthFormField
            autoComplete="new-password"
            disabled={busy || unknown || retryAfter.blocked}
            error={confirmationError}
            label="Confirmer le mot de passe"
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            required
            ref={confirmationRef}
            type="password"
            value={confirmation}
          />
          <AdminRetryAfterStatus remainingSeconds={retryAfter.remainingSeconds} />
          <button
            className="auth-submit"
            disabled={busy || unknown || retryAfter.blocked}
            type="submit"
          >
            {busy
              ? 'Réinitialisation…'
              : retryAfter.blocked
                ? 'Veuillez patienter'
                : 'Remplacer le mot de passe'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
