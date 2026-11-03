import type { AdminAccessSession, AdminPreAuth } from '@kora-plus/contracts';

export type AdminSessionState =
  | { generation: number; status: 'CHECKING' }
  | { generation: number; reason?: string; status: 'ANONYMOUS' }
  | { generation: number; preAuth: AdminPreAuth; status: 'PREAUTH' }
  | { generation: number; session: AdminAccessSession; status: 'AUTHENTICATED' }
  | { generation: number; session: AdminAccessSession; status: 'REFRESHING' }
  | { generation: number; status: 'UNSUPPORTED' };

export type AdminSessionEvent =
  | { type: 'BEGIN_CHECK' }
  | { preAuth: AdminPreAuth; type: 'PREAUTH_RECEIVED' }
  | { session: AdminAccessSession; type: 'SESSION_RECEIVED' }
  | { type: 'BEGIN_REFRESH' }
  | { type: 'REFRESH_DEFERRED' }
  | { reason?: string; type: 'CLEAR' }
  | { generation: number; type: 'INVALIDATE' }
  | { generation: number; type: 'REMOTE_ROTATION' }
  | { type: 'UNSUPPORTED' };

function nextGeneration(state: AdminSessionState): number {
  return state.generation + 1;
}

export function reduceAdminSession(
  state: AdminSessionState,
  event: AdminSessionEvent,
): AdminSessionState {
  switch (event.type) {
    case 'BEGIN_CHECK':
      return { generation: state.generation, status: 'CHECKING' };
    case 'PREAUTH_RECEIVED':
      return { generation: nextGeneration(state), preAuth: event.preAuth, status: 'PREAUTH' };
    case 'SESSION_RECEIVED':
      return { generation: nextGeneration(state), session: event.session, status: 'AUTHENTICATED' };
    case 'BEGIN_REFRESH':
      return state.status === 'AUTHENTICATED'
        ? { generation: state.generation, session: state.session, status: 'REFRESHING' }
        : state;
    case 'REFRESH_DEFERRED':
      return state.status === 'REFRESHING'
        ? { generation: state.generation, session: state.session, status: 'AUTHENTICATED' }
        : state;
    case 'CLEAR': {
      const result: AdminSessionState = {
        generation: nextGeneration(state),
        status: 'ANONYMOUS',
      };
      return event.reason === undefined ? result : { ...result, reason: event.reason };
    }
    case 'INVALIDATE':
      return {
        generation: Math.max(event.generation, state.generation + 1),
        reason: 'session-invalidated',
        status: 'ANONYMOUS',
      };
    case 'REMOTE_ROTATION':
      return { ...state, generation: Math.max(event.generation, state.generation + 1) };
    case 'UNSUPPORTED':
      return { generation: nextGeneration(state), status: 'UNSUPPORTED' };
  }
}
