import type { AdminAuditLogEntry } from './admin-audit.types';

const ROLES = new Set(['SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT']);
const STATUSES = new Set(['PENDING_MFA', 'ACTIVE', 'SUSPENDED', 'DISABLED']);

export interface AdminAuditProjectionRow {
  readonly action: string;
  readonly actorAdminUserId: string | null;
  readonly adminRecoveryContextId: string | null;
  readonly adminSessionId: string | null;
  readonly causationEventId: string | null;
  readonly causationSecurityEventId: string | null;
  readonly context: AdminAuditLogEntry['context'];
  readonly createdAt: Date | string;
  readonly delegatedByAdminUserId: string | null;
  readonly entityId: string;
  readonly entityType: string;
  readonly eventClass: AdminAuditLogEntry['eventClass'];
  readonly eventId: string;
  readonly failureCode: string | null;
  readonly legacyReasonRedacted: boolean;
  readonly maskedAfter: unknown;
  readonly maskedBefore: unknown;
  readonly operatorReason: null;
  readonly operatorReasonRedacted: boolean;
  readonly outcome: AdminAuditLogEntry['outcome'];
  readonly outcomeProvenance: AdminAuditLogEntry['outcomeProvenance'];
  readonly reasonCode: AdminAuditLogEntry['reasonCode'];
  readonly requestId: string;
  readonly subjectAdminUserId: string | null;
  readonly systemExecutionRefHash: string | null;
  readonly version: number;
}

function positiveMask(action: string, value: unknown): Readonly<Record<string, string>> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    action === 'changeAdminUserRole' &&
    typeof record.role === 'string' &&
    ROLES.has(record.role)
  ) {
    return { role: record.role };
  }
  if (
    action === 'changeAdminUserStatus' &&
    typeof record.status === 'string' &&
    STATUSES.has(record.status)
  ) {
    return { status: record.status };
  }
  return null;
}

export function projectAdminAudit(row: AdminAuditProjectionRow): AdminAuditLogEntry {
  if (![1, 2, 3].includes(row.version))
    throw new TypeError('Unsupported audit projection version.');
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  const version = row.version as 1 | 2 | 3;
  return {
    action: row.action,
    actorAdminUserId: row.actorAdminUserId,
    adminRecoveryContextId: row.adminRecoveryContextId,
    adminSessionId: row.adminSessionId,
    causationEventId: row.causationEventId,
    causationSecurityEventId: row.causationSecurityEventId,
    context: row.context,
    createdAt,
    delegatedByAdminUserId: row.delegatedByAdminUserId,
    entityId: row.entityId,
    entityType: row.entityType,
    eventClass: row.eventClass,
    eventId: row.eventId,
    failureCode: version === 3 ? row.failureCode : null,
    ...(version === 1 ? { legacyReasonRedacted: true as const } : {}),
    maskedAfter: positiveMask(row.action, row.maskedAfter),
    maskedBefore: positiveMask(row.action, row.maskedBefore),
    operatorReason: null,
    operatorReasonRedacted: true,
    outcome: version === 3 ? row.outcome : 'UNKNOWN',
    outcomeProvenance: version === 3 ? 'EXPLICIT_C2' : 'HISTORICAL_UNKNOWN',
    reasonCode: version === 1 ? null : row.reasonCode,
    requestId: row.requestId,
    subjectAdminUserId: row.subjectAdminUserId,
    systemExecutionRefHash: row.systemExecutionRefHash,
    version,
  };
}
