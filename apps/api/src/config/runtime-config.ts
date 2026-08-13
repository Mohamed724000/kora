import type { LevelWithSilent } from 'pino';

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface RuntimeConfig {
  environment: NodeEnvironment;
  http: {
    host: string;
    port: number;
  };
  logging: {
    level: LevelWithSilent;
  };
  observability: {
    dsn?: string;
    environment: string;
    release?: string;
  };
  postgresql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    tls: boolean;
  };
  readiness: {
    timeoutMs: number;
  };
}

export class ConfigValidationError extends Error {
  constructor(readonly invalidFields: readonly string[]) {
    super(`Configuration invalide : ${invalidFields.join(', ')}`);
    this.name = 'ConfigValidationError';
  }
}

interface ValidationResult<T> {
  field: string;
  value?: T;
}

function requiredString(
  environment: Record<string, string | undefined>,
  field: string,
  pattern?: RegExp,
): ValidationResult<string> {
  const value = environment[field];
  if (value === undefined || value.length === 0 || value.trim() !== value) {
    return { field };
  }

  if (pattern !== undefined && !pattern.test(value)) {
    return { field };
  }

  return { field, value };
}

function optionalString(
  environment: Record<string, string | undefined>,
  field: string,
  pattern?: RegExp,
): ValidationResult<string | undefined> {
  const value = environment[field];
  if (value === undefined || value.length === 0) {
    return { field };
  }

  if (value.trim() !== value || (pattern !== undefined && !pattern.test(value))) {
    return { field };
  }

  return { field, value };
}

function integer(
  environment: Record<string, string | undefined>,
  field: string,
  minimum: number,
  maximum: number,
): ValidationResult<number> {
  const value = environment[field];
  if (value === undefined || !/^\d+$/.test(value)) {
    return { field };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return { field };
  }

  return { field, value: parsed };
}

function boolean(
  environment: Record<string, string | undefined>,
  field: string,
): ValidationResult<boolean> {
  const value = environment[field];
  if (value === 'true') {
    return { field, value: true };
  }

  if (value === 'false') {
    return { field, value: false };
  }

  return { field };
}

function enumeration<T extends string>(
  environment: Record<string, string | undefined>,
  field: string,
  allowed: readonly T[],
): ValidationResult<T> {
  const value = environment[field];
  if (value === undefined || !allowed.includes(value as T)) {
    return { field };
  }

  return { field, value: value as T };
}

function invalidFields(results: readonly ValidationResult<unknown>[]): string[] {
  return results.filter((result) => result.value === undefined).map((result) => result.field);
}

export function loadRuntimeConfig(environment: Record<string, string | undefined>): RuntimeConfig {
  const nodeEnvironment = enumeration(environment, 'NODE_ENV', NODE_ENVIRONMENTS);
  const apiHost = requiredString(environment, 'API_HOST', /^(?!.*:\/\/)(?!.*\/)\S+$/);
  const apiPort = integer(environment, 'API_PORT', 1, 65_535);
  const logLevel = enumeration(environment, 'LOG_LEVEL', LOG_LEVELS);
  const sentryDsn = optionalString(environment, 'SENTRY_DSN', /^https:\/\/[^@\s/]+@[^\s/]+\/\d+$/);
  const sentryEnvironment = optionalString(
    environment,
    'SENTRY_ENVIRONMENT',
    /^[A-Za-z0-9._-]{1,64}$/,
  );
  const sentryRelease = optionalString(environment, 'SENTRY_RELEASE', /^[A-Za-z0-9._-]{1,128}$/);
  const databaseHost = requiredString(environment, 'DATABASE_HOST', /^(?!.*:\/\/)(?!.*\/)\S+$/);
  const databasePort = integer(environment, 'DATABASE_PORT', 1, 65_535);
  const databaseName = requiredString(environment, 'DATABASE_NAME', /^[A-Za-z_][A-Za-z0-9_-]*$/);
  const databaseUser = requiredString(environment, 'DATABASE_USER');
  const databasePassword = requiredString(environment, 'DATABASE_PASSWORD');
  const databaseSsl = boolean(environment, 'DATABASE_SSL');
  const redisHost = requiredString(environment, 'REDIS_HOST', /^(?!.*:\/\/)(?!.*\/)\S+$/);
  const redisPort = integer(environment, 'REDIS_PORT', 1, 65_535);
  const redisPassword = optionalString(environment, 'REDIS_PASSWORD');
  const redisTls = boolean(environment, 'REDIS_TLS');
  const readinessTimeout = integer(environment, 'READINESS_TIMEOUT_MS', 100, 10_000);

  const results = [
    nodeEnvironment,
    apiHost,
    apiPort,
    logLevel,
    databaseHost,
    databasePort,
    databaseName,
    databaseUser,
    databasePassword,
    databaseSsl,
    redisHost,
    redisPort,
    redisTls,
    readinessTimeout,
  ];
  const invalid = invalidFields(results);

  if (redisPassword.value === undefined && environment.REDIS_PASSWORD !== undefined) {
    const suppliedRedisPassword = environment.REDIS_PASSWORD;
    if (suppliedRedisPassword.length > 0) {
      invalid.push(redisPassword.field);
    }
  }

  for (const optional of [sentryDsn, sentryEnvironment, sentryRelease]) {
    const supplied = environment[optional.field];
    if (optional.value === undefined && supplied !== undefined && supplied.length > 0) {
      invalid.push(optional.field);
    }
  }

  if (invalid.length > 0) {
    throw new ConfigValidationError(invalid);
  }

  const redis = {
    host: redisHost.value as string,
    port: redisPort.value as number,
    tls: redisTls.value as boolean,
    ...(redisPassword.value === undefined ? {} : { password: redisPassword.value }),
  };

  return {
    environment: nodeEnvironment.value as NodeEnvironment,
    http: {
      host: apiHost.value as string,
      port: apiPort.value as number,
    },
    logging: {
      level: logLevel.value as LevelWithSilent,
    },
    observability: {
      environment: sentryEnvironment.value ?? (nodeEnvironment.value as NodeEnvironment),
      ...(sentryDsn.value === undefined ? {} : { dsn: sentryDsn.value }),
      ...(sentryRelease.value === undefined ? {} : { release: sentryRelease.value }),
    },
    postgresql: {
      host: databaseHost.value as string,
      port: databasePort.value as number,
      database: databaseName.value as string,
      user: databaseUser.value as string,
      password: databasePassword.value as string,
      ssl: databaseSsl.value as boolean,
    },
    redis,
    readiness: {
      timeoutMs: readinessTimeout.value as number,
    },
  };
}
