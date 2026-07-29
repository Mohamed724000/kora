import type { LoggerService } from '@nestjs/common';
import pino, {
  type DestinationStream,
  type LevelWithSilent,
  type Logger,
  type LoggerOptions,
} from 'pino';

export const REDACTED_VALUE = '[REDACTED]';

export const REDACTION_PATHS = [
  'authorization',
  'cookie',
  'password',
  'token',
  'otp',
  'email',
  'phone',
  'dsn',
  'DSN',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.otp',
  '*.email',
  '*.phone',
  '*.dsn',
  '*.DSN',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
] as const;

function loggerOptions(level: LevelWithSilent): LoggerOptions {
  return {
    base: null,
    level,
    redact: {
      censor: REDACTED_VALUE,
      paths: [...REDACTION_PATHS],
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

export function createStructuredLogger(
  level: LevelWithSilent,
  destination?: DestinationStream,
): Logger {
  const options = loggerOptions(level);
  return destination === undefined ? pino(options) : pino(options, destination);
}

function logFields(context: string | undefined): Record<string, string> {
  return context === undefined ? {} : { context: sanitizeLogText(context) };
}

const SENSITIVE_MESSAGE_PATTERNS: readonly {
  pattern: RegExp;
  replacement: string;
}[] = [
  {
    pattern: /\b(?:mariadb|mongodb(?:\+srv)?|mysql|postgres(?:ql)?|redis):\/\/[^\s"'`]+/giu,
    replacement: REDACTED_VALUE,
  },
  {
    pattern: /\bbearer\s+[^\s,;]+/giu,
    replacement: `Bearer ${REDACTED_VALUE}`,
  },
  {
    pattern:
      /\b(authorization|cookie|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|otp|dsn|email|phone|telephone|tel)(\s*(?:=|:)\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
    replacement: `$1$2${REDACTED_VALUE}`,
  },
  {
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
    replacement: REDACTED_VALUE,
  },
  {
    pattern: /\+\d[\d .()-]{6,}\d/gu,
    replacement: REDACTED_VALUE,
  },
];

function stringifyLogValue(value: unknown): string {
  try {
    return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  } catch {
    return '[Unserializable log value]';
  }
}

export function sanitizeLogText(value: unknown): string {
  return SENSITIVE_MESSAGE_PATTERNS.reduce(
    (text, { pattern, replacement }) => text.replace(pattern, replacement),
    stringifyLogValue(value),
  );
}

function structuredLogFields(
  message: unknown,
  context: string | undefined,
): Record<string, string> {
  return {
    ...logFields(context),
    detail: sanitizeLogText(message),
  };
}

export class NestStructuredLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info(structuredLogFields(message, context), 'nest.log');
  }

  error(message: unknown, _stack?: string, context?: string): void {
    this.logger.error(structuredLogFields(message, context), 'nest.error');
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(structuredLogFields(message, context), 'nest.warn');
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(structuredLogFields(message, context), 'nest.debug');
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(structuredLogFields(message, context), 'nest.verbose');
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal(structuredLogFields(message, context), 'nest.fatal');
  }
}
