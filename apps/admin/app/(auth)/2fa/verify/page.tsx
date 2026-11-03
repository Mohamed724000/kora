'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useRef, useState } from 'react';

import { AuthCard } from '../../../../components/auth/auth-card';
import {
  AdminRetryAfterStatus,
  useAdminRetryAfter,
} from '../../../../components/auth/auth-form-field';
import { TotpInput } from '../../../../components/auth/totp-input';
import { AdminAuthRequestError } from '../../../../lib/auth/admin-auth-errors';
import { useAdminSession } from '../../../../lib/auth/admin-session-context';
import { safeAdminReturnTo } from '../../../../lib/auth/safe-return-to';

function VerifyTotpForm() {
  const { clearSession, client, establishSession } = useAdminSession();
  const router = useRouter();
  const search = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const retryAfter = useAdminRetryAfter();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (retryAfter.blocked) return;
    setError(undefined);
    setFieldError(undefined);
    if (!/^\d{6}$/u.test(code)) {
      setFieldError('Saisissez les six chiffres de votre application d’authentification.');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const session = await client.verifyTotp(code);
      establishSession(session);
      router.replace(safeAdminReturnTo(search.get('returnTo')));
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      if (
        cause instanceof AdminAuthRequestError &&
        (cause.status === 401 || cause.code === 'OTP_EXPIRED')
      ) {
        clearSession('preauth-expired');
        router.replace('/login?reason=preauth-expired');
        return;
      }
      setError(
        cause instanceof AdminAuthRequestError ? cause.message : 'Vérification indisponible.',
      );
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      description="Saisissez le code actuel de votre application."
      title="Double authentification"
    >
      <form aria-busy={busy} className="auth-form" onSubmit={(event) => void submit(event)}>
        {error === undefined ? null : (
          <p className="auth-alert" role="alert">
            {error}
          </p>
        )}
        <TotpInput
          disabled={busy || retryAfter.blocked}
          error={fieldError}
          onChange={(event) => setCode(event.currentTarget.value)}
          ref={inputRef}
          required
          value={code}
        />
        <AdminRetryAfterStatus remainingSeconds={retryAfter.remainingSeconds} />
        <button className="auth-submit" disabled={busy || retryAfter.blocked} type="submit">
          {busy ? 'Vérification…' : retryAfter.blocked ? 'Veuillez patienter' : 'Ouvrir ma session'}
        </button>
      </form>
      <p className="auth-secondary-link">
        <Link href="/2fa/recovery">Utiliser un code de récupération</Link>
      </p>
    </AuthCard>
  );
}

export default function VerifyTotpPage() {
  return (
    <Suspense fallback={<p role="status">Préparation…</p>}>
      <VerifyTotpForm />
    </Suspense>
  );
}
