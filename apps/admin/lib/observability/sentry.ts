import type { ErrorEvent } from '@sentry/react';

const REDACTED = '[REDACTED]';
const SENSITIVE_FIELD =
  /^(?:authorization|cookie|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|otp|dsn|email|phone|telephone|tel|user|username|ip(?:_address|address)?|device[_-]?id|card|payment)$/iu;
const SENSITIVE_TEXT: readonly RegExp[] = [
  /\bbearer\s+[^\s,;]+/giu,
  /\b(?:authorization|cookie|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|otp|dsn|email|phone|telephone|tel)(?:\s*(?:=|:)\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  /\+\d[\d .()-]{6,}\d/gu,
];

export interface SentryEnvironment {
  dsn?: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
}

export interface SafeSentryOptions {
  beforeSend(event: ErrorEvent): ErrorEvent;
  dsn: string;
  enableLogs: false;
  environment: string;
  release?: string;
  sendDefaultPii: false;
  tracesSampleRate: 0;
}

export interface SentryAdapter {
  captureException(exception: unknown): unknown;
  init(options: SafeSentryOptions): unknown;
}

function sanitizeText(value: string): string {
  return SENSITIVE_TEXT.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
}

function sanitizeValue(value: unknown, field = ''): unknown {
  if (SENSITIVE_FIELD.test(field)) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry, key)]),
    );
  }
  return value;
}

export function sanitizeSentryEvent<T extends ErrorEvent>(event: T): T {
  const sanitized = sanitizeValue(event) as T;
  return { ...sanitized, request: undefined, user: undefined };
}

export function createSentryOptions(environment: SentryEnvironment): SafeSentryOptions | undefined {
  const dsn = environment.dsn;
  if (dsn === undefined || dsn.length === 0) {
    return undefined;
  }
  if (!/^https:\/\/[^@\s/]+@[^\s/]+\/\d+$/.test(dsn)) {
    throw new Error('Invalid Sentry DSN');
  }

  const sentryEnvironment = environment.environment ?? 'development';
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sentryEnvironment)) {
    throw new Error('Invalid Sentry environment');
  }
  if (environment.release !== undefined && !/^[A-Za-z0-9._-]{1,128}$/.test(environment.release)) {
    throw new Error('Invalid Sentry release');
  }

  return {
    beforeSend: sanitizeSentryEvent,
    dsn,
    enableLogs: false,
    environment: sentryEnvironment,
    ...(environment.release === undefined ? {} : { release: environment.release }),
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}

export function initializeSentry(
  sdk: Pick<SentryAdapter, 'init'>,
  environment: SentryEnvironment,
): boolean {
  const options = createSentryOptions(environment);
  if (options === undefined) {
    return false;
  }
  sdk.init(options);
  return true;
}

export function captureSentryException(
  sdk: Pick<SentryAdapter, 'captureException'>,
  environment: SentryEnvironment,
  exception: unknown,
): void {
  if (createSentryOptions(environment) === undefined) {
    return;
  }
  sdk.captureException(exception);
}
