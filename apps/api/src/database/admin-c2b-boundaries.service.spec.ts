import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { RuntimeConfig } from '../config/runtime-config';
import {
  AdminC2bBoundariesService,
  AdminC2bDisabledError,
  type AdminC2bPoolFactory,
} from './admin-c2b-boundaries.service';

function config(adminC2b: RuntimeConfig['adminC2b']): ConfigService<RuntimeConfig, true> {
  return {
    getOrThrow: vi.fn().mockReturnValue(adminC2b),
  } as unknown as ConfigService<RuntimeConfig, true>;
}

describe('AdminC2bBoundariesService', () => {
  it('reste fail-closed lorsque C2b est désactivé', async () => {
    const poolFactory = vi.fn<AdminC2bPoolFactory>();
    const boundaries = new AdminC2bBoundariesService(config({ enabled: false }), poolFactory);

    expect(boundaries.enabled).toBe(false);
    expect(poolFactory).not.toHaveBeenCalled();
    await expect(boundaries.assertIdentity()).rejects.toBeInstanceOf(AdminC2bDisabledError);
  });

  it.each([
    ['HTTP', 'auditApi', 'kora_admin_c2b_audit_api'],
    ['EXPORT_WORKER', 'exportWorker', 'kora_admin_c2b_export_worker'],
  ] as const)('crée un seul pool pour %s', (profile, role, user) => {
    const pool = {
      on: vi.fn(),
    } as unknown as Pool;
    const poolFactory = vi.fn<AdminC2bPoolFactory>().mockReturnValue(pool);

    const boundaries = new AdminC2bBoundariesService(
      config({
        enabled: true,
        profile,
        pool: {
          database: 'kora_test',
          host: '127.0.0.1',
          password: 'separate-secret',
          port: 5432,
          ssl: false,
          user,
        },
      }),
      poolFactory,
    );

    expect(boundaries.enabled).toBe(true);
    expect(boundaries.profile).toBe(profile);
    expect(poolFactory).toHaveBeenCalledOnce();
    expect(poolFactory).toHaveBeenCalledWith(role, expect.objectContaining({ user }));
  });
});
