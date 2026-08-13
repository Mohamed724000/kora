import type { ErrorEvent, EventHint, NodeOptions } from '@sentry/node';
import type { RuntimeConfig } from '../config/runtime-config';
import { sanitizeObservabilityValue } from './structured-logger';

type ObservabilityConfig = RuntimeConfig['observability'];

export interface SentryAdapter {
  captureException(exception: unknown, hint?: EventHint): string;
  init(options: NodeOptions): void;
}

let enabled = false;
let activeAdapter: Pick<SentryAdapter, 'captureException'> | undefined;

export function sanitizeSentryEvent<T extends ErrorEvent>(event: T): T {
  const sanitized = sanitizeObservabilityValue(event) as T;
  return {
    ...sanitized,
    request: undefined,
    user: undefined,
  };
}

export async function initializeSentry(
  config: ObservabilityConfig,
  adapter?: SentryAdapter,
): Promise<boolean> {
  if (config.dsn === undefined) {
    enabled = false;
    activeAdapter = undefined;
    return false;
  }

  const resolvedAdapter = adapter ?? (await import('@sentry/node'));
  resolvedAdapter.init({
    beforeSend: sanitizeSentryEvent,
    dsn: config.dsn,
    enableLogs: false,
    environment: config.environment,
    release: config.release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  enabled = true;
  activeAdapter = resolvedAdapter;
  return true;
}

export function captureSentryException(
  exception: unknown,
  context: Readonly<{ path?: string; requestId?: string }> = {},
  adapter?: Pick<SentryAdapter, 'captureException'>,
): void {
  const resolvedAdapter = adapter ?? activeAdapter;
  if (!enabled || resolvedAdapter === undefined) {
    return;
  }

  resolvedAdapter.captureException(exception, {
    captureContext: {
      tags: {
        ...(context.path === undefined ? {} : { path: context.path }),
        ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      },
    },
  });
}
