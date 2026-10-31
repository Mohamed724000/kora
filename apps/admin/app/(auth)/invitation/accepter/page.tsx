'use client';

import { useRouter } from 'next/navigation';
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

export default function InvitationAcceptancePage() {
  const { client, establishPreAuth } = useAdminSession();
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [invitationCode, setInvitationCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
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
      const preAuth = await client.acceptInvitation(invitationCode, password);
      establishPreAuth(preAuth);
      router.replace('/2fa/setup');
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      if (cause instanceof AdminAuthRequestError && cause.outcome === 'UNKNOWN') setUnknown(true);
      setError(
        cause instanceof AdminAuthRequestError ? cause.message : 'Acceptation indisponible.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      description="Saisissez manuellement votre code et choisissez votre mot de passe."
      title="Accepter une invitation"
      wide
    >
      <form aria-busy={busy} className="auth-form" onSubmit={(event) => void submit(event)}>
        {error === undefined ? null : (
          <p className="auth-alert" role="alert">
            {error}
          </p>
        )}
        <AuthFormField
          autoComplete="off"
          disabled={busy || unknown || retryAfter.blocked}
          label="Code d’invitation"
          onChange={(event) => setInvitationCode(event.currentTarget.value)}
          required
          spellCheck={false}
          value={invitationCode}
        />
        <AuthFormField
          autoComplete="new-password"
          disabled={busy || unknown || retryAfter.blocked}
          error={passwordError}
          hint="12 à 128 points de code Unicode, transmis sans transformation."
          label="Mot de passe"
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
            ? 'Acceptation…'
            : retryAfter.blocked
              ? 'Veuillez patienter'
              : 'Accepter et configurer le TOTP'}
        </button>
      </form>
    </AuthCard>
  );
}
