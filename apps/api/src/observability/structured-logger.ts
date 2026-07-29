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
  return context === undefined ? {} : { context };
}

export class NestStructuredLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info(logFields(context), String(message));
  }

  error(message: unknown, _stack?: string, context?: string): void {
    this.logger.error(logFields(context), String(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(logFields(context), String(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(logFields(context), String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(logFields(context), String(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal(logFields(context), String(message));
  }
}
