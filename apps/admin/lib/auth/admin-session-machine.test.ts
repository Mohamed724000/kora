import type { AdminAccessSession, AdminPreAuth } from '@kora-plus/contracts';
import { describe, expect, it } from 'vitest';

import { reduceAdminSession, type AdminSessionState } from './admin-session-machine';

const preAuth: AdminPreAuth = {
  challengeId: '00000000-0000-4000-8000-000000000001',
  expiresAt: '2026-10-26T23:00:00.000Z',
  nextStep: 'TOTP_VERIFY',
};

const session: AdminAccessSession = {
  absoluteExpiresAt: '2026-10-27T11:00:00.000Z',
  accessExpiresAt: '2026-10-26T23:10:00.000Z',
  accessToken: 'memory-only-token',
  authorizationVersion: 1,
  idleExpiresAt: '2026-10-26T23:30:00.000Z',
  role: 'SUPER_ADMIN',
  sessionId: '00000000-0000-4000-8000-000000000002',
};

describe('machine de session C3', () => {
  it('fait progresser les générations sans persistance', () => {
    let state: AdminSessionState = { generation: 0, status: 'CHECKING' };
    state = reduceAdminSession(state, { preAuth, type: 'PREAUTH_RECEIVED' });
    expect(state).toEqual({ generation: 1, preAuth, status: 'PREAUTH' });

    state = reduceAdminSession(state, { session, type: 'SESSION_RECEIVED' });
    expect(state).toEqual({ generation: 2, session, status: 'AUTHENTICATED' });
  });

  it('ne réinstalle pas un contexte après invalidation plus récente', () => {
    const active: AdminSessionState = { generation: 4, session, status: 'AUTHENTICATED' };
    const invalidated = reduceAdminSession(active, { generation: 5, type: 'INVALIDATE' });

    expect(invalidated).toEqual({
      generation: 5,
      reason: 'session-invalidated',
      status: 'ANONYMOUS',
    });
    expect(reduceAdminSession(invalidated, { generation: 4, type: 'REMOTE_ROTATION' })).toEqual({
      generation: 6,
      reason: 'session-invalidated',
      status: 'ANONYMOUS',
    });
  });

  it('conserve le jeton mémoire local lors d’une rotation distante non secrète', () => {
    const active: AdminSessionState = { generation: 4, session, status: 'AUTHENTICATED' };

    expect(reduceAdminSession(active, { generation: 5, type: 'REMOTE_ROTATION' })).toEqual({
      generation: 5,
      session,
      status: 'AUTHENTICATED',
    });
  });

  it('restaure la session mémoire après un refresh différé par Retry-After', () => {
    const refreshing: AdminSessionState = { generation: 4, session, status: 'REFRESHING' };

    expect(reduceAdminSession(refreshing, { type: 'REFRESH_DEFERRED' })).toEqual({
      generation: 4,
      session,
      status: 'AUTHENTICATED',
    });
    expect(
      reduceAdminSession({ generation: 0, status: 'CHECKING' }, { type: 'REFRESH_DEFERRED' }),
    ).toEqual({ generation: 0, status: 'CHECKING' });
  });
});
