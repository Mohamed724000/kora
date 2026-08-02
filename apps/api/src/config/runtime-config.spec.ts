import { ConfigValidationError, loadRuntimeConfig } from './runtime-config';
import { SAFE_TEST_ENVIRONMENT } from '../../test/safe-test-environment';

describe('loadRuntimeConfig', () => {
  it('accepte une configuration de test locale stricte', () => {
    const config = loadRuntimeConfig(SAFE_TEST_ENVIRONMENT);

    expect(config.environment).toBe('test');
    expect(config.http).toEqual({ host: '127.0.0.1', port: 3001 });
    expect(config.redis.password).toBeUndefined();
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
