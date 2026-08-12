import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApplication } from '../src/app.factory';
import type { ReadinessCheck } from '../src/health/readiness-check';
import { SAFE_TEST_ENVIRONMENT } from './safe-test-environment';

function successfulCheck(name: 'postgresql' | 'redis'): ReadinessCheck {
  return {
    async check(): Promise<void> {},
    name,
  };
}

function failedCheck(name: 'postgresql' | 'redis'): ReadinessCheck {
  return {
    async check(): Promise<void> {
      throw new Error('private dependency detail');
    },
    name,
  };
}

function neverCompletingCheck(name: 'postgresql' | 'redis'): ReadinessCheck {
  return {
    check: () => new Promise<void>(() => undefined),
    name,
  };
}

function lateFailingCheck(name: 'postgresql' | 'redis'): ReadinessCheck {
  return {
    check: () =>
      new Promise<void>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('late private dependency detail'));
        }, 150);
      }),
    name,
  };
}

describe('API foundation', () => {
  let application: INestApplication;

  afterAll(async () => {
    if (application !== undefined) {
      await application.close();
    }
  });

  async function start(checks: readonly ReadinessCheck[]): Promise<void> {
    if (application !== undefined) {
      await application.close();
    }

    application = await createApplication({
      environment: SAFE_TEST_ENVIRONMENT,
      readinessChecks: checks,
    });
  }

  beforeAll(async () => {
    await start([successfulCheck('postgresql'), successfulCheck('redis')]);
  }, 10_000);

  it('démarre en test sans connexion externe et expose la liveness', async () => {
    await request(application.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'live' });
  });

  it('déclare ready uniquement lorsque les deux probes réussissent', async () => {
    await start([successfulCheck('postgresql'), successfulCheck('redis')]);

    const response = await request(application.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      checks: {
        postgresql: { status: 'up' },
        redis: { status: 'up' },
      },
      status: 'ready',
    });
    expect(response.body.checks.postgresql.latencyMs).toEqual(expect.any(Number));
    expect(response.body.checks.redis.latencyMs).toEqual(expect.any(Number));
  });

  it('retourne 503 et un détail sûr lorsqu’une dépendance échoue', async () => {
    await start([failedCheck('postgresql'), successfulCheck('redis')]);

    const response = await request(application.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      checks: {
        postgresql: { reason: 'unavailable', status: 'down' },
        redis: { status: 'up' },
      },
      status: 'not_ready',
    });
    expect(JSON.stringify(response.body)).not.toContain('private dependency detail');
  });

  it('borne le readiness lorsqu’une probe ne se termine jamais', async () => {
    await start([neverCompletingCheck('postgresql'), successfulCheck('redis')]);

    const startedAt = Date.now();
    const response = await request(application.getHttpServer())
      .get('/health/ready')
      .timeout({ deadline: 1_000, response: 750 });
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(503);
    expect(elapsedMs).toBeLessThan(1_000);
    expect(response.body).toMatchObject({
      checks: {
        postgresql: { reason: 'unavailable', status: 'down' },
        redis: { status: 'up' },
      },
      status: 'not_ready',
    });
    expect(response.body.checks.postgresql.latencyMs).toBeGreaterThanOrEqual(90);
    expect(JSON.stringify(response.body)).not.toMatch(
      /timeout|READINESS_TIMEOUT_MS|postgresql:\/\//i,
    );
  });

  it('absorbe un rejet tardif après expiration du délai', async () => {
    await start([lateFailingCheck('postgresql'), successfulCheck('redis')]);

    const response = await request(application.getHttpServer()).get('/health/ready');
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('late private dependency detail');
  });

  it('valide et propage un identifiant de corrélation fourni', async () => {
    await start([successfulCheck('postgresql'), successfulCheck('redis')]);

    await request(application.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'client-request-123')
      .expect('X-Request-Id', 'client-request-123')
      .expect(200);
  });

  it('remplace un identifiant invalide par un UUID', async () => {
    await start([successfulCheck('postgresql'), successfulCheck('redis')]);

    const response = await request(application.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'invalid value');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('structure les erreurs HTTP sans fuite', async () => {
    await start([successfulCheck('postgresql'), successfulCheck('redis')]);

    const response = await request(application.getHttpServer())
      .get('/api/v1/unknown?token=private')
      .set('X-Request-Id', 'client-request-404');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      },
      path: '/api/v1/unknown',
      requestId: 'client-request-404',
    });
    expect(JSON.stringify(response.body)).not.toContain('private');
    expect(response.body.stack).toBeUndefined();
  });

  it('ne duplique pas les health checks sous le préfixe API', async () => {
    await start([successfulCheck('postgresql'), successfulCheck('redis')]);

    await request(application.getHttpServer()).get('/api/v1/health/live').expect(404);
    await request(application.getHttpServer()).get('/api/v1/health/ready').expect(404);
  });
});
