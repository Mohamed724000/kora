import type { LevelWithSilent } from 'pino';

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface RuntimePostgresqlConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export const ADMIN_C2A_DATABASE_USERS = Object.freeze({
  writer: 'kora_admin_c2a_writer',
  notificationWorker: 'kora_admin_c2a_notification_worker',
  expirationWorker: 'kora_admin_c2a_expiration_worker',
  bootstrap: 'kora_admin_c2a_bootstrap',
});

export const ADMIN_C2A_PROCESS_PROFILES = [
  'HTTP',
  'NOTIFICATION',
  'EXPIRATION',
  'BOOTSTRAP',
] as const;

export type AdminC2aProcessProfile = (typeof ADMIN_C2A_PROCESS_PROFILES)[number];
export type AdminC2aDatabaseRole = keyof typeof ADMIN_C2A_DATABASE_USERS;

export const ADMIN_C2A_PROFILE_DATABASE_ROLES: Readonly<
  Record<AdminC2aProcessProfile, AdminC2aDatabaseRole>
> = Object.freeze({
  HTTP: 'writer',
  NOTIFICATION: 'notificationWorker',
  EXPIRATION: 'expirationWorker',
  BOOTSTRAP: 'bootstrap',
});

export type AdminC2aRuntimeConfig =
  | { enabled: false }
  | {
      enabled: true;
      profile: AdminC2aProcessProfile;
      pool: RuntimePostgresqlConfig;
    };

export const ADMIN_C2B_DATABASE_USERS = Object.freeze({
  auditApi: 'kora_admin_c2b_audit_api',
  exportWorker: 'kora_admin_c2b_export_worker',
});

export const ADMIN_C2B_PROCESS_PROFILES = ['HTTP', 'EXPORT_WORKER'] as const;
export type AdminC2bProcessProfile = (typeof ADMIN_C2B_PROCESS_PROFILES)[number];
export type AdminC2bDatabaseRole = keyof typeof ADMIN_C2B_DATABASE_USERS;

export const ADMIN_C2B_PROFILE_DATABASE_ROLES: Readonly<
  Record<AdminC2bProcessProfile, AdminC2bDatabaseRole>
> = Object.freeze({
  HTTP: 'auditApi',
  EXPORT_WORKER: 'exportWorker',
});

export type AdminC2bRuntimeConfig =
  | { enabled: false }
  | {
      enabled: true;
      profile: AdminC2bProcessProfile;
      pool: RuntimePostgresqlConfig;
    };

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
  adminC2a: AdminC2aRuntimeConfig;
  adminC2b: AdminC2bRuntimeConfig;
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

function booleanWithDefaultFalse(
  environment: Record<string, string | undefined>,
  field: string,
): ValidationResult<boolean> {
  if (environment[field] === undefined) {
    return { field, value: false };
  }
  return boolean(environment, field);
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
  const adminC2aEnabled = booleanWithDefaultFalse(environment, 'ADMIN_C2A_ENABLED');
  const adminC2aProfile = enumeration(environment, 'ADMIN_C2A_PROFILE', ADMIN_C2A_PROCESS_PROFILES);
  const adminC2aHost = requiredString(
    environment,
    'ADMIN_C2A_DATABASE_HOST',
    /^(?!.*:\/\/)(?!.*\/)\S+$/,
  );
  const adminC2aPort = integer(environment, 'ADMIN_C2A_DATABASE_PORT', 1, 65_535);
  const adminC2aDatabase = requiredString(
    environment,
    'ADMIN_C2A_DATABASE_NAME',
    /^[A-Za-z_][A-Za-z0-9_-]*$/,
  );
  const adminC2aSsl = boolean(environment, 'ADMIN_C2A_DATABASE_SSL');
  const adminC2aWriterUser = requiredString(environment, 'ADMIN_C2A_WRITER_DATABASE_USER');
  const adminC2aWriterPassword = requiredString(environment, 'ADMIN_C2A_WRITER_DATABASE_PASSWORD');
  const adminC2aNotificationUser = requiredString(
    environment,
    'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER',
  );
  const adminC2aNotificationPassword = requiredString(
    environment,
    'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD',
  );
  const adminC2aExpirationUser = requiredString(
    environment,
    'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_USER',
  );
  const adminC2aExpirationPassword = requiredString(
    environment,
    'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD',
  );
  const adminC2aBootstrapUser = requiredString(environment, 'ADMIN_C2A_BOOTSTRAP_DATABASE_USER');
  const adminC2aBootstrapPassword = requiredString(
    environment,
    'ADMIN_C2A_BOOTSTRAP_DATABASE_PASSWORD',
  );
  const adminC2aCredentials = {
    HTTP: {
      password: adminC2aWriterPassword,
      passwordField: 'ADMIN_C2A_WRITER_DATABASE_PASSWORD',
      role: 'writer',
      user: adminC2aWriterUser,
      userField: 'ADMIN_C2A_WRITER_DATABASE_USER',
    },
    NOTIFICATION: {
      password: adminC2aNotificationPassword,
      passwordField: 'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD',
      role: 'notificationWorker',
      user: adminC2aNotificationUser,
      userField: 'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER',
    },
    EXPIRATION: {
      password: adminC2aExpirationPassword,
      passwordField: 'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD',
      role: 'expirationWorker',
      user: adminC2aExpirationUser,
      userField: 'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_USER',
    },
    BOOTSTRAP: {
      password: adminC2aBootstrapPassword,
      passwordField: 'ADMIN_C2A_BOOTSTRAP_DATABASE_PASSWORD',
      role: 'bootstrap',
      user: adminC2aBootstrapUser,
      userField: 'ADMIN_C2A_BOOTSTRAP_DATABASE_USER',
    },
  } as const;
  const adminC2bEnabled = booleanWithDefaultFalse(environment, 'ADMIN_C2B_ENABLED');
  const adminC2bProfile = enumeration(environment, 'ADMIN_C2B_PROFILE', ADMIN_C2B_PROCESS_PROFILES);
  const adminC2bHost = requiredString(
    environment,
    'ADMIN_C2B_DATABASE_HOST',
    /^(?!.*:\/\/)(?!.*\/)\S+$/,
  );
  const adminC2bPort = integer(environment, 'ADMIN_C2B_DATABASE_PORT', 1, 65_535);
  const adminC2bDatabase = requiredString(
    environment,
    'ADMIN_C2B_DATABASE_NAME',
    /^[A-Za-z_][A-Za-z0-9_-]*$/,
  );
  const adminC2bSsl = boolean(environment, 'ADMIN_C2B_DATABASE_SSL');
  const adminC2bAuditApiUser = requiredString(environment, 'ADMIN_C2B_AUDIT_API_DATABASE_USER');
  const adminC2bAuditApiPassword = requiredString(
    environment,
    'ADMIN_C2B_AUDIT_API_DATABASE_PASSWORD',
  );
  const adminC2bExportWorkerUser = requiredString(
    environment,
    'ADMIN_C2B_EXPORT_WORKER_DATABASE_USER',
  );
  const adminC2bExportWorkerPassword = requiredString(
    environment,
    'ADMIN_C2B_EXPORT_WORKER_DATABASE_PASSWORD',
  );
  const adminC2bCredentials = {
    HTTP: {
      password: adminC2bAuditApiPassword,
      passwordField: 'ADMIN_C2B_AUDIT_API_DATABASE_PASSWORD',
      role: 'auditApi',
      user: adminC2bAuditApiUser,
      userField: 'ADMIN_C2B_AUDIT_API_DATABASE_USER',
    },
    EXPORT_WORKER: {
      password: adminC2bExportWorkerPassword,
      passwordField: 'ADMIN_C2B_EXPORT_WORKER_DATABASE_PASSWORD',
      role: 'exportWorker',
      user: adminC2bExportWorkerUser,
      userField: 'ADMIN_C2B_EXPORT_WORKER_DATABASE_USER',
    },
  } as const;

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
    adminC2aEnabled,
    adminC2bEnabled,
  ];
  if (adminC2aEnabled.value === true) {
    results.push(adminC2aProfile, adminC2aHost, adminC2aPort, adminC2aDatabase, adminC2aSsl);
    if (adminC2aProfile.value !== undefined) {
      const credentials = adminC2aCredentials[adminC2aProfile.value];
      results.push(credentials.user, credentials.password);
    }
  }
  if (adminC2bEnabled.value === true) {
    results.push(adminC2bProfile, adminC2bHost, adminC2bPort, adminC2bDatabase, adminC2bSsl);
    if (adminC2bProfile.value !== undefined) {
      const credentials = adminC2bCredentials[adminC2bProfile.value];
      results.push(credentials.user, credentials.password);
    }
  }
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

  if (adminC2aEnabled.value === true) {
    const activeProfile = adminC2aProfile.value;
    if (activeProfile !== undefined) {
      const active = adminC2aCredentials[activeProfile];
      const expectedUser = ADMIN_C2A_DATABASE_USERS[active.role];
      if (active.user.value !== undefined && active.user.value !== expectedUser) {
        invalid.push(active.user.field);
      }
      if (
        active.user.value !== undefined &&
        (active.user.value === databaseUser.value || active.user.value === adminDatabaseUser.value)
      ) {
        invalid.push(active.user.field);
      }
      if (
        active.password.value !== undefined &&
        (active.password.value === databasePassword.value ||
          active.password.value === adminDatabasePassword.value)
      ) {
        invalid.push(active.password.field);
      }
      for (const [profile, credentials] of Object.entries(adminC2aCredentials)) {
        if (profile === activeProfile) continue;
        for (const field of [credentials.userField, credentials.passwordField]) {
          if (environment[field] !== undefined) invalid.push(field);
        }
      }
    } else {
      for (const credentials of Object.values(adminC2aCredentials)) {
        for (const field of [credentials.userField, credentials.passwordField]) {
          if (environment[field] !== undefined) invalid.push(field);
        }
      }
    }
  } else {
    for (const field of [
      'ADMIN_C2A_PROFILE',
      'ADMIN_C2A_DATABASE_HOST',
      'ADMIN_C2A_DATABASE_PORT',
      'ADMIN_C2A_DATABASE_NAME',
      'ADMIN_C2A_DATABASE_SSL',
      'ADMIN_C2A_WRITER_DATABASE_USER',
      'ADMIN_C2A_WRITER_DATABASE_PASSWORD',
      'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER',
      'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD',
      'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_USER',
      'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD',
      'ADMIN_C2A_BOOTSTRAP_DATABASE_USER',
      'ADMIN_C2A_BOOTSTRAP_DATABASE_PASSWORD',
    ]) {
      if (environment[field] !== undefined) {
        invalid.push(field);
      }
    }
  }

  if (adminC2bEnabled.value === true) {
    const activeProfile = adminC2bProfile.value;
    if (activeProfile !== undefined) {
      const active = adminC2bCredentials[activeProfile];
      const expectedUser = ADMIN_C2B_DATABASE_USERS[active.role];
      if (active.user.value !== undefined && active.user.value !== expectedUser) {
        invalid.push(active.user.field);
      }
      const forbiddenUsers = [
        databaseUser.value,
        adminDatabaseUser.value,
        ...Object.values(ADMIN_C2A_DATABASE_USERS),
      ];
      if (active.user.value !== undefined && forbiddenUsers.includes(active.user.value)) {
        invalid.push(active.user.field);
      }
      const forbiddenPasswords = [databasePassword.value, adminDatabasePassword.value];
      if (adminC2aEnabled.value === true && adminC2aProfile.value !== undefined) {
        forbiddenPasswords.push(adminC2aCredentials[adminC2aProfile.value].password.value);
      }
      if (
        active.password.value !== undefined &&
        forbiddenPasswords.includes(active.password.value)
      ) {
        invalid.push(active.password.field);
      }
      for (const [profile, credentials] of Object.entries(adminC2bCredentials)) {
        if (profile === activeProfile) continue;
        for (const field of [credentials.userField, credentials.passwordField]) {
          if (environment[field] !== undefined) invalid.push(field);
        }
      }
    } else {
      for (const credentials of Object.values(adminC2bCredentials)) {
        for (const field of [credentials.userField, credentials.passwordField]) {
          if (environment[field] !== undefined) invalid.push(field);
        }
      }
    }
  } else {
    for (const field of [
      'ADMIN_C2B_PROFILE',
      'ADMIN_C2B_DATABASE_HOST',
      'ADMIN_C2B_DATABASE_PORT',
      'ADMIN_C2B_DATABASE_NAME',
      'ADMIN_C2B_DATABASE_SSL',
      'ADMIN_C2B_AUDIT_API_DATABASE_USER',
      'ADMIN_C2B_AUDIT_API_DATABASE_PASSWORD',
      'ADMIN_C2B_EXPORT_WORKER_DATABASE_USER',
      'ADMIN_C2B_EXPORT_WORKER_DATABASE_PASSWORD',
    ]) {
      if (environment[field] !== undefined) invalid.push(field);
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

  const c2Pool = (user: string, password: string): RuntimePostgresqlConfig => ({
    host: adminC2aHost.value as string,
    port: adminC2aPort.value as number,
    database: adminC2aDatabase.value as string,
    user,
    password,
    ssl: adminC2aSsl.value as boolean,
  });
  const adminC2a: AdminC2aRuntimeConfig =
    adminC2aEnabled.value === true
      ? {
          enabled: true,
          profile: adminC2aProfile.value as AdminC2aProcessProfile,
          pool: c2Pool(
            adminC2aCredentials[adminC2aProfile.value as AdminC2aProcessProfile].user
              .value as string,
            adminC2aCredentials[adminC2aProfile.value as AdminC2aProcessProfile].password
              .value as string,
          ),
        }
      : { enabled: false };
  const c2bPool = (user: string, password: string): RuntimePostgresqlConfig => ({
    host: adminC2bHost.value as string,
    port: adminC2bPort.value as number,
    database: adminC2bDatabase.value as string,
    user,
    password,
    ssl: adminC2bSsl.value as boolean,
  });
  const adminC2b: AdminC2bRuntimeConfig =
    adminC2bEnabled.value === true
      ? {
          enabled: true,
          profile: adminC2bProfile.value as AdminC2bProcessProfile,
          pool: c2bPool(
            adminC2bCredentials[adminC2bProfile.value as AdminC2bProcessProfile].user
              .value as string,
            adminC2bCredentials[adminC2bProfile.value as AdminC2bProcessProfile].password
              .value as string,
          ),
        }
      : { enabled: false };

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
    adminC2a,
    adminC2b,
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
