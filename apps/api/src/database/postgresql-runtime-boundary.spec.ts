import type { ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from '../config/runtime-config';
import {
  PostgresqlRuntimeBoundary,
  RuntimeDatabaseBoundaryError,
  runtimeBoundaryViolations,
} from './postgresql-runtime-boundary';
import type { PrismaService, RuntimeBoundarySnapshot } from './prisma.service';

const SAFE_RUNTIME_USER = 'kora_runtime';

function validSnapshot(): RuntimeBoundarySnapshot {
  return {
    canConnect: true,
    canCreateDatabaseObjects: false,
    canCreateSchemaObjects: false,
    canCreateTemporaryObjects: false,
    canUseSchema: true,
    currentUser: SAFE_RUNTIME_USER,
    defaultPrivilegeViolationCount: 0,
    directMembershipCount: 0,
    grantOptionViolationCount: 0,
    largeObjectRoutineExecutePrivilegeCount: 0,
    largeObjectPrivilegeCount: 0,
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
    sessionReplicationRole: 'origin',
    sequencePrivilegeCount: 0,
    sessionUser: SAFE_RUNTIME_USER,
    tableCount: 34,
    tablePrivilegeViolationCount: 0,
    typePrivilegeCount: 0,
    unexpectedSchemaPrivilegeCount: 0,
  };
}

function createConfig(): ConfigService<RuntimeConfig, true> {
  return {
    get: jest.fn((key: string) => {
      if (key === 'postgresql') {
        return { user: SAFE_RUNTIME_USER };
      }
      throw new Error(`Unexpected configuration key: ${key}`);
    }),
  } as unknown as ConfigService<RuntimeConfig, true>;
}

function createPrisma(snapshot: RuntimeBoundarySnapshot): PrismaService {
  return {
    runtimeBoundarySnapshot: jest
      .fn<Promise<RuntimeBoundarySnapshot>, []>()
      .mockResolvedValue(snapshot),
    selectOne: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  } as unknown as PrismaService;
}

describe('PostgresqlRuntimeBoundary', () => {
  it('accepte uniquement la connexion de lecture attendue et vérifie SELECT 1', async () => {
    const prisma = createPrisma(validSnapshot());
    const boundary = new PostgresqlRuntimeBoundary(prisma, createConfig());

    await boundary.assertLeastPrivilege();

    expect(prisma.selectOne).toHaveBeenCalledTimes(1);
    expect(prisma.runtimeBoundarySnapshot).toHaveBeenCalledTimes(1);
  });

  it('rejette les attributs privilégiés, l’écriture et les droits PUBLIC', () => {
    const snapshot = {
      ...validSnapshot(),
      canCreateSchemaObjects: true,
      defaultPrivilegeViolationCount: 1,
      grantOptionViolationCount: 1,
      largeObjectRoutineExecutePrivilegeCount: 1,
      largeObjectPrivilegeCount: 1,
      loCompatPrivilegesEnabled: true,
      parameterPrivilegeCount: 1,
      publicGrantCount: 1,
      roleIsSuperuser: true,
      tablePrivilegeViolationCount: 1,
      typePrivilegeCount: 1,
      unexpectedSchemaPrivilegeCount: 1,
    };

    expect(runtimeBoundaryViolations(snapshot, SAFE_RUNTIME_USER)).toEqual([
      'administrative_role_attribute',
      'unsafe_large_object_compatibility_mode',
      'database_or_schema_write_privilege',
      'unexpected_schema_privilege',
      'unexpected_table_privilege',
      'unexpected_type_privilege',
      'unexpected_large_object_privilege',
      'unexpected_large_object_routine_privilege',
      'unexpected_parameter_privilege',
      'unexpected_default_privilege',
      'unexpected_grant_option',
      'public_privilege_present',
    ]);
  });

  it('refuse une session qui démarre avec le rôle de réplication replica', () => {
    const snapshot = {
      ...validSnapshot(),
      sessionReplicationRole: 'replica',
    };

    expect(runtimeBoundaryViolations(snapshot, SAFE_RUNTIME_USER)).toEqual([
      'unexpected_session_replication_role',
    ]);
  });

  it('refuse l’identité changée, l’héritage, les memberships et la propriété', () => {
    const snapshot = {
      ...validSnapshot(),
      currentUser: 'privileged_owner',
      directMembershipCount: 1,
      ownedObjectCount: 1,
      roleInherits: true,
    };

    expect(runtimeBoundaryViolations(snapshot, SAFE_RUNTIME_USER)).toEqual([
      'unexpected_identity',
      'role_inheritance_enabled',
      'role_membership_present',
      'runtime_owns_database_object',
    ]);
  });

  it('ne restitue jamais les valeurs de connexion dans l’erreur de démarrage', async () => {
    const privateValue = 'private-password-that-must-not-appear';
    const prisma = createPrisma({
      ...validSnapshot(),
      roleCanCreateRole: true,
    });
    const boundary = new PostgresqlRuntimeBoundary(prisma, createConfig());

    try {
      await boundary.assertLeastPrivilege();
      throw new Error('La frontière aurait dû refuser ce rôle.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(RuntimeDatabaseBoundaryError);
      expect((error as Error).message).toContain('administrative_role_attribute');
      expect((error as Error).message).not.toContain(privateValue);
      expect((error as Error).message).not.toContain(SAFE_RUNTIME_USER);
    }
  });
});
