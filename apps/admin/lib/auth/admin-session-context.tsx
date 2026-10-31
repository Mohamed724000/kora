'use client';

import type { AdminAccessSession, AdminPreAuth, AdminRecoveryCode } from '@kora-plus/contracts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { AdminAuthClient } from './admin-auth-client';
import { AdminAuthRequestError } from './admin-auth-errors';
import { reduceAdminSession, type AdminSessionState } from './admin-session-machine';
import {
  AdminRefreshCoordinator,
  openAdminSessionChannel,
  RefreshCoordinationUnavailableError,
} from './refresh-coordinator';

type AdminSessionContextValue = {
  clearSession: (reason?: string) => void;
  client: AdminAuthClient;
  establishPreAuth: (preAuth: AdminPreAuth) => void;
  establishSession: (session: AdminAccessSession) => void;
  logout: () => Promise<void>;
  clearRecoveryCodes: () => void;
  presentRecoveryCodes: (codes: readonly AdminRecoveryCode[]) => void;
  recoveryCodes: readonly AdminRecoveryCode[] | null;
  refreshSession: () => Promise<AdminAccessSession | null>;
  state: AdminSessionState;
};

const AdminSessionContext = createContext<AdminSessionContextValue | undefined>(undefined);
const initialState: AdminSessionState = { generation: 0, status: 'CHECKING' };

export function AdminSessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, dispatch] = useReducer(reduceAdminSession, initialState);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly AdminRecoveryCode[] | null>(null);
  const stateRef = useRef(state);
  const generationRef = useRef(0);
  const coordinator = useMemo(() => new AdminRefreshCoordinator(), []);
  const client = useMemo(() => new AdminAuthClient(), []);
  const channelRef = useRef<ReturnType<typeof openAdminSessionChannel> | undefined>(undefined);
  const logoutInFlightRef = useRef<Promise<void> | undefined>(undefined);
  const refreshNotBeforeRef = useRef(0);
  const refreshRetryTimerRef = useRef<number | undefined>(undefined);
  const refreshSessionRef = useRef<(() => Promise<AdminAccessSession | null>) | undefined>(
    undefined,
  );

  const cancelDeferredRefresh = useCallback(() => {
    refreshNotBeforeRef.current = 0;
    if (refreshRetryTimerRef.current !== undefined) {
      window.clearTimeout(refreshRetryTimerRef.current);
      refreshRetryTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let channel: ReturnType<typeof openAdminSessionChannel>;
    try {
      channel = openAdminSessionChannel((message) => {
        setRecoveryCodes(null);
        if (message.type === 'INVALIDATE') {
          cancelDeferredRefresh();
          const generation = Math.max(message.generation, generationRef.current + 1);
          generationRef.current = generation;
          dispatch({ generation, type: 'INVALIDATE' });
          return;
        }
        dispatch({
          generation: Math.max(message.generation, stateRef.current.generation + 1),
          type: 'REMOTE_ROTATION',
        });
      });
    } catch (error: unknown) {
      if (error instanceof RefreshCoordinationUnavailableError) {
        const timer = window.setTimeout(() => {
          setRecoveryCodes(null);
          dispatch({ type: 'UNSUPPORTED' });
        }, 0);
        return () => window.clearTimeout(timer);
      }
      throw error;
    }
    channelRef.current = channel;
    return () => {
      channelRef.current = undefined;
      channel.close();
    };
  }, [cancelDeferredRefresh]);

  const clearSession = useCallback(
    (reason?: string) => {
      cancelDeferredRefresh();
      setRecoveryCodes(null);
      generationRef.current += 1;
      dispatch(reason === undefined ? { type: 'CLEAR' } : { reason, type: 'CLEAR' });
      channelRef.current?.publish({ generation: generationRef.current, type: 'INVALIDATE' });
    },
    [cancelDeferredRefresh],
  );

  const clearRecoveryCodes = useCallback(() => setRecoveryCodes(null), []);

  const presentRecoveryCodes = useCallback((codes: readonly AdminRecoveryCode[]) => {
    if (codes.length !== 10) throw new Error('Nombre de codes de récupération inattendu.');
    setRecoveryCodes(codes.map((code) => ({ selector: code.selector, verifier: code.verifier })));
  }, []);

  const establishPreAuth = useCallback((preAuth: AdminPreAuth) => {
    setRecoveryCodes(null);
    generationRef.current += 1;
    dispatch({ preAuth, type: 'PREAUTH_RECEIVED' });
  }, []);

  const establishSession = useCallback(
    (session: AdminAccessSession) => {
      cancelDeferredRefresh();
      setRecoveryCodes(null);
      generationRef.current += 1;
      dispatch({ session, type: 'SESSION_RECEIVED' });
      channelRef.current?.publish({
        generation: generationRef.current,
        type: 'SESSION_ROTATED',
      });
    },
    [cancelDeferredRefresh],
  );

  const deferRefresh = useCallback((retryAfterSeconds: number) => {
    refreshNotBeforeRef.current = Date.now() + retryAfterSeconds * 1000;
    if (refreshRetryTimerRef.current !== undefined) {
      window.clearTimeout(refreshRetryTimerRef.current);
    }
    const retry = (): void => {
      const remaining = refreshNotBeforeRef.current - Date.now();
      if (remaining > 0) {
        refreshRetryTimerRef.current = window.setTimeout(retry, remaining);
        return;
      }
      refreshRetryTimerRef.current = undefined;
      refreshNotBeforeRef.current = 0;
      void refreshSessionRef.current?.();
    };
    refreshRetryTimerRef.current = window.setTimeout(retry, retryAfterSeconds * 1000);
  }, []);

  const refreshSession = useCallback(async (): Promise<AdminAccessSession | null> => {
    if (Date.now() < refreshNotBeforeRef.current) return null;
    const startingGeneration = generationRef.current;
    dispatch({ type: 'BEGIN_REFRESH' });
    try {
      const refreshed = await coordinator.run(() => client.refresh());
      if (startingGeneration !== generationRef.current) return null;
      establishSession(refreshed);
      return refreshed;
    } catch (error: unknown) {
      if (startingGeneration !== generationRef.current) return null;
      if (error instanceof RefreshCoordinationUnavailableError) {
        generationRef.current += 1;
        dispatch({ type: 'UNSUPPORTED' });
        channelRef.current?.publish({ generation: generationRef.current, type: 'INVALIDATE' });
        return null;
      }
      if (
        error instanceof AdminAuthRequestError &&
        error.code === 'RATE_LIMITED' &&
        error.retryAfterSeconds !== undefined &&
        error.retryAfterSeconds > 0
      ) {
        dispatch({ type: 'REFRESH_DEFERRED' });
        deferRefresh(error.retryAfterSeconds);
        return null;
      }
      const reason =
        error instanceof AdminAuthRequestError && error.outcome === 'UNKNOWN'
          ? 'refresh-result-unknown'
          : 'session-expired';
      clearSession(reason);
      return null;
    }
  }, [clearSession, client, coordinator, deferRefresh, establishSession]);

  useEffect(() => {
    refreshSessionRef.current = refreshSession;
    return cancelDeferredRefresh;
  }, [cancelDeferredRefresh, refreshSession]);

  const logout = useCallback((): Promise<void> => {
    if (logoutInFlightRef.current !== undefined) return logoutInFlightRef.current;
    const operation = (async () => {
      const current = stateRef.current;
      const token =
        current.status === 'AUTHENTICATED' || current.status === 'REFRESHING'
          ? current.session.accessToken
          : undefined;
      clearSession('signed-out');
      if (token !== undefined) await client.revokeCurrent(token);
    })();
    logoutInFlightRef.current = operation;
    void operation.then(
      () => {
        if (logoutInFlightRef.current === operation) logoutInFlightRef.current = undefined;
      },
      () => {
        if (logoutInFlightRef.current === operation) logoutInFlightRef.current = undefined;
      },
    );
    return operation;
  }, [clearSession, client]);

  useEffect(() => {
    if (state.status !== 'AUTHENTICATED') return;
    const now = Date.now();
    const absolute = Date.parse(state.session.absoluteExpiresAt);
    const idle = Date.parse(state.session.idleExpiresAt);
    const access = Date.parse(state.session.accessExpiresAt);
    if (![absolute, idle, access].every(Number.isFinite) || absolute <= now || idle <= now) {
      const timer = window.setTimeout(() => clearSession('session-expired'), 0);
      return () => window.clearTimeout(timer);
    }
    const refreshAt = Math.max(now, Math.min(access - 15_000, idle - 1_000, absolute - 1_000));
    const delay = Math.min(2_147_000_000, Math.max(0, refreshAt - now));
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'hidden') return;
      void refreshSession();
    };
    const timer = window.setTimeout(refreshWhenVisible, delay);
    const onVisibility = (): void => {
      if (document.visibilityState !== 'hidden' && Date.now() >= refreshAt) {
        window.clearTimeout(timer);
        refreshWhenVisible();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clearSession, refreshSession, state]);

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      clearRecoveryCodes,
      clearSession,
      client,
      establishPreAuth,
      establishSession,
      logout,
      presentRecoveryCodes,
      recoveryCodes,
      refreshSession,
      state,
    }),
    [
      clearRecoveryCodes,
      clearSession,
      client,
      establishPreAuth,
      establishSession,
      logout,
      presentRecoveryCodes,
      recoveryCodes,
      refreshSession,
      state,
    ],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionContextValue {
  const context = useContext(AdminSessionContext);
  if (context === undefined) throw new Error('AdminSessionProvider absent.');
  return context;
}
