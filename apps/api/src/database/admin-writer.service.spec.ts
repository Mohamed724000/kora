import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import {
  ADMIN_WRITER_COLUMN_PRIVILEGES,
  AdminWriterBoundaryError,
  type AdminWriterBoundarySnapshot,
  AdminWriterCommitUnknownError,
  AdminWriterService,
  adminWriterBoundaryViolations,
  adminWriterConfigurationViolations,
  type AdminWriterPostgresqlConfig,
} from './admin-writer.service';

jest.mock('pg', () => ({ Pool: jest.fn() }));

const reader: AdminWriterPostgresqlConfig = {
  database: 'kora',
  host: '127.0.0.1',
  password: 'reader-secret',
  port: 5432,
  ssl: false,
  user: 'kora_reader',
};
const writer: AdminWriterPostgresqlConfig = {
  ...reader,
  password: 'writer-secret',
  user: 'kora_admin_writer',
};

function validSnapshot(): AdminWriterBoundarySnapshot {
  return {
    canConnect: true,
    canCreateDatabaseObjects: false,
    canCreateSchemaObjects: false,
    canCreateTemporaryObjects: false,
    canUseSchema: true,
    columnPrivilegeMismatchCount: 0,
    currentUser: writer.user,
    defaultPrivilegeCount: 0,
    directConnectPrivilegeCount: 1,
    directMembershipCount: 0,
    directSchemaUsagePrivilegeCount: 1,
    grantOptionCount: 0,
    largeObjectPrivilegeCount: 0,
    largeObjectRoutineExecutePrivilegeCount: 0,
    loCompatPrivilegesEnabled: false,
    ownedObjectCount: 0,
    parameterPrivilegeCount: 0,
    publicGrantCount: 0,
    roleCanBypassRls: false,
    roleCanCreateDatabase: false,
    roleCanCreateRole: false,
    roleCanLogin: true,
    roleCanReplicate: false,
    roleInherits: false,
    roleIsSuperuser: false,
    routineExecutePrivilegeCount: 0,
    sequencePrivilegeCount: 0,
    sessionReplicationRole: 'origin',
    sessionUser: writer.user,
    tablePrivilegeCount: 0,
    typePrivilegeCount: 0,
    unexpectedSchemaPrivilegeCount: 0,
  };
}

function configService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'postgresql') return reader;
      if (key === 'adminAuth') return { postgresql: writer };
      if (key === 'readiness') return { timeoutMs: 1_000 };
      throw new Error(`unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;
}

describe('AdminWriterService', () => {
  const pool = {
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Pool as unknown as jest.Mock).mockImplementation(() => pool);
  });

  it('exige une identité et un secret distincts sur la même base', () => {
    expect(adminWriterConfigurationViolations(reader, writer)).toEqual([]);
    expect(
      adminWriterConfigurationViolations(reader, {
        ...writer,
        database: 'other',
        password: reader.password,
        user: reader.user,
      }),
    ).toEqual([
      'writer_database_target_mismatch',
      'writer_identity_not_distinct',
      'writer_secret_not_distinct',
    ]);
  });

  it('ferme exactement la matrice et garde les sinks INSERT-only', () => {
    expect(ADMIN_WRITER_COLUMN_PRIVILEGES).toContainEqual([
      'AdminRecoveryCode',
      'selector',
      'INSERT',
    ]);
    expect(ADMIN_WRITER_COLUMN_PRIVILEGES).toContainEqual(['AuditLog', 'reasonCode', 'INSERT']);
    expect(
      ADMIN_WRITER_COLUMN_PRIVILEGES.some(
        ([table, , privilege]) =>
          (table === 'AuditLog' || table === 'AdminSecurityEvent') && privilege !== 'INSERT',
      ),
    ).toBe(false);
    expect(ADMIN_WRITER_COLUMN_PRIVILEGES).not.toContainEqual([
      'AuditLog',
      'systemExecutionRefHash',
      'INSERT',
    ]);
  });

  it('rejette toute dérive de privilège sans exposer les identifiants', () => {
    const snapshot = {
      ...validSnapshot(),
      columnPrivilegeMismatchCount: 1,
      defaultPrivilegeCount: 1,
      roleIsSuperuser: true,
    };
    expect(adminWriterBoundaryViolations(snapshot, writer.user)).toEqual([
      'administrative_role_attribute',
      'unexpected_column_privilege_matrix',
      'unexpected_default_privilege',
    ]);
  });

  it('refuse les privilÃ¨ges requis hÃ©ritÃ©s de PUBLIC et les routines large-object', () => {
    const snapshot = {
      ...validSnapshot(),
      directConnectPrivilegeCount: 0,
      directSchemaUsagePrivilegeCount: 0,
      largeObjectRoutineExecutePrivilegeCount: 1,
      publicGrantCount: 1,
    };
    expect(adminWriterBoundaryViolations(snapshot, writer.user)).toEqual([
      'required_direct_privilege_missing',
      'unexpected_large_object_routine_privilege',
      'public_privilege_present',
    ]);
  });

  it('atteste SELECT 1 puis la matrice exacte', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ value: 1 }] })
      .mockResolvedValueOnce({ rows: [validSnapshot()] });
    const service = new AdminWriterService(configService());

    await service.assertLeastPrivilege();

    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('refuse une configuration partagée sans journaliser les secrets', () => {
    const config = configService();
    (config.getOrThrow as jest.Mock).mockImplementation((key: string) => {
      if (key === 'postgresql') return reader;
      if (key === 'adminAuth') return { postgresql: { ...writer, password: reader.password } };
      if (key === 'readiness') return { timeoutMs: 1_000 };
      throw new Error('unexpected');
    });

    expect(() => new AdminWriterService(config)).toThrow(AdminWriterBoundaryError);
    try {
      new AdminWriterService(config);
    } catch (error: unknown) {
      expect((error as Error).message).not.toContain(reader.password);
      expect((error as Error).message).not.toContain(writer.user);
    }
  });

  it('commit une transaction paramétrée et rend le client au pool', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'ok' }] }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
    const service = new AdminWriterService(configService());

    const result = await service.transaction(async (transaction) => {
      const query = await transaction.query<{ id: string }>('SELECT $1::text AS id', ['ok']);
      return query.rows[0]?.id;
    });

    expect(result).toBe('ok');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'SELECT $1::text AS id',
      'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('rollback un échec confirmé avant COMMIT', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    const service = new AdminWriterService(configService());

    await expect(
      service.transaction(async () => {
        throw new Error('business failure');
      }),
    ).rejects.toThrow('business failure');

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('distingue un COMMIT inconnu et détruit la connexion', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('connection lost')),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
    const service = new AdminWriterService(configService());

    await expect(service.transaction(async () => 'result')).rejects.toBeInstanceOf(
      AdminWriterCommitUnknownError,
    );
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it('ferme le pool au teardown Nest', async () => {
    pool.end.mockResolvedValue(undefined);
    const service = new AdminWriterService(configService());
    await service.onModuleDestroy();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
