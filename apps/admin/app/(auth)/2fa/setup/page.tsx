'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { AuthCard } from '../../../../components/auth/auth-card';
import {
  AdminRetryAfterStatus,
  useAdminRetryAfter,
} from '../../../../components/auth/auth-form-field';
import { TotpInput } from '../../../../components/auth/totp-input';
import { AdminAuthRequestError } from '../../../../lib/auth/admin-auth-errors';
import { useAdminSession } from '../../../../lib/auth/admin-session-context';
import { createIdempotencyKey } from '../../../../lib/auth/idempotency';
import {
  decodeTotpEnrollmentPng,
  type ParsedTotpEnrollment,
} from '../../../../lib/auth/totp-qr-decoder';

type EnrollmentView = {
  enrollmentId: string;
  expiresAt: string;
  manual: ParsedTotpEnrollment;
  qrUrl: string;
};

export default function TotpSetupPage() {
  const { clearSession, client, establishSession, presentRecoveryCodes } = useAdminSession();
  const router = useRouter();
  const codeRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<EnrollmentView | undefined>(undefined);
  const [view, setView] = useState<EnrollmentView>();
  const [showManual, setShowManual] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [unknown, setUnknown] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>();
  const [fieldError, setFieldError] = useState<string>();
  const retryAfter = useAdminRetryAfter();

  useEffect(() => {
    viewRef.current = view;
    return () => {
      if (viewRef.current !== undefined) URL.revokeObjectURL(viewRef.current.qrUrl);
    };
  }, [view]);

  useEffect(() => {
    if (view === undefined) return;
    const update = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(view.expiresAt) - Date.now()) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  const begin = async () => {
    if (retryAfter.blocked) return;
    setBusy(true);
    setError(undefined);
    try {
      const enrollment = await client.createEnrollment(createIdempotencyKey());
      const qr = await client.deliverEnrollmentQr(enrollment.enrollmentId, createIdempotencyKey());
      const manual = await decodeTotpEnrollmentPng(qr);
      const qrUrl = URL.createObjectURL(qr);
      setView({ ...enrollment, manual, qrUrl });
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      if (cause instanceof AdminAuthRequestError) {
        if (cause.outcome === 'UNKNOWN') setUnknown(true);
        if (cause.status === 401 || cause.code === 'OTP_EXPIRED') {
          clearSession('preauth-expired');
          router.replace('/login?reason=preauth-expired');
          return;
        }
        setError(cause.message);
      } else {
        setError('Enrôlement indisponible.');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (view === undefined || retryAfter.blocked) return;
    setError(undefined);
    setFieldError(undefined);
    if (!/^\d{6}$/u.test(code)) {
      setFieldError('Saisissez les six chiffres de votre application d’authentification.');
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const confirmation = await client.confirmEnrollment(
        view.enrollmentId,
        code,
        createIdempotencyKey(),
      );
      establishSession(confirmation.session);
      presentRecoveryCodes(confirmation.recoveryCodes.codes);
      URL.revokeObjectURL(view.qrUrl);
      viewRef.current = undefined;
      setView(undefined);
      router.replace('/2fa/recovery-codes');
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      if (cause instanceof AdminAuthRequestError) {
        if (cause.outcome === 'UNKNOWN') setUnknown(true);
        if (cause.status === 401 || cause.code === 'OTP_EXPIRED') {
          clearSession('preauth-expired');
          router.replace('/login?reason=preauth-expired');
          return;
        }
        setError(cause.message);
      } else {
        setError('Confirmation indisponible.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      description="Le QR est livré une seule fois et reste uniquement dans cette page."
      title="Configurer la double authentification"
      wide
    >
      {error === undefined ? null : (
        <p className="auth-alert" role="alert">
          {error}
        </p>
      )}
      {view === undefined ? (
        <button
          className="auth-submit"
          disabled={busy || unknown || retryAfter.blocked}
          onClick={() => void begin()}
          type="button"
        >
          {busy ? 'Préparation…' : 'Créer mon enrôlement TOTP'}
        </button>
      ) : (
        <div className="totp-setup">
          <p
            aria-live={remainingSeconds === 0 ? 'polite' : undefined}
            className="auth-status"
            role={remainingSeconds === 0 ? 'status' : undefined}
          >
            {remainingSeconds === 0
              ? 'Cet enrôlement a expiré.'
              : `Expire dans ${remainingSeconds ?? '…'} secondes.`}
          </p>
          {/* The object URL is revoked on replacement, success and unmount. */}
          <Image
            alt="Code QR d’enrôlement TOTP"
            className="totp-qr"
            height={220}
            src={view.qrUrl}
            unoptimized
            width={220}
          />
          <button
            className="auth-secondary"
            onClick={() => setShowManual((current) => !current)}
            type="button"
          >
            {showManual ? 'Masquer la clé manuelle' : 'Je ne peux pas scanner le QR'}
          </button>
          {showManual ? (
            <div className="totp-manual" role="region" aria-label="Configuration TOTP manuelle">
              <p>
                Émetteur : <strong>{view.manual.issuer}</strong>
              </p>
              <p>
                Compte : <strong>{view.manual.accountLabel}</strong>
              </p>
              <p>
                Clé Base32 : <code>{view.manual.secret}</code>
              </p>
              <p>Algorithme SHA-256 · 6 chiffres · période 30 secondes</p>
            </div>
          ) : null}
          <form aria-busy={busy} className="auth-form" onSubmit={(event) => void confirm(event)}>
            <TotpInput
              disabled={busy || unknown || retryAfter.blocked || remainingSeconds === 0}
              error={fieldError}
              onChange={(event) => setCode(event.currentTarget.value)}
              ref={codeRef}
              required
              value={code}
            />
            <button
              className="auth-submit"
              disabled={busy || unknown || retryAfter.blocked || remainingSeconds === 0}
              type="submit"
            >
              {busy ? 'Confirmation…' : 'Confirmer et créer mes codes'}
            </button>
          </form>
          <AdminRetryAfterStatus remainingSeconds={retryAfter.remainingSeconds} />
          {remainingSeconds === 0 ? (
            <button
              className="auth-secondary"
              disabled={busy || unknown || retryAfter.blocked}
              onClick={() => {
                URL.revokeObjectURL(view.qrUrl);
                viewRef.current = undefined;
                setView(undefined);
                setRemainingSeconds(undefined);
                setCode('');
                void begin();
              }}
              type="button"
            >
              Recommencer l’enrôlement
            </button>
          ) : null}
        </div>
      )}
    </AuthCard>
  );
}
