'use client';

import type { AdminSessionSummary } from '@kora-plus/contracts';
import { AppContent } from '@adminlte/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AccountSecurityPanel } from '../../../../components/auth/account-security-panel';
import { useAdminRetryAfter } from '../../../../components/auth/auth-form-field';
import { IdempotentIntent } from '../../../../lib/auth/idempotency';
import { AdminAuthRequestError } from '../../../../lib/auth/admin-auth-errors';
import { useAdminSession } from '../../../../lib/auth/admin-session-context';

export default function AccountSecurityPage() {
  const { clearSession, client, logout, presentRecoveryCodes, refreshSession, state } =
    useAdminSession();
  const router = useRouter();
  const [sessions, setSessions] = useState<readonly AdminSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [rotationBlocked, setRotationBlocked] = useState(false);
  const rotationInFlight = useRef(false);
  const rotationIntent = useRef<IdempotentIntent<string> | undefined>(undefined);
  const retryAfter = useAdminRetryAfter();

  const load = useCallback(async () => {
    if (state.status !== 'AUTHENTICATED') return;
    setLoading(true);
    setError(undefined);
    try {
      setSessions(await client.listSessions(state.session.accessToken));
    } catch (cause: unknown) {
      if (cause instanceof AdminAuthRequestError && cause.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed !== null) {
          try {
            setSessions(await client.listSessions(refreshed.accessToken));
            return;
          } catch (retryCause: unknown) {
            setError(
              retryCause instanceof AdminAuthRequestError
                ? retryCause.message
                : 'Liste indisponible.',
            );
            return;
          }
        }
      }
      setError(cause instanceof AdminAuthRequestError ? cause.message : 'Liste indisponible.');
    } finally {
      setLoading(false);
    }
  }, [client, refreshSession, state]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rotate = async (totpCode: string) => {
    if (
      state.status !== 'AUTHENTICATED' ||
      rotationBlocked ||
      retryAfter.blocked ||
      rotationInFlight.current
    ) {
      return;
    }
    rotationInFlight.current = true;
    setError(undefined);
    if (rotationIntent.current?.payload !== totpCode) {
      rotationIntent.current = new IdempotentIntent(totpCode);
    }
    try {
      const codes = await client.rotateRecoveryCodes(
        state.session.accessToken,
        totpCode,
        rotationIntent.current.key,
      );
      rotationIntent.current = undefined;
      presentRecoveryCodes(codes);
      router.push('/2fa/recovery-codes');
    } catch (cause: unknown) {
      retryAfter.observe(cause);
      if (cause instanceof AdminAuthRequestError && cause.status === 401) {
        rotationIntent.current = undefined;
        clearSession('session-expired');
        router.replace('/login?reason=session-expired');
        return;
      }
      if (cause instanceof AdminAuthRequestError && cause.outcome === 'UNKNOWN') {
        setRotationBlocked(true);
      } else {
        rotationIntent.current = undefined;
      }
      setError(cause instanceof AdminAuthRequestError ? cause.message : 'Rotation indisponible.');
    } finally {
      rotationInFlight.current = false;
    }
  };

  const signOut = async () => {
    try {
      await logout();
      router.replace('/login?reason=signed-out');
    } catch (cause: unknown) {
      const reason =
        cause instanceof AdminAuthRequestError && cause.outcome === 'UNKNOWN'
          ? 'logout-result-unknown'
          : 'signed-out';
      router.replace(`/login?reason=${reason}`);
    }
  };

  return (
    <AppContent breadcrumbs={[{ label: 'Administration' }, { label: 'Sécurité du compte' }]}>
      <div className="admin-protected-content" id="contenu-principal" tabIndex={-1}>
        <h1 className="admin-page-title">Sécurité du compte</h1>
        <AccountSecurityPanel
          error={error}
          loading={loading}
          onLogout={signOut}
          onRefresh={load}
          onRotate={rotate}
          rotationBlocked={rotationBlocked}
          rotationRateLimited={retryAfter.blocked}
          rotationRetryAfterSeconds={retryAfter.remainingSeconds}
          sessions={sessions}
        />
      </div>
    </AppContent>
  );
}
