import type { AdminReasonCode } from '../admin-auth/admin-auth.repository';
import { AdminC2HttpError, type AdminC2OperationId } from './admin-security.errors';

export type AdminAuditVersion = 1 | 2 | 3;
export type AdminAuditContext = 'ADMIN_SESSION' | 'ADMIN_RECOVERY' | 'SYSTEM';
export type AdminAuditEventClass = 'LOGIN' | 'SESSION' | 'EXPORT' | 'BUSINESS';

export interface AdminAuditFilters {
  readonly action?: string;
  readonly actorAdminUserId?: string;
  readonly auditContext?: AdminAuditContext;
  readonly auditEventClass?: AdminAuditEventClass;
  readonly auditReasonCode?: AdminReasonCode;
  readonly auditVersion?: AdminAuditVersion;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly entityId?: string;
  readonly entityType?: string;
}

export interface AdminAuditListInput extends AdminAuditFilters {
  readonly cursor?: string;
  readonly limit: number;
}

export interface AdminAuditExportCreateInput extends AdminAuditFilters {
  readonly from: string;
  readonly operatorReason: string;
  readonly reasonCode: AdminReasonCode;
  readonly to: string;
}

export interface AdminAuditLogEntry {
  readonly action: string;
  readonly actorAdminUserId: string | null;
  readonly adminRecoveryContextId: string | null;
  readonly adminSessionId: string | null;
  readonly causationEventId: string | null;
  readonly causationSecurityEventId: string | null;
  readonly context: AdminAuditContext | null;
  readonly createdAt: string;
  readonly delegatedByAdminUserId: string | null;
  readonly entityId: string;
  readonly entityType: string;
  readonly eventClass: AdminAuditEventClass | null;
  readonly eventId: string;
  readonly failureCode: string | null;
  readonly legacyReasonRedacted?: true;
  readonly maskedAfter: Readonly<Record<string, string>> | null;
  readonly maskedBefore: Readonly<Record<string, string>> | null;
  readonly operatorReason: null;
  readonly operatorReasonRedacted: true;
  readonly outcome: 'UNKNOWN' | 'SUCCESS' | 'REJECTED';
  readonly outcomeProvenance: 'HISTORICAL_UNKNOWN' | 'EXPLICIT_C2';
  readonly reasonCode: AdminReasonCode | null;
  readonly requestId: string;
  readonly subjectAdminUserId: string | null;
  readonly systemExecutionRefHash: string | null;
  readonly version: AdminAuditVersion;
}

const REASON_CODES = new Set<AdminReasonCode>([
  'SECURITY_RESPONSE',
  'ACCOUNT_RECOVERY',
  'ROLE_ADMINISTRATION',
  'STATUS_ADMINISTRATION',
  'AUDIT_EXPORT',
  'INVITATION_ADMINISTRATION',
]);
const EVENT_CLASSES = new Set<AdminAuditEventClass>(['LOGIN', 'SESSION', 'EXPORT', 'BUSINESS']);
const CONTEXTS = new Set<AdminAuditContext>(['ADMIN_SESSION', 'ADMIN_RECOVERY', 'SYSTEM']);

function invalid(operationId: AdminC2OperationId, field?: string): never {
  throw new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'RECORD_SECURITY_EVENT', {
    ...(field === undefined ? {} : { details: { field } }),
  });
}

function optionalNonEmptyString(
  operationId: AdminC2OperationId,
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.trim() !== value) {
    invalid(operationId, field);
  }
  return value;
}

function timestamp(operationId: AdminC2OperationId, value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(operationId, field);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    invalid(operationId, field);
  return value;
}

function filters(
  operationId: AdminC2OperationId,
  input: Readonly<Record<string, unknown>>,
): AdminAuditFilters {
  const action = optionalNonEmptyString(operationId, input.action, 'action');
  const actorAdminUserId = optionalNonEmptyString(
    operationId,
    input.actorAdminUserId,
    'actorAdminUserId',
  );
  const entityType = optionalNonEmptyString(operationId, input.entityType, 'entityType');
  const entityId = optionalNonEmptyString(operationId, input.entityId, 'entityId');
  const createdFrom =
    input.createdFrom === undefined
      ? undefined
      : timestamp(operationId, input.createdFrom, 'createdFrom');
  const createdTo =
    input.createdTo === undefined
      ? undefined
      : timestamp(operationId, input.createdTo, 'createdTo');
  const auditVersion = input.auditVersion === undefined ? undefined : Number(input.auditVersion);
  if (auditVersion !== undefined && ![1, 2, 3].includes(auditVersion)) {
    invalid(operationId, 'auditVersion');
  }
  if (
    input.auditEventClass !== undefined &&
    (typeof input.auditEventClass !== 'string' ||
      !EVENT_CLASSES.has(input.auditEventClass as AdminAuditEventClass))
  ) {
    invalid(operationId, 'auditEventClass');
  }
  if (
    input.auditContext !== undefined &&
    (typeof input.auditContext !== 'string' ||
      !CONTEXTS.has(input.auditContext as AdminAuditContext))
  ) {
    invalid(operationId, 'auditContext');
  }
  if (
    input.auditReasonCode !== undefined &&
    (typeof input.auditReasonCode !== 'string' ||
      !REASON_CODES.has(input.auditReasonCode as AdminReasonCode))
  ) {
    invalid(operationId, 'auditReasonCode');
  }
  if (
    createdFrom !== undefined &&
    createdTo !== undefined &&
    new Date(createdFrom).getTime() > new Date(createdTo).getTime()
  ) {
    invalid(operationId, 'createdFrom');
  }
  return {
    ...(action === undefined ? {} : { action }),
    ...(actorAdminUserId === undefined ? {} : { actorAdminUserId }),
    ...(input.auditContext === undefined
      ? {}
      : { auditContext: input.auditContext as AdminAuditContext }),
    ...(input.auditEventClass === undefined
      ? {}
      : { auditEventClass: input.auditEventClass as AdminAuditEventClass }),
    ...(input.auditReasonCode === undefined
      ? {}
      : { auditReasonCode: input.auditReasonCode as AdminReasonCode }),
    ...(auditVersion === undefined ? {} : { auditVersion: auditVersion as AdminAuditVersion }),
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(createdTo === undefined ? {} : { createdTo }),
    ...(entityId === undefined ? {} : { entityId }),
    ...(entityType === undefined ? {} : { entityType }),
  };
}

export function parseAdminAuditListInput(
  input: Readonly<Record<string, unknown>>,
): AdminAuditListInput {
  const operationId = 'listAdminAuditLogs';
  const cursor = input.cursor;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 512)
  ) {
    invalid(operationId, 'cursor');
  }
  const limit =
    input.limit === undefined ? 25 : typeof input.limit === 'string' ? Number(input.limit) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) invalid(operationId, 'limit');
  return { ...filters(operationId, input), ...(cursor === undefined ? {} : { cursor }), limit };
}

export function parseAdminAuditExportCreate(value: unknown): AdminAuditExportCreateInput {
  const operationId = 'createAdminAuditLogExport';
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(operationId);
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    'from',
    'to',
    'actorAdminUserId',
    'action',
    'entityType',
    'entityId',
    'auditVersion',
    'auditEventClass',
    'auditContext',
    'auditReasonCode',
    'reasonCode',
    'operatorReason',
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) invalid(operationId);
  const from = timestamp(operationId, record.from, 'from');
  const to = timestamp(operationId, record.to, 'to');
  if (new Date(from).getTime() > new Date(to).getTime()) invalid(operationId, 'from');
  if (
    typeof record.reasonCode !== 'string' ||
    !REASON_CODES.has(record.reasonCode as AdminReasonCode) ||
    typeof record.operatorReason !== 'string' ||
    record.operatorReason.length < 3 ||
    record.operatorReason.length > 500
  ) {
    invalid(operationId);
  }
  return {
    ...filters(operationId, { ...record, createdFrom: from, createdTo: to }),
    from,
    operatorReason: record.operatorReason,
    reasonCode: record.reasonCode as AdminReasonCode,
    to,
  };
}
