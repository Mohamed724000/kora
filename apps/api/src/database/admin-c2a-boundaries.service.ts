import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolConfig } from 'pg';
import {
  ADMIN_C2_TRANSACTION_BUDGETS,
  AdminC2TransactionService,
  type AdminC2PgClient,
  type AdminC2PgPool,
  type AdminC2Transaction,
} from './admin-c2-transaction.service';
import {
  ADMIN_C2A_DATABASE_USERS,
  ADMIN_C2A_PROFILE_DATABASE_ROLES,
  type AdminC2aDatabaseRole,
  type AdminC2aProcessProfile,
  type RuntimeConfig,
  type RuntimePostgresqlConfig,
} from '../config/runtime-config';

export class AdminC2aDisabledError extends Error {
  constructor() {
    super('Admin C2a database boundaries are disabled.');
    this.name = 'AdminC2aDisabledError';
  }
}

export class AdminC2aBoundaryError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`Admin C2a PostgreSQL boundary violation: ${violations.join(', ')}`);
    this.name = 'AdminC2aBoundaryError';
  }
}

interface BoundarySnapshot {
  currentUser: string;
  sessionUser: string;
  roleIsSuperuser: boolean;
  roleCanCreateRole: boolean;
  roleCanCreateDatabase: boolean;
  roleCanReplicate: boolean;
  roleCanBypassRls: boolean;
  roleCanLogin: boolean;
  roleInherits: boolean;
  roleConnectionLimit: number;
  roleValidUntil: Date | null;
  roleConfigCount: number;
  transactionIsolation: string;
  directMembershipCount: number;
  ownedObjectCount: number;
  directColumnGrantCount: number;
  directRelationGrantCount: number;
  directAclSignatureSource: string;
  forbiddenDirectPrivilegeCount: number;
  dangerousPublicPrivilegeCount: number;
  dangerousEffectivePrivilegeCount: number;
}

type ColumnAclGroup = readonly [
  relation: string,
  privilege: 'INSERT' | 'SELECT' | 'UPDATE',
  columns: readonly string[],
];

const EXPECTED_COLUMN_ACL: Readonly<Record<AdminC2aDatabaseRole, readonly ColumnAclGroup[]>> =
  Object.freeze({
    writer: [
      [
        'AdminUser',
        'SELECT',
        ['id', 'email', 'role', 'status', 'authorizationVersion', 'totpEnabledAt', 'createdAt'],
      ],
      [
        'AdminUser',
        'UPDATE',
        [
          'passwordHash',
          'role',
          'status',
          'authorizationVersion',
          'totpSecretEncrypted',
          'totpEnabledAt',
          'lastAcceptedTotpCounter',
        ],
      ],
      [
        'AdminUser',
        'INSERT',
        [
          'id',
          'email',
          'passwordHash',
          'role',
          'status',
          'authorizationVersion',
          'totpSecretEncrypted',
          'totpEnabledAt',
          'lastAcceptedTotpCounter',
        ],
      ],
      [
        'AdminPreAuthContext',
        'SELECT',
        [
          'id',
          'adminUserId',
          'purpose',
          'authorizationVersion',
          'expiresAt',
          'consumedAt',
          'revokedAt',
          'createdAt',
        ],
      ],
      [
        'AdminPreAuthContext',
        'INSERT',
        ['id', 'adminUserId', 'tokenHash', 'purpose', 'authorizationVersion', 'expiresAt'],
      ],
      [
        'AdminSession',
        'SELECT',
        [
          'id',
          'adminUserId',
          'accessTokenJti',
          'authorizationVersion',
          'expiresAt',
          'absoluteExpiresAt',
          'stepUpPurpose',
          'stepUpExpiresAt',
          'revokedAt',
        ],
      ],
      ['AdminSession', 'UPDATE', ['revokedAt']],
      ['AdminTotpEnrollment', 'SELECT', ['id', 'adminUserId', 'confirmedAt', 'revokedAt']],
      ['AdminTotpEnrollment', 'UPDATE', ['revokedAt']],
      ['AdminRecoveryCodeBatch', 'SELECT', ['id', 'adminUserId', 'revokedAt']],
      ['AdminRecoveryCodeBatch', 'UPDATE', ['revokedAt']],
      [
        'AdminPasswordResetRequest',
        'SELECT',
        [
          'id',
          'adminUserId',
          'securityEventId',
          'replacedRequestId',
          'expiresAt',
          'revokedAt',
          'createdAt',
        ],
      ],
      [
        'AdminPasswordResetRequest',
        'INSERT',
        ['id', 'adminUserId', 'securityEventId', 'replacedRequestId', 'expiresAt'],
      ],
      ['AdminPasswordResetRequest', 'UPDATE', ['revokedAt']],
      [
        'AdminPasswordResetContext',
        'SELECT',
        [
          'id',
          'passwordResetRequestId',
          'adminUserId',
          'tokenHash',
          'authorizationVersion',
          'expiresAt',
          'consumedAt',
          'revokedAt',
          'createdAt',
        ],
      ],
      [
        'AdminPasswordResetContext',
        'INSERT',
        [
          'id',
          'passwordResetRequestId',
          'adminUserId',
          'tokenHash',
          'authorizationVersion',
          'expiresAt',
        ],
      ],
      ['AdminPasswordResetContext', 'UPDATE', ['consumedAt', 'revokedAt']],
      [
        'AdminRecoveryCase',
        'SELECT',
        [
          'id',
          'subjectAdminUserId',
          'creatorAdminUserId',
          'approverAdminUserId',
          'state',
          'stateGeneration',
          'expiresAt',
          'approvedAt',
          'cancelledAt',
          'expiredAt',
          'createdAt',
        ],
      ],
      [
        'AdminRecoveryCase',
        'INSERT',
        ['id', 'subjectAdminUserId', 'creatorAdminUserId', 'state', 'stateGeneration', 'expiresAt'],
      ],
      [
        'AdminRecoveryCase',
        'UPDATE',
        ['approverAdminUserId', 'state', 'stateGeneration', 'approvedAt', 'cancelledAt'],
      ],
      [
        'AdminInvitation',
        'SELECT',
        [
          'id',
          'emailCanonical',
          'deliveryEmailEncrypted',
          'codeHash',
          'proposedRole',
          'creatorAdminUserId',
          'createdByAuditLogId',
          'acceptedAdminUserId',
          'replacedInvitationId',
          'state',
          'stateGeneration',
          'expiresAt',
          'acceptedAt',
          'revokedAt',
          'expiredAt',
          'createdAt',
        ],
      ],
      [
        'AdminInvitation',
        'INSERT',
        [
          'id',
          'emailCanonical',
          'deliveryEmailEncrypted',
          'codeHash',
          'proposedRole',
          'creatorAdminUserId',
          'createdByAuditLogId',
          'replacedInvitationId',
          'state',
          'stateGeneration',
          'expiresAt',
        ],
      ],
      [
        'AdminInvitation',
        'UPDATE',
        ['acceptedAdminUserId', 'state', 'stateGeneration', 'acceptedAt', 'revokedAt'],
      ],
      [
        'AdminNotificationOutbox',
        'SELECT',
        [
          'id',
          'purpose',
          'state',
          'generation',
          'encryptedPayload',
          'encryptionKeyId',
          'encryptionNonce',
          'encryptionTag',
          'aadHash',
          'sourceSecurityEventId',
          'sourceAuditLogId',
          'passwordResetRequestId',
          'adminInvitationId',
          'replacedOutboxId',
          'attemptCount',
          'nextAttemptAt',
          'createdAt',
        ],
      ],
      [
        'AdminNotificationOutbox',
        'INSERT',
        [
          'id',
          'purpose',
          'state',
          'generation',
          'encryptedPayload',
          'encryptionKeyId',
          'encryptionNonce',
          'encryptionTag',
          'aadHash',
          'sourceSecurityEventId',
          'sourceAuditLogId',
          'passwordResetRequestId',
          'adminInvitationId',
          'replacedOutboxId',
          'attemptCount',
          'nextAttemptAt',
        ],
      ],
      ['AdminNotificationOutbox', 'UPDATE', ['state', 'generation', 'cancelledAt']],
      [
        'AdminPaginationSnapshot',
        'SELECT',
        [
          'id',
          'principalAdminUserId',
          'operation',
          'filtersDigest',
          'projectionVersion',
          'entryCount',
          'utf8Bytes',
          'createdAt',
          'expiresAt',
        ],
      ],
      [
        'AdminPaginationSnapshot',
        'INSERT',
        [
          'id',
          'principalAdminUserId',
          'operation',
          'filtersDigest',
          'projectionVersion',
          'entryCount',
          'utf8Bytes',
          'expiresAt',
        ],
      ],
      [
        'AdminPaginationSnapshotItem',
        'SELECT',
        ['snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt', 'projectionJson', 'utf8Bytes'],
      ],
      [
        'AdminPaginationSnapshotItem',
        'INSERT',
        ['snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt', 'projectionJson', 'utf8Bytes'],
      ],
      [
        'AdminC2IdempotencyRecord',
        'SELECT',
        [
          'id',
          'adminUserId',
          'operation',
          'idempotencyKey',
          'requestDigest',
          'responseCode',
          'resourceType',
          'resourceId',
          'expiresAt',
          'createdAt',
        ],
      ],
      [
        'AdminC2IdempotencyRecord',
        'INSERT',
        [
          'id',
          'adminUserId',
          'operation',
          'idempotencyKey',
          'requestDigest',
          'responseCode',
          'resourceType',
          'resourceId',
        ],
      ],
      [
        'AdminSecurityEvent',
        'INSERT',
        [
          'id',
          'adminUserId',
          'eventClass',
          'action',
          'outcome',
          'failureCode',
          'requestId',
          'subjectRefHash',
          'entityType',
          'entityId',
          'adminInvitationId',
        ],
      ],
      [
        'AuditLog',
        'INSERT',
        [
          'id',
          'version',
          'adminUserId',
          'subjectAdminUserId',
          'delegatedByAdminUserId',
          'adminSessionId',
          'adminRecoveryContextId',
          'adminPasswordResetContextId',
          'eventClass',
          'context',
          'outcome',
          'failureCode',
          'action',
          'entityType',
          'entityId',
          'maskedBefore',
          'maskedAfter',
          'reason',
          'reasonCode',
          'operatorReason',
          'requestId',
          'causationEventId',
          'causationSecurityEventId',
          'adminRecoveryCaseId',
          'adminInvitationId',
          'systemExecutionRefHash',
        ],
      ],
    ],
    notificationWorker: [
      [
        'AdminNotificationOutbox',
        'SELECT',
        [
          'id',
          'purpose',
          'state',
          'generation',
          'encryptedPayload',
          'encryptionKeyId',
          'encryptionNonce',
          'encryptionTag',
          'aadHash',
          'sourceSecurityEventId',
          'sourceAuditLogId',
          'passwordResetRequestId',
          'adminInvitationId',
          'replacedOutboxId',
          'claimOwnerHash',
          'leaseExpiresAt',
          'attemptCount',
          'nextAttemptAt',
          'providerAcknowledgementHash',
          'deliveredAt',
          'failedAt',
          'uncertainAt',
          'cancelledAt',
          'createdAt',
        ],
      ],
      [
        'AdminNotificationOutbox',
        'UPDATE',
        [
          'state',
          'generation',
          'claimOwnerHash',
          'leaseExpiresAt',
          'attemptCount',
          'nextAttemptAt',
          'providerAcknowledgementHash',
          'deliveredAt',
          'failedAt',
          'uncertainAt',
          'cancelledAt',
        ],
      ],
      [
        'AuditLog',
        'INSERT',
        [
          'id',
          'version',
          'systemExecutionRefHash',
          'eventClass',
          'context',
          'outcome',
          'failureCode',
          'action',
          'entityType',
          'entityId',
          'maskedBefore',
          'maskedAfter',
          'reason',
          'reasonCode',
          'operatorReason',
          'requestId',
          'causationEventId',
          'causationSecurityEventId',
          'delegatedByAdminUserId',
          'adminInvitationId',
          'notificationOutboxId',
        ],
      ],
    ],
    expirationWorker: [
      ['AdminRecoveryCase', 'SELECT', ['id', 'state', 'stateGeneration', 'expiresAt']],
      ['AdminRecoveryCase', 'UPDATE', ['state', 'stateGeneration', 'expiredAt']],
      [
        'AuditLog',
        'INSERT',
        [
          'id',
          'version',
          'systemExecutionRefHash',
          'eventClass',
          'context',
          'outcome',
          'failureCode',
          'action',
          'entityType',
          'entityId',
          'maskedBefore',
          'maskedAfter',
          'reason',
          'reasonCode',
          'operatorReason',
          'requestId',
          'adminRecoveryCaseId',
        ],
      ],
    ],
    bootstrap: [
      ['AdminUser', 'SELECT', ['id', 'email', 'status']],
      [
        'AdminUser',
        'INSERT',
        [
          'id',
          'email',
          'passwordHash',
          'role',
          'status',
          'authorizationVersion',
          'totpSecretEncrypted',
          'totpEnabledAt',
          'lastAcceptedTotpCounter',
        ],
      ],
      [
        'AdminBootstrapGuard',
        'SELECT',
        ['singletonKey', 'adminUserId', 'bootstrapAuditLogId', 'createdAt'],
      ],
      ['AdminBootstrapGuard', 'INSERT', ['singletonKey', 'adminUserId', 'bootstrapAuditLogId']],
      [
        'AuditLog',
        'INSERT',
        [
          'id',
          'version',
          'systemExecutionRefHash',
          'eventClass',
          'context',
          'outcome',
          'failureCode',
          'action',
          'entityType',
          'entityId',
          'maskedBefore',
          'maskedAfter',
          'reason',
          'reasonCode',
          'operatorReason',
          'requestId',
          'bootstrapGuardId',
        ],
      ],
    ],
  });

const EXPECTED_RELATION_ACL: Readonly<Record<AdminC2aDatabaseRole, readonly string[]>> =
  Object.freeze({
    writer: [],
    notificationWorker: [
      'AdminC2NotificationSecurityEventSource',
      'AdminC2NotificationAuditSource',
    ],
    expirationWorker: [],
    bootstrap: [],
  });

function expectedAclSignatures(role: AdminC2aDatabaseRole): readonly string[] {
  const signatures = ['database||CONNECT|false|true', 'schema|public|USAGE|false|true'];
  for (const [relation, privilege, columns] of EXPECTED_COLUMN_ACL[role]) {
    for (const column of columns) {
      signatures.push(`column|public|${relation}|${column}|${privilege}|false|true`);
    }
  }
  for (const relation of EXPECTED_RELATION_ACL[role]) {
    signatures.push(`relation|public|${relation}||SELECT|false|true`);
  }
  return signatures.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

const BOUNDARY_SQL = `
  SELECT
    current_user AS "currentUser",
    session_user AS "sessionUser",
    role_entry.rolsuper AS "roleIsSuperuser",
    role_entry.rolcreaterole AS "roleCanCreateRole",
    role_entry.rolcreatedb AS "roleCanCreateDatabase",
    role_entry.rolreplication AS "roleCanReplicate",
    role_entry.rolbypassrls AS "roleCanBypassRls",
    role_entry.rolcanlogin AS "roleCanLogin",
    role_entry.rolinherit AS "roleInherits",
    role_entry.rolconnlimit AS "roleConnectionLimit",
    role_entry.rolvaliduntil AS "roleValidUntil",
    COALESCE(cardinality(role_entry.rolconfig), 0) AS "roleConfigCount",
    current_setting('transaction_isolation') AS "transactionIsolation",
    (
      SELECT count(*)::integer
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = role_entry.oid OR membership.roleid = role_entry.oid
    ) AS "directMembershipCount",
    (
      SELECT count(*)::integer
      FROM pg_catalog.pg_shdepend AS dependency
      WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
        AND dependency.refobjid = role_entry.oid
        AND dependency.deptype = 'o'
    ) AS "ownedObjectCount",
    (
      SELECT count(*)::integer
      FROM pg_catalog.pg_attribute AS attribute_entry
      JOIN pg_catalog.pg_class AS class_entry
        ON class_entry.oid = attribute_entry.attrelid
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
      WHERE attribute_entry.attnum > 0
        AND NOT attribute_entry.attisdropped
        AND privilege.grantee = role_entry.oid
        AND NOT privilege.is_grantable
    ) AS "directColumnGrantCount",
    (
      SELECT count(*)::integer
      FROM pg_catalog.pg_class AS class_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
      WHERE privilege.grantee = role_entry.oid
        AND NOT privilege.is_grantable
    ) AS "directRelationGrantCount",
    (
      SELECT COALESCE(
        string_agg(acl_entry.signature, E'\n' ORDER BY acl_entry.signature COLLATE "C"),
        ''
      )
      FROM (
        SELECT 'database||' || privilege.privilege_type || '|' ||
               privilege.is_grantable::text || '|' ||
               (privilege.grantor = database_entry.datdba)::text AS signature
        FROM pg_catalog.pg_database AS database_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
        ) AS privilege
        WHERE database_entry.datname = current_database()
          AND privilege.grantee = role_entry.oid
        UNION ALL
        SELECT 'schema|' || namespace_entry.nspname || '|' || privilege.privilege_type ||
               '|' || privilege.is_grantable::text || '|' ||
               (privilege.grantor = namespace_entry.nspowner)::text AS signature
        FROM pg_catalog.pg_namespace AS namespace_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
        ) AS privilege
        WHERE privilege.grantee = role_entry.oid
        UNION ALL
        SELECT 'column|' || namespace_entry.nspname || '|' || class_entry.relname || '|' ||
               attribute_entry.attname || '|' || privilege.privilege_type || '|' ||
               privilege.is_grantable::text || '|' ||
               (privilege.grantor = class_entry.relowner)::text AS signature
        FROM pg_catalog.pg_attribute AS attribute_entry
        JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = class_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
        WHERE attribute_entry.attnum > 0
          AND NOT attribute_entry.attisdropped
          AND privilege.grantee = role_entry.oid
        UNION ALL
        SELECT 'relation|' || namespace_entry.nspname || '|' || class_entry.relname || '||' ||
               privilege.privilege_type || '|' || privilege.is_grantable::text || '|' ||
               (privilege.grantor = class_entry.relowner)::text AS signature
        FROM pg_catalog.pg_class AS class_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = class_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
        WHERE privilege.grantee = role_entry.oid
      ) AS acl_entry
    ) AS "directAclSignatureSource",
    (
      SELECT count(*)::integer
      FROM (
        SELECT privilege.grantee
        FROM pg_catalog.pg_proc AS routine_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(routine_entry.proacl) AS privilege
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_type AS type_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(type_entry.typacl) AS privilege
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_largeobject_metadata AS large_object
        CROSS JOIN LATERAL pg_catalog.aclexplode(large_object.lomacl) AS privilege
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_parameter_acl AS parameter_acl
        CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_default_acl AS default_acl
        CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
      ) AS forbidden_privilege
      WHERE forbidden_privilege.grantee = role_entry.oid
    ) AS "forbiddenDirectPrivilegeCount",
    (
      SELECT count(*)::integer
      FROM (
        SELECT privilege.grantee
        FROM pg_catalog.pg_database AS database_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
        ) AS privilege
        WHERE database_entry.datname = current_database()
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_namespace AS namespace_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
        ) AS privilege
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_class AS class_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = class_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_attribute AS attribute_entry
        JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = class_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = routine_entry.pronamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
        ) AS privilege
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_type AS type_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = type_entry.typnamespace
        LEFT JOIN pg_catalog.pg_class AS composite_entry
          ON composite_entry.oid = type_entry.typrelid
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
        ) AS privilege
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
          AND type_entry.typisdefined
          AND type_entry.typelem = 0
          AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_largeobject_metadata AS large_object
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(large_object.lomacl, pg_catalog.acldefault('L', large_object.lomowner))
        ) AS privilege
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_parameter_acl AS parameter_acl
        CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
        UNION ALL
        SELECT privilege.grantee
        FROM pg_catalog.pg_default_acl AS default_acl
        CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
      ) AS public_privilege
      WHERE public_privilege.grantee = 0
    ) AS "dangerousPublicPrivilegeCount",
    (
      SELECT
        (CASE WHEN has_database_privilege(current_user, current_database(), 'CREATE')
                    OR has_database_privilege(current_user, current_database(), 'TEMP')
          THEN 1 ELSE 0 END)
        + (CASE WHEN has_schema_privilege(current_user, 'public', 'CREATE')
          THEN 1 ELSE 0 END)
        + (SELECT count(*)::integer
           FROM pg_catalog.pg_type AS type_entry
           JOIN pg_catalog.pg_namespace AS namespace_entry
             ON namespace_entry.oid = type_entry.typnamespace
           LEFT JOIN pg_catalog.pg_class AS composite_entry
             ON composite_entry.oid = type_entry.typrelid
           WHERE namespace_entry.nspname <> 'information_schema'
             AND namespace_entry.nspname !~ '^pg_'
             AND type_entry.typisdefined
             AND type_entry.typelem = 0
             AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
             AND has_type_privilege(current_user, type_entry.oid, 'USAGE'))
        + (SELECT count(*)::integer
           FROM pg_catalog.pg_proc AS routine_entry
           JOIN pg_catalog.pg_namespace AS namespace_entry
             ON namespace_entry.oid = routine_entry.pronamespace
           WHERE namespace_entry.nspname <> 'information_schema'
             AND namespace_entry.nspname !~ '^pg_'
             AND has_function_privilege(current_user, routine_entry.oid, 'EXECUTE'))
        + (SELECT count(*)::integer
           FROM pg_catalog.pg_proc AS routine_entry
           JOIN pg_catalog.pg_namespace AS namespace_entry
             ON namespace_entry.oid = routine_entry.pronamespace
           WHERE namespace_entry.nspname = 'pg_catalog'
             AND (routine_entry.proname ~ '^lo_'
               OR routine_entry.proname IN ('loread', 'lowrite'))
             AND has_function_privilege(current_user, routine_entry.oid, 'EXECUTE'))
        + (SELECT count(*)::integer
           FROM pg_catalog.pg_largeobject_metadata AS large_object
           WHERE has_largeobject_privilege(
             current_user,
             large_object.oid,
             'SELECT,UPDATE'
           ))
        + (SELECT count(*)::integer
           FROM pg_catalog.pg_parameter_acl AS parameter_acl
           WHERE has_parameter_privilege(current_user, parameter_acl.parname, 'SET')
              OR has_parameter_privilege(
                current_user,
                parameter_acl.parname,
                'ALTER SYSTEM'
              )
        )
    ) AS "dangerousEffectivePrivilegeCount"
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = current_user
`;

function poolOptions(role: AdminC2aDatabaseRole, config: RuntimePostgresqlConfig): PoolConfig {
  return {
    application_name: `kora-plus-api-admin-c2a-${role}`,
    connectionTimeoutMillis: ADMIN_C2_TRANSACTION_BUDGETS.acquireMs,
    database: config.database,
    host: config.host,
    max: 1,
    password: config.password,
    port: config.port,
    user: config.user,
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

export type AdminC2aPoolFactory = (
  role: AdminC2aDatabaseRole,
  config: RuntimePostgresqlConfig,
) => Pool;

export const ADMIN_C2A_POOL_FACTORY = Symbol('ADMIN_C2A_POOL_FACTORY');

export const createAdminC2aPgPool: AdminC2aPoolFactory = (role, config) =>
  new Pool(poolOptions(role, config));

function poolAdapter(pool: Pool): AdminC2PgPool {
  return {
    connect: async () => (await pool.connect()) as unknown as AdminC2PgClient,
  };
}

@Injectable()
export class AdminC2aBoundariesService implements OnModuleDestroy {
  private readonly poolInstance?: Pool;
  private readonly executorInstance?: AdminC2TransactionService;
  private readonly role?: AdminC2aDatabaseRole;
  readonly enabled: boolean;
  readonly profile?: AdminC2aProcessProfile;

  constructor(
    @Inject(ConfigService) configService: ConfigService<RuntimeConfig, true>,
    @Inject(ADMIN_C2A_POOL_FACTORY) poolFactory: AdminC2aPoolFactory,
  ) {
    const config = configService.getOrThrow<RuntimeConfig['adminC2a']>('adminC2a');
    this.enabled = config.enabled;
    if (!config.enabled) {
      return;
    }
    this.profile = config.profile;
    this.role = ADMIN_C2A_PROFILE_DATABASE_ROLES[config.profile];
    this.poolInstance = poolFactory(this.role, config.pool);
    this.poolInstance.on('error', () => undefined);
    this.executorInstance = new AdminC2TransactionService(poolAdapter(this.poolInstance));
  }

  private pool(): Pool {
    if (this.poolInstance === undefined) {
      throw new AdminC2aDisabledError();
    }
    return this.poolInstance;
  }

  private executor(): AdminC2TransactionService {
    if (this.executorInstance === undefined) {
      throw new AdminC2aDisabledError();
    }
    return this.executorInstance;
  }

  private activeRole(): AdminC2aDatabaseRole {
    if (this.role === undefined) {
      throw new AdminC2aDisabledError();
    }
    return this.role;
  }

  private assertSnapshot(rows: readonly BoundarySnapshot[]): void {
    const snapshot = rows[0];
    const role = this.activeRole();
    const expectedUser = ADMIN_C2A_DATABASE_USERS[role];
    const expectedAcl = expectedAclSignatures(role);
    const violations: string[] = [];
    if (rows.length !== 1 || snapshot === undefined) {
      violations.push('identity_snapshot_unavailable');
    } else {
      if (snapshot.currentUser !== expectedUser || snapshot.sessionUser !== expectedUser) {
        violations.push('identity_mismatch');
      }
      if (
        snapshot.roleIsSuperuser ||
        snapshot.roleCanCreateRole ||
        snapshot.roleCanCreateDatabase ||
        snapshot.roleCanReplicate ||
        snapshot.roleCanBypassRls
      ) {
        violations.push('administrative_attribute');
      }
      if (
        !snapshot.roleCanLogin ||
        snapshot.roleInherits ||
        snapshot.roleConnectionLimit !== -1 ||
        snapshot.roleValidUntil !== null ||
        snapshot.roleConfigCount !== 0
      ) {
        violations.push('login_or_role_configuration');
      }
      if (snapshot.transactionIsolation !== 'read committed') {
        violations.push('transaction_isolation');
      }
      if (snapshot.directMembershipCount !== 0) {
        violations.push('membership');
      }
      if (snapshot.ownedObjectCount !== 0) {
        violations.push('ownership');
      }
      const actualAcl =
        snapshot.directAclSignatureSource === ''
          ? []
          : snapshot.directAclSignatureSource.split('\n');
      if (
        actualAcl.length !== expectedAcl.length ||
        actualAcl.some((entry, index) => entry !== expectedAcl[index])
      ) {
        violations.push('direct_acl_shape');
      }
      if (snapshot.forbiddenDirectPrivilegeCount !== 0) {
        violations.push('forbidden_direct_privilege');
      }
      if (snapshot.dangerousPublicPrivilegeCount !== 0) {
        violations.push('public_privilege');
      }
      if (snapshot.dangerousEffectivePrivilegeCount !== 0) {
        violations.push('dangerous_effective_privilege');
      }
    }
    if (violations.length > 0) {
      throw new AdminC2aBoundaryError(violations);
    }
  }

  async assertIdentity(): Promise<void> {
    const result = await this.pool().query<BoundarySnapshot>(BOUNDARY_SQL);
    this.assertSnapshot(result.rows);
  }

  async transaction<T>(callback: (transaction: AdminC2Transaction) => Promise<T>): Promise<T> {
    return this.executor().transaction(async (transaction) => {
      const identity = await transaction.query<BoundarySnapshot>(BOUNDARY_SQL);
      this.assertSnapshot(identity.rows);
      return callback(transaction);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.poolInstance !== undefined) {
      await this.poolInstance.end();
    }
  }
}
