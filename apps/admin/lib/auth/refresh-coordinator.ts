const LOCK_NAME = 'kora-admin-refresh-v1';
const CHANNEL_NAME = 'kora-admin-session-v1';

export class RefreshCoordinationUnavailableError extends Error {
  constructor() {
    super('Ce navigateur ne fournit pas la coordination de session requise.');
    this.name = 'RefreshCoordinationUnavailableError';
  }
}

export type AdminSessionSignal =
  { generation: number; type: 'INVALIDATE' } | { generation: number; type: 'SESSION_ROTATED' };

function signal(value: unknown): value is AdminSessionSignal {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    !('generation' in value)
  ) {
    return false;
  }
  const candidate = value as { generation: unknown; type: unknown };
  return (
    Number.isSafeInteger(candidate.generation) &&
    Number(candidate.generation) >= 0 &&
    (candidate.type === 'INVALIDATE' || candidate.type === 'SESSION_ROTATED')
  );
}

export class AdminRefreshCoordinator {
  #inFlight: Promise<unknown> | undefined;

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#inFlight !== undefined) return this.#inFlight as Promise<T>;
    if (typeof navigator === 'undefined' || navigator.locks === undefined) {
      throw new RefreshCoordinationUnavailableError();
    }
    const promise = navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, task);
    this.#inFlight = promise;
    try {
      return await promise;
    } finally {
      if (this.#inFlight === promise) this.#inFlight = undefined;
    }
  }
}

export function openAdminSessionChannel(listener: (signal: AdminSessionSignal) => void): {
  close: () => void;
  publish: (signal: AdminSessionSignal) => void;
} {
  if (typeof BroadcastChannel === 'undefined') {
    throw new RefreshCoordinationUnavailableError();
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (signal(event.data)) listener(event.data);
  };
  return {
    close: () => channel.close(),
    publish: (message) => channel.postMessage(message),
  };
}
