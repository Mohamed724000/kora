import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from '../config/runtime-config';
import { PrismaService, type RuntimeBoundarySnapshot } from './prisma.service';
import { RuntimeDatabaseBoundary } from './runtime-database-boundary';

export class RuntimeDatabaseBoundaryError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`PostgreSQL runtime boundary rejected: ${violations.join(', ')}`);
    this.name = 'RuntimeDatabaseBoundaryError';
  }
}

export function runtimeBoundaryViolations(
  snapshot: RuntimeBoundarySnapshot,
  expectedUser: string,
): string[] {
  const violations: string[] = [];

  if (snapshot.currentUser !== expectedUser || snapshot.sessionUser !== expectedUser) {
    violations.push('unexpected_identity');
  }
  if (
    snapshot.roleIsSuperuser ||
    snapshot.roleCanCreateRole ||
    snapshot.roleCanCreateDatabase ||
    snapshot.roleCanReplicate ||
    snapshot.roleCanBypassRls
  ) {
    violations.push('administrative_role_attribute');
  }
  if (!snapshot.roleCanLogin) {
    violations.push('login_disabled');
  }
  if (snapshot.roleInherits) {
    violations.push('role_inheritance_enabled');
  }
  if (snapshot.directMembershipCount !== 0) {
    violations.push('role_membership_present');
  }
  if (snapshot.ownedObjectCount !== 0) {
    violations.push('runtime_owns_database_object');
  }
  if (!snapshot.canConnect || !snapshot.canUseSchema) {
    violations.push('required_read_privilege_missing');
  }
  if (
    snapshot.canCreateDatabaseObjects ||
    snapshot.canCreateSchemaObjects ||
    snapshot.canCreateTemporaryObjects
  ) {
    violations.push('database_or_schema_write_privilege');
  }
  if (snapshot.tableCount === 0) {
    violations.push('application_tables_missing');
  }
  if (snapshot.tablePrivilegeViolationCount !== 0) {
    violations.push('unexpected_table_privilege');
  }
  if (snapshot.sequencePrivilegeCount !== 0) {
    violations.push('unexpected_sequence_privilege');
  }
  if (snapshot.routineExecutePrivilegeCount !== 0) {
    violations.push('unexpected_routine_privilege');
  }
  if (snapshot.publicGrantCount !== 0) {
    violations.push('public_privilege_present');
  }

  return violations;
}

@Injectable()
export class PostgresqlRuntimeBoundary extends RuntimeDatabaseBoundary {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService<RuntimeConfig, true>,
  ) {
    super();
  }

  async assertLeastPrivilege(): Promise<void> {
    await this.prisma.selectOne();
    const snapshot = await this.prisma.runtimeBoundarySnapshot();
    const expectedUser = this.config.get('postgresql', { infer: true }).user;
    const violations = runtimeBoundaryViolations(snapshot, expectedUser);
    if (violations.length > 0) {
      throw new RuntimeDatabaseBoundaryError(violations);
    }
  }
}
