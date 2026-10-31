import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADMIN_CLIENT_PROVENANCE_HEADER } from '../src/admin-auth/admin-client-provenance';
import { createApplication } from '../src/app.factory';
import type { AdminWriterRuntimeBoundary } from '../src/database/admin-writer.service';
import type { RuntimeDatabaseBoundary } from '../src/database/runtime-database-boundary';
import type { ReadinessCheck } from '../src/health/readiness-check';
import { SAFE_TEST_ENVIRONMENT } from './safe-test-environment';

const checks: readonly ReadinessCheck[] = [
  { name: 'postgresql', async check(): Promise<void> {} },
  { name: 'redis', async check(): Promise<void> {} },
];

const runtimeDatabaseBoundary: RuntimeDatabaseBoundary = {
  async assertLeastPrivilege(): Promise<void> {},
};

const adminWriterBoundary: AdminWriterRuntimeBoundary = {
  async assertLeastPrivilege(): Promise<void> {},
  async selectOne(): Promise<void> {},
  async transaction<T>(): Promise<T> {
    throw new Error('Transaction unavailable in provenance integration tests.');
  },
};

async function application(
  environment: Record<string, string | undefined>,
): Promise<INestApplication> {
  return createApplication({
    adminWriterBoundary,
    environment,
    readinessChecks: checks,
    runtimeDatabaseBoundary,
  });
}

describe('C3 admin client provenance boundary', () => {
  const applications: INestApplication[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((candidate) => candidate.close()));
  });

  it('préserve les requêtes DIRECT historiques sans header interne', async () => {
    const app = await application({ ...SAFE_TEST_ENVIRONMENT });
    applications.push(app);
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'live' });
  });

  it('refuse globalement un header interne injecté en DIRECT, même sur health', async () => {
    const app = await application({ ...SAFE_TEST_ENVIRONMENT });
    applications.push(app);
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set(ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.50')
      .expect(403);
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuse globalement MTLS_BFF sur un serveur sans socket TLS autorisée', async () => {
    const app = await application({
      ...SAFE_TEST_ENVIRONMENT,
      ADMIN_BFF_CLIENT_CERTIFICATE_SHA256: 'ab'.repeat(32),
      ADMIN_CLIENT_PROVENANCE_MODE: 'MTLS_BFF',
      API_TLS_CERTIFICATE_PATH: '/run/secrets/c3-api-cert.pem',
      API_TLS_CLIENT_CA_PATH: '/run/secrets/c3-client-ca.pem',
      API_TLS_PRIVATE_KEY_PATH: '/run/secrets/c3-api-key.pem',
    });
    applications.push(app);
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .set(ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.50')
      .expect(403);
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
