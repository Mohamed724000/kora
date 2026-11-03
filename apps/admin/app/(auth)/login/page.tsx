'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useRef, useState } from 'react';

import { AuthCard } from '../../../components/auth/auth-card';
import {
  AdminRetryAfterStatus,
  AuthFormField,
  useAdminRetryAfter,
} from '../../../components/auth/auth-form-field';
import { validAdminPasswordLength } from '../../../lib/auth/admin-auth-client';
import { AdminAuthRequestError } from '../../../lib/auth/admin-auth-errors';
import { useAdminSession } from '../../../lib/auth/admin-session-context';
import { safeAdminReturnTo } from '../../../lib/auth/safe-return-to';

function LoginForm() {
  const { client, establishPreAuth } = useAdminSession();
  const router = useRouter();
  const search = useSearchParams();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const retryAfter = useAdminRetryAfter();
  const reason = search.get('reason');
  const reasonMessage =
    reason === 'signed-out'
      ? 'Vous êtes déconnecté.'
      : reason === 'logout-result-unknown'
        ? 'La session locale est fermée. La révocation distante n’a pas pu être confirmée.'
        : reason === 'session-expired'
          ? 'Votre session a expiré. Reconnectez-vous.'
          : reason === 'preauth-expired'
            ? 'Le parcours d’authentification a expiré. Recommencez.'
            : reason === 'refresh-result-unknown'
              ? 'La session locale a été fermée car son renouvellement n’a pas pu être confirmé.'
              : reason === 'session-invalidated'
                ? 'Votre session a été invalidée dans un autre onglet.'
                : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (retryAfter.blocked) return;
    setError(undefined);
    setPasswordError(undefined);
    if (!validAdminPasswordLength(password)) {
      setPasswordError('Le mot de passe doit contenir entre 12 et 128 points de code Unicode.');
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const preAuth = await client.login(email, password);
      establishPreAuth(preAuth);
      const returnTo = safeAdminReturnTo(search.get('returnTo'));
      const destination = preAuth.nextStep === 'TOTP_VERIFY' ? '/2fa/verify' : '/2fa/setup';
      router.replace(`${destination}?returnTo=${encodeURIComponent(returnTo)}`);
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      setError(
        cause instanceof AdminAuthRequestError
          ? cause.message
          : 'Le service est temporairement indisponible.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard description="Utilisez votre identité d’administration." title="Connexion">
      <form aria-busy={busy} className="auth-form" onSubmit={(event) => void submit(event)}>
        {reasonMessage === undefined ? null : (
          <p className="auth-status" role="status">
            {reasonMessage}
          </p>
        )}
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
        <AuthFormField
          autoComplete="current-password"
          disabled={busy || retryAfter.blocked}
          error={passwordError}
          hint="Entre 12 et 128 points de code Unicode, sans transformation."
          label="Mot de passe"
          onChange={(event) => setPassword(event.currentTarget.value)}
          ref={passwordRef}
          required
          type="password"
          value={password}
        />
        <AdminRetryAfterStatus remainingSeconds={retryAfter.remainingSeconds} />
        <button className="auth-submit" disabled={busy || retryAfter.blocked} type="submit">
          {busy ? 'Vérification…' : retryAfter.blocked ? 'Veuillez patienter' : 'Continuer'}
        </button>
      </form>
      <p className="auth-secondary-link">
        <Link href="/recuperation">Mot de passe oublié ?</Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <p aria-live="polite" role="status">
          Préparation de la connexion…
        </p>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
