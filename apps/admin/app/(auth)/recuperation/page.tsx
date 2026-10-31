'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { AuthCard } from '../../../components/auth/auth-card';
import {
  AdminRetryAfterStatus,
  AuthFormField,
  useAdminRetryAfter,
} from '../../../components/auth/auth-form-field';
import { AdminAuthRequestError } from '../../../lib/auth/admin-auth-errors';
import { useAdminSession } from '../../../lib/auth/admin-session-context';

export default function PasswordRecoveryPage() {
  const { client } = useAdminSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string>();
  const retryAfter = useAdminRetryAfter();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (retryAfter.blocked) return;
    setBusy(true);
    setError(undefined);
    try {
      await client.requestPasswordReset(email);
      setAccepted(true);
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      setError(cause instanceof AdminAuthRequestError ? cause.message : 'Demande indisponible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      description="La réponse reste identique, que le compte existe ou non."
      title="Récupération du mot de passe"
    >
      {accepted ? (
        <div className="auth-form">
          <p aria-live="polite" className="auth-status" role="status">
            Si la demande est recevable, elle a été acceptée.
          </p>
          <Link className="admin-primary-link" href="/recuperation/reinitialiser">
            J’ai reçu un code
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
            autoComplete="username"
            disabled={busy || retryAfter.blocked}
            label="Adresse e-mail"
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
            type="email"
            value={email}
          />
          <AdminRetryAfterStatus remainingSeconds={retryAfter.remainingSeconds} />
          <button className="auth-submit" disabled={busy || retryAfter.blocked} type="submit">
            {busy ? 'Traitement…' : retryAfter.blocked ? 'Veuillez patienter' : 'Demander un code'}
          </button>
        </form>
      )}
      <p className="auth-secondary-link">
        <Link href="/login">Retour à la connexion</Link>
      </p>
    </AuthCard>
  );
}
