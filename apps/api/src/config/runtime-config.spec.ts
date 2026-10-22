import { ConfigValidationError, loadRuntimeConfig } from './runtime-config';
import { SAFE_TEST_ENVIRONMENT } from '../../test/safe-test-environment';

const C2A_PROFILES = [
  {
    passwordField: 'ADMIN_C2A_WRITER_DATABASE_PASSWORD',
    profile: 'HTTP',
    user: 'kora_admin_c2a_writer',
    userField: 'ADMIN_C2A_WRITER_DATABASE_USER',
  },
  {
    passwordField: 'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD',
    profile: 'NOTIFICATION',
    user: 'kora_admin_c2a_notification_worker',
    userField: 'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER',
  },
  {
    passwordField: 'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD',
    profile: 'EXPIRATION',
    user: 'kora_admin_c2a_expiration_worker',
    userField: 'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_USER',
  },
  {
    passwordField: 'ADMIN_C2A_BOOTSTRAP_DATABASE_PASSWORD',
    profile: 'BOOTSTRAP',
    user: 'kora_admin_c2a_bootstrap',
    userField: 'ADMIN_C2A_BOOTSTRAP_DATABASE_USER',
  },
] as const;

function c2aEnvironment(profile: (typeof C2A_PROFILES)[number]): Record<string, string> {
  return {
    ...SAFE_TEST_ENVIRONMENT,
    ADMIN_C2A_ENABLED: 'true',
    ADMIN_C2A_PROFILE: profile.profile,
    ADMIN_C2A_DATABASE_HOST: '127.0.0.1',
    ADMIN_C2A_DATABASE_PORT: '5432',
    ADMIN_C2A_DATABASE_NAME: 'kora_test',
    ADMIN_C2A_DATABASE_SSL: 'false',
    [profile.userField]: profile.user,
    [profile.passwordField]: `c2a-${profile.profile.toLowerCase()}-password`,
  };
}

describe('loadRuntimeConfig', () => {
  it('accepte une configuration de test locale stricte', () => {
    const config = loadRuntimeConfig(SAFE_TEST_ENVIRONMENT);

    expect(config.environment).toBe('test');
    expect(config.adminAuth.origin).toBe('https://admin.kora.invalid');
    expect(config.adminAuth.postgresql.user).toBe('kora_admin_writer_test');
    expect(config.adminAuth.redis.waitAofTimeoutMs).toBe(100);
    expect(config.adminC2a).toEqual({ enabled: false });
    expect(config.http).toEqual({ host: '127.0.0.1', port: 3001 });
    expect(config.observability).toEqual({ environment: 'test' });
    expect(config.redis.password).toBeUndefined();
  });

  it.each(C2A_PROFILES)('active uniquement le pool C2a du profil $profile', (profile) => {
    const config = loadRuntimeConfig(c2aEnvironment(profile));

    expect(config.adminC2a.enabled).toBe(true);
    if (config.adminC2a.enabled) {
      expect(config.adminC2a.profile).toBe(profile.profile);
      expect(config.adminC2a.pool.user).toBe(profile.user);
      expect(config.adminC2a.pool.password).toBe(`c2a-${profile.profile.toLowerCase()}-password`);
      expect(config.adminC2a).not.toHaveProperty('pools');
    }
  });

  it('rejette une activation sans profil, une identité renommée et un secret C1 partagé', () => {
    const invalid = {
      ...c2aEnvironment(C2A_PROFILES[0]),
      ADMIN_C2A_PROFILE: undefined,
      ADMIN_C2A_WRITER_DATABASE_USER: 'renamed_writer',
      ADMIN_C2A_WRITER_DATABASE_PASSWORD: SAFE_TEST_ENVIRONMENT.ADMIN_DATABASE_PASSWORD,
    };

    try {
      loadRuntimeConfig(invalid);
      throw new Error('La validation aurait dû échouer');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const fields = (error as ConfigValidationError).invalidFields;
      expect(fields).toContain('ADMIN_C2A_PROFILE');
      expect(fields).toContain('ADMIN_C2A_WRITER_DATABASE_USER');
      expect(fields).toContain('ADMIN_C2A_WRITER_DATABASE_PASSWORD');
      expect((error as Error).message).not.toContain(SAFE_TEST_ENVIRONMENT.ADMIN_DATABASE_PASSWORD);
    }
  });

  it('rejette tout secret ou utilisateur d’un profil C2a étranger', () => {
    const invalid = {
      ...c2aEnvironment(C2A_PROFILES[0]),
      ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER: 'kora_admin_c2a_notification_worker',
      ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD: 'foreign-secret',
    };

    try {
      loadRuntimeConfig(invalid);
      throw new Error('La validation aurait dû échouer');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).invalidFields).toEqual([
        'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER',
        'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD',
      ]);
      expect((error as Error).message).not.toContain('foreign-secret');
    }
  });

  it('rejette un profil C2a inconnu et le secret absent du profil actif', () => {
    const unknownProfile = {
      ...c2aEnvironment(C2A_PROFILES[0]),
      ADMIN_C2A_PROFILE: 'EXPORT',
    };
    expect(() => loadRuntimeConfig(unknownProfile)).toThrow(ConfigValidationError);

    const missingSecret: Record<string, string | undefined> = c2aEnvironment(C2A_PROFILES[2]);
    delete missingSecret.ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD;
    try {
      loadRuntimeConfig(missingSecret);
      throw new Error('La validation aurait dû échouer');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).invalidFields).toEqual([
        'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD',
      ]);
    }
  });

  it('refuse des variables C2a dormantes lorsque le runtime est désactivé', () => {
    expect(() =>
      loadRuntimeConfig({
        ...SAFE_TEST_ENVIRONMENT,
        ADMIN_C2A_PROFILE: 'HTTP',
        ADMIN_C2A_WRITER_DATABASE_PASSWORD: 'orphan-secret',
      }),
    ).toThrow(ConfigValidationError);
  });

  it('valide les options Sentry sans exposer le DSN', () => {
    const config = loadRuntimeConfig({
      ...SAFE_TEST_ENVIRONMENT,
      SENTRY_DSN: 'https://public-key@sentry.example.test/42',
      SENTRY_ENVIRONMENT: 'ci',
      SENTRY_RELEASE: 's0.5-test.1',
    });

    expect(config.observability).toEqual({
      dsn: 'https://public-key@sentry.example.test/42',
      environment: 'ci',
      release: 's0.5-test.1',
    });

    const invalid = {
      ...SAFE_TEST_ENVIRONMENT,
      SENTRY_DSN: 'private-invalid-dsn',
    };
    try {
      loadRuntimeConfig(invalid);
      throw new Error('La validation aurait dû échouer');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as Error).message).toContain('SENTRY_DSN');
      expect((error as Error).message).not.toContain('private-invalid-dsn');
    }
  });

  it('rejette les variables manquantes et les nombres hors limites', () => {
    const invalid: Record<string, string | undefined> = {
      ...SAFE_TEST_ENVIRONMENT,
      API_PORT: '0',
    };
    invalid.DATABASE_HOST = undefined;

    expect(() => loadRuntimeConfig(invalid)).toThrow(ConfigValidationError);

    try {
      loadRuntimeConfig(invalid);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).invalidFields).toEqual(['API_PORT', 'DATABASE_HOST']);
    }
  });

  it('rejette une origine non HTTPS et des credentials writer non distincts', () => {
    const invalid = {
      ...SAFE_TEST_ENVIRONMENT,
      ADMIN_DATABASE_PASSWORD: SAFE_TEST_ENVIRONMENT.DATABASE_PASSWORD,
      ADMIN_DATABASE_USER: SAFE_TEST_ENVIRONMENT.DATABASE_USER,
      ADMIN_ORIGIN: 'http://admin.kora.invalid/path',
    };

    try {
      loadRuntimeConfig(invalid);
      throw new Error('La validation aurait dû échouer');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).invalidFields).toEqual([
        'ADMIN_ORIGIN',
        'ADMIN_DATABASE_USER',
        'ADMIN_DATABASE_PASSWORD',
      ]);
    }
  });

  it('ne place jamais une valeur sensible dans le message d’erreur', () => {
    const sensitiveValue = 'private-value-that-must-not-appear';
    const invalid = {
      ...SAFE_TEST_ENVIRONMENT,
      DATABASE_PASSWORD: sensitiveValue,
      DATABASE_SSL: 'sometimes',
    };

    try {
      loadRuntimeConfig(invalid);
      throw new Error('La validation aurait dû échouer');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as Error).message).not.toContain(sensitiveValue);
      expect((error as Error).message).toContain('DATABASE_SSL');
    }
  });
});
