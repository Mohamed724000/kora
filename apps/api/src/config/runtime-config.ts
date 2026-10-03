import type { LevelWithSilent } from 'pino';

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface RuntimeConfig {
  adminAuth: {
    origin: string;
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
      waitAofTimeoutMs: number;
    };
  };
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

function exactHttpsOrigin(
  environment: Record<string, string | undefined>,
  field: string,
): ValidationResult<string> {
  const candidate = requiredString(environment, field);
  if (candidate.value === undefined) {
    return candidate;
  }
  try {
    const parsed = new URL(candidate.value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== candidate.value ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return { field };
    }
  } catch {
    return { field };
  }
  return candidate;
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
  const adminOrigin = exactHttpsOrigin(environment, 'ADMIN_ORIGIN');
  const adminDatabaseHost = requiredString(
    environment,
    'ADMIN_DATABASE_HOST',
    /^(?!.*:\/\/)(?!.*\/)\S+$/,
  );
  const adminDatabasePort = integer(environment, 'ADMIN_DATABASE_PORT', 1, 65_535);
  const adminDatabaseName = requiredString(
    environment,
    'ADMIN_DATABASE_NAME',
    /^[A-Za-z_][A-Za-z0-9_-]*$/,
  );
  const adminDatabaseUser = requiredString(environment, 'ADMIN_DATABASE_USER');
  const adminDatabasePassword = requiredString(environment, 'ADMIN_DATABASE_PASSWORD');
  const adminDatabaseSsl = boolean(environment, 'ADMIN_DATABASE_SSL');
  const adminRedisHost = requiredString(
    environment,
    'ADMIN_REDIS_HOST',
    /^(?!.*:\/\/)(?!.*\/)\S+$/,
  );
  const adminRedisPort = integer(environment, 'ADMIN_REDIS_PORT', 1, 65_535);
  const adminRedisPassword = optionalString(environment, 'ADMIN_REDIS_PASSWORD');
  const adminRedisTls = boolean(environment, 'ADMIN_REDIS_TLS');
  const adminRedisWaitAofTimeout = integer(
    environment,
    'ADMIN_REDIS_WAIT_AOF_TIMEOUT_MS',
    1,
    10_000,
  );

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
    adminOrigin,
    adminDatabaseHost,
    adminDatabasePort,
    adminDatabaseName,
    adminDatabaseUser,
    adminDatabasePassword,
    adminDatabaseSsl,
    adminRedisHost,
    adminRedisPort,
    adminRedisTls,
    adminRedisWaitAofTimeout,
  ];
  const invalid = invalidFields(results);

  if (redisPassword.value === undefined && environment.REDIS_PASSWORD !== undefined) {
    const suppliedRedisPassword = environment.REDIS_PASSWORD;
    if (suppliedRedisPassword.length > 0) {
      invalid.push(redisPassword.field);
    }
  }

  if (
    adminRedisPassword.value === undefined &&
    environment.ADMIN_REDIS_PASSWORD !== undefined &&
    environment.ADMIN_REDIS_PASSWORD.length > 0
  ) {
    invalid.push(adminRedisPassword.field);
  }

  if (adminDatabaseUser.value !== undefined && adminDatabaseUser.value === databaseUser.value) {
    invalid.push(adminDatabaseUser.field);
  }
  if (
    adminDatabasePassword.value !== undefined &&
    adminDatabasePassword.value === databasePassword.value
  ) {
    invalid.push(adminDatabasePassword.field);
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
    adminAuth: {
      origin: adminOrigin.value as string,
      postgresql: {
        host: adminDatabaseHost.value as string,
        port: adminDatabasePort.value as number,
        database: adminDatabaseName.value as string,
        user: adminDatabaseUser.value as string,
        password: adminDatabasePassword.value as string,
        ssl: adminDatabaseSsl.value as boolean,
      },
      redis: {
        host: adminRedisHost.value as string,
        port: adminRedisPort.value as number,
        tls: adminRedisTls.value as boolean,
        waitAofTimeoutMs: adminRedisWaitAofTimeout.value as number,
        ...(adminRedisPassword.value === undefined ? {} : { password: adminRedisPassword.value }),
      },
    },
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
