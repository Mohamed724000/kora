import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminC2aProcessProfile,
  RuntimeConfig,
  RuntimePostgresqlConfig,
} from '../config/runtime-config';
import {
  AdminC2aBoundariesService,
  AdminC2aBoundaryError,
  AdminC2aDisabledError,
  createAdminC2aPgPool,
  type AdminC2aPoolFactory,
} from './admin-c2a-boundaries.service';

function configService(adminC2a: RuntimeConfig['adminC2a']): ConfigService<RuntimeConfig, true> {
  return {
    getOrThrow: (path: string) => {
      if (path !== 'adminC2a') {
        throw new Error(`unexpected config path: ${path}`);
      }
      return adminC2a;
    },
  } as unknown as ConfigService<RuntimeConfig, true>;
}

describe('AdminC2aBoundariesService', () => {
  it('reste inerte quand C2a est désactivé', async () => {
    const poolFactory = vi.fn<AdminC2aPoolFactory>();
    const boundaries = new AdminC2aBoundariesService(
      configService({ enabled: false }),
      poolFactory,
    );

    expect(boundaries.enabled).toBe(false);
    expect(poolFactory).not.toHaveBeenCalled();
    await expect(boundaries.assertIdentity()).rejects.toBeInstanceOf(AdminC2aDisabledError);
    await boundaries.onModuleDestroy();
  });

  it('construit et ferme uniquement le pool du profil actif', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = {
      end,
      on: vi.fn(),
    } as unknown as Pool;
    const poolFactory = vi.fn<AdminC2aPoolFactory>().mockReturnValue(pool);
    const poolConfig: RuntimePostgresqlConfig = {
      database: 'kora_test',
      host: '127.0.0.1',
      password: 'notification-only-secret',
      port: 5432,
      ssl: false,
      user: 'kora_admin_c2a_notification_worker',
    };
    const boundaries = new AdminC2aBoundariesService(
      configService({ enabled: true, pool: poolConfig, profile: 'NOTIFICATION' }),
      poolFactory,
    );

    expect(boundaries.enabled).toBe(true);
    expect(boundaries.profile).toBe('NOTIFICATION');
    expect(poolFactory).toHaveBeenCalledTimes(1);
    expect(poolFactory).toHaveBeenCalledWith('notificationWorker', poolConfig);
    await boundaries.onModuleDestroy();
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe.runIf(process.env.S1203C2A_REAL_TRANSACTION === '1')(
  'AdminC2aBoundariesService with isolated PostgreSQL',
  () => {
    it('attests every exact role inside the same acquired transaction', async () => {
      const database = process.env.S1203C2A_REAL_TRANSACTION_DATABASE;
      const host = process.env.S1203C2A_ADMIN_HOST;
      const port = Number(process.env.S1203C2A_ADMIN_PORT);
      if (!database || !host || !Number.isInteger(port)) {
        throw new Error('The isolated C2a boundary fixture is incomplete.');
      }
      const roleEnvironment = {
        bootstrap: ['S1203C2A_BOOTSTRAP_USER', 'S1203C2A_BOOTSTRAP_PASSWORD'],
        expirationWorker: ['S1203C2A_EXPIRATION_USER', 'S1203C2A_EXPIRATION_PASSWORD'],
        notificationWorker: ['S1203C2A_NOTIFICATION_USER', 'S1203C2A_NOTIFICATION_PASSWORD'],
        writer: ['S1203C2A_WRITER_USER', 'S1203C2A_WRITER_PASSWORD'],
      } as const;
      const pools = Object.fromEntries(
        Object.entries(roleEnvironment).map(([role, [userName, passwordName]]) => {
          const user = process.env[userName];
          const password = process.env[passwordName];
          if (!user || !password) throw new Error(`Missing isolated fixture for ${role}.`);
          return [role, { database, host, password, port, ssl: false, user }];
        }),
      ) as Record<keyof typeof roleEnvironment, RuntimePostgresqlConfig>;
      const profiles: Record<keyof typeof roleEnvironment, AdminC2aProcessProfile> = {
        bootstrap: 'BOOTSTRAP',
        expirationWorker: 'EXPIRATION',
        notificationWorker: 'NOTIFICATION',
        writer: 'HTTP',
      };
      for (const role of [
        'writer',
        'notificationWorker',
        'expirationWorker',
        'bootstrap',
      ] as const) {
        const boundaries = new AdminC2aBoundariesService(
          configService({ enabled: true, pool: pools[role], profile: profiles[role] }),
          createAdminC2aPgPool,
        );
        try {
          await boundaries.assertIdentity();
          const result = await boundaries.transaction((transaction) =>
            transaction.query<{ currentUser: string }>('SELECT current_user AS "currentUser"'),
          );
          expect(result.rows[0]?.currentUser).toBe(pools[role].user);
        } finally {
          await boundaries.onModuleDestroy();
        }
      }
    }, 15_000);

    it('fails closed before the business callback outside READ COMMITTED and rolls back cleanly', async () => {
      const database = process.env.S1203C2A_REAL_TRANSACTION_DATABASE;
      const host = process.env.S1203C2A_ADMIN_HOST;
      const password = process.env.S1203C2A_WRITER_PASSWORD;
      const port = Number(process.env.S1203C2A_ADMIN_PORT);
      const user = process.env.S1203C2A_WRITER_USER;
      if (
        !database ||
        !host ||
        !password ||
        !Number.isInteger(port) ||
        user !== 'kora_admin_c2a_writer'
      ) {
        throw new Error('The isolated C2a isolation-level fixture is incomplete.');
      }
      const adversePool = new Pool({
        database,
        host,
        max: 1,
        options: '-c default_transaction_isolation=repeatable\\ read',
        password,
        port,
        user,
      });
      const boundaries = new AdminC2aBoundariesService(
        configService({
          enabled: true,
          pool: { database, host, password, port, ssl: false, user },
          profile: 'HTTP',
        }),
        () => adversePool,
      );
      const businessCallback = vi.fn();
      try {
        await expect(boundaries.transaction(businessCallback)).rejects.toEqual(
          expect.objectContaining({
            code: 'CALLBACK_FAILED',
            name: 'AdminC2TransactionError',
            primaryError: expect.objectContaining({
              name: AdminC2aBoundaryError.name,
              violations: expect.arrayContaining(['transaction_isolation']),
            }),
          }),
        );
        expect(businessCallback).not.toHaveBeenCalled();
        await expect(
          adversePool.query(`SELECT current_setting('transaction_isolation') AS isolation`),
        ).resolves.toEqual(
          expect.objectContaining({
            rows: [expect.objectContaining({ isolation: 'repeatable read' })],
          }),
        );
      } finally {
        await boundaries.onModuleDestroy();
      }
    }, 15_000);

    it('refuses cardinality, namespace and grantor ACL contamination', async () => {
      const database = process.env.S1203C2A_REAL_TRANSACTION_DATABASE;
      const host = process.env.S1203C2A_ADMIN_HOST;
      const ownerPassword = process.env.S1203C2A_ADMIN_PASSWORD;
      const ownerUser = process.env.S1203C2A_ADMIN_USER;
      const port = Number(process.env.S1203C2A_ADMIN_PORT);
      const writerPassword = process.env.S1203C2A_WRITER_PASSWORD;
      const writerUser = process.env.S1203C2A_WRITER_USER;
      if (
        !database ||
        !host ||
        !ownerPassword ||
        !ownerUser ||
        !Number.isInteger(port) ||
        writerUser !== 'kora_admin_c2a_writer' ||
        !writerPassword
      ) {
        throw new Error('The isolated C2a ACL substitution fixture is incomplete.');
      }
      const owner = new Pool({
        database,
        host,
        max: 1,
        password: ownerPassword,
        port,
        user: ownerUser,
      });
      const boundaries = new AdminC2aBoundariesService(
        configService({
          enabled: true,
          pool: {
            database,
            host,
            password: writerPassword,
            port,
            ssl: false,
            user: writerUser,
          },
          profile: 'HTTP',
        }),
        createAdminC2aPgPool,
      );
      try {
        await owner.query(
          'REVOKE SELECT ("createdAt") ON TABLE public."AdminUser" FROM kora_admin_c2a_writer',
        );
        await owner.query(
          'GRANT SELECT ("passwordHash") ON TABLE public."AdminUser" TO kora_admin_c2a_writer',
        );
        await expect(boundaries.assertIdentity()).rejects.toEqual(
          expect.objectContaining({
            name: AdminC2aBoundaryError.name,
            violations: expect.arrayContaining(['direct_acl_shape']),
          }),
        );
        await owner.query(
          'REVOKE SELECT ("passwordHash") ON TABLE public."AdminUser" FROM kora_admin_c2a_writer',
        );
        await owner.query(
          'GRANT SELECT ("createdAt") ON TABLE public."AdminUser" TO kora_admin_c2a_writer',
        );
        await owner.query('CREATE SCHEMA c2a_acl_shadow');
        await owner.query('CREATE TABLE c2a_acl_shadow."AdminUser" ("createdAt" text)');
        await owner.query(
          'GRANT SELECT ("createdAt") ON TABLE c2a_acl_shadow."AdminUser" TO kora_admin_c2a_writer',
        );
        await expect(boundaries.assertIdentity()).rejects.toEqual(
          expect.objectContaining({
            name: AdminC2aBoundaryError.name,
            violations: expect.arrayContaining(['direct_acl_shape']),
          }),
        );
        await owner.query('DROP TABLE c2a_acl_shadow."AdminUser"');
        await owner.query('DROP SCHEMA c2a_acl_shadow');
        await owner.query('CREATE ROLE kora_c2a_boundary_grantor NOLOGIN');
        await owner.query('GRANT USAGE ON SCHEMA public TO kora_c2a_boundary_grantor');
        await owner.query(
          'GRANT SELECT ("createdAt") ON TABLE public."AdminUser" TO kora_c2a_boundary_grantor WITH GRANT OPTION',
        );
        await owner.query('SET ROLE kora_c2a_boundary_grantor');
        try {
          await owner.query(
            'GRANT SELECT ("createdAt") ON TABLE public."AdminUser" TO kora_admin_c2a_writer',
          );
        } finally {
          await owner.query('RESET ROLE');
        }
        await expect(boundaries.assertIdentity()).rejects.toEqual(
          expect.objectContaining({
            name: AdminC2aBoundaryError.name,
            violations: expect.arrayContaining(['direct_acl_shape']),
          }),
        );
      } finally {
        await owner.query('RESET ROLE');
        await owner.query('SET ROLE kora_c2a_boundary_grantor').catch(() => undefined);
        await owner
          .query(
            'REVOKE SELECT ("createdAt") ON TABLE public."AdminUser" FROM kora_admin_c2a_writer',
          )
          .catch(() => undefined);
        await owner.query('RESET ROLE');
        await owner.query(
          'REVOKE SELECT ("passwordHash") ON TABLE public."AdminUser" FROM kora_admin_c2a_writer',
        );
        await owner.query(
          'GRANT SELECT ("createdAt") ON TABLE public."AdminUser" TO kora_admin_c2a_writer',
        );
        await owner.query('DROP TABLE IF EXISTS c2a_acl_shadow."AdminUser"');
        await owner.query('DROP SCHEMA IF EXISTS c2a_acl_shadow');
        await owner
          .query(
            'REVOKE SELECT ("createdAt") ON TABLE public."AdminUser" FROM kora_c2a_boundary_grantor',
          )
          .catch(() => undefined);
        await owner
          .query('REVOKE USAGE ON SCHEMA public FROM kora_c2a_boundary_grantor')
          .catch(() => undefined);
        await owner.query('DROP ROLE IF EXISTS kora_c2a_boundary_grantor');
        await Promise.all([owner.end(), boundaries.onModuleDestroy()]);
      }
    }, 15_000);
  },
);
