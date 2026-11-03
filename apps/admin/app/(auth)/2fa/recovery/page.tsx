'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

import { AuthCard } from '../../../../components/auth/auth-card';
import {
  AdminRetryAfterStatus,
  AuthFormField,
  useAdminRetryAfter,
} from '../../../../components/auth/auth-form-field';
import { AdminAuthRequestError } from '../../../../lib/auth/admin-auth-errors';
import { useAdminSession } from '../../../../lib/auth/admin-session-context';

export default function RecoveryCodePage() {
  const { clearSession, client, establishPreAuth } = useAdminSession();
  const router = useRouter();
  const selectorRef = useRef<HTMLInputElement>(null);
  const verifierRef = useRef<HTMLInputElement>(null);
  const [selector, setSelector] = useState('');
  const [verifier, setVerifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selectorError, setSelectorError] = useState<string>();
  const [verifierError, setVerifierError] = useState<string>();
  const retryAfter = useAdminRetryAfter();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (retryAfter.blocked) return;
    setError(undefined);
    setSelectorError(undefined);
    setVerifierError(undefined);
    const selectorValid = /^[A-HJ-NP-Z2-9]{8,16}$/u.test(selector);
    const verifierValid = /^[A-HJ-NP-Z2-9]{26,32}$/u.test(verifier);
    if (!selectorValid || !verifierValid) {
      if (!selectorValid) setSelectorError('Vérifiez le format du sélecteur.');
      if (!verifierValid) setVerifierError('Vérifiez le format du vérificateur.');
      (selectorValid ? verifierRef : selectorRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      const recovery = await client.verifyRecoveryCode(selector, verifier);
      establishPreAuth({
        challengeId: recovery.recoveryContextId,
        expiresAt: recovery.expiresAt,
        nextStep: 'MFA_RECOVERY_TOTP_ENROLLMENT',
      });
      router.replace('/2fa/setup');
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      if (cause instanceof AdminAuthRequestError && cause.status === 401) {
        clearSession('preauth-expired');
        router.replace('/login?reason=preauth-expired');
        return;
      }
      if (cause instanceof AdminAuthRequestError && cause.code === 'ADMIN_RECOVERY_CODE_INVALID') {
        setVerifierError(cause.message);
        verifierRef.current?.focus();
      } else {
        setError(
          cause instanceof AdminAuthRequestError ? cause.message : 'Vérification indisponible.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      description="Le code est composé d’un sélecteur et d’un vérificateur distincts."
      title="Récupérer mon accès"
    >
      <form aria-busy={busy} className="auth-form" onSubmit={(event) => void submit(event)}>
        {error === undefined ? null : (
          <p className="auth-alert" role="alert">
            {error}
          </p>
        )}
        <AuthFormField
          autoCapitalize="characters"
          autoComplete="off"
          disabled={busy || retryAfter.blocked}
          error={selectorError}
          hint="8 à 16 caractères A–Z et 2–9, sans I ni O."
          label="Sélecteur"
          onChange={(event) => setSelector(event.currentTarget.value.toUpperCase())}
          ref={selectorRef}
          required
          spellCheck={false}
          value={selector}
        />
        <AuthFormField
          autoCapitalize="characters"
          autoComplete="off"
          disabled={busy || retryAfter.blocked}
          error={verifierError}
          hint="26 à 32 caractères A–Z et 2–9, sans I ni O."
          label="Vérificateur"
          onChange={(event) => setVerifier(event.currentTarget.value.toUpperCase())}
          required
          ref={verifierRef}
          spellCheck={false}
          value={verifier}
        />
        <AdminRetryAfterStatus remainingSeconds={retryAfter.remainingSeconds} />
        <button className="auth-submit" disabled={busy || retryAfter.blocked} type="submit">
          {busy
            ? 'Vérification…'
            : retryAfter.blocked
              ? 'Veuillez patienter'
              : 'Continuer vers un nouvel enrôlement'}
        </button>
      </form>
    </AuthCard>
  );
}
