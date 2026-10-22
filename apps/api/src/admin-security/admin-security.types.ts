import type {
  AdminReasonCode,
  AdminRole,
  AdminStatus,
  AdminStepUpPurpose,
} from '../admin-auth/admin-auth.repository';
import { AdminC2HttpError, type AdminC2OperationId } from './admin-security.errors';

export type { AdminReasonCode, AdminRole, AdminStatus, AdminStepUpPurpose };

export interface AdminC2ExecutionContext {
  readonly ipAddress: string;
  readonly requestId: string;
}

export interface AdminC2BearerProof {
  readonly adminUserId: string;
  readonly authorizationVersion: number;
  readonly expiresAtSeconds: number;
  readonly issuedAtSeconds: number;
  readonly role: string;
  readonly sessionId: string;
  readonly tokenId: string;
}

export interface AdminC2AuthenticatedRequest {
  readonly authorization: string | undefined;
  readonly expectedStepUp?: AdminStepUpPurpose;
}

export interface AdminReasonInput {
  readonly operatorReason: string;
  readonly reasonCode: AdminReasonCode;
}

export interface AdminPasswordResetRequestInput {
  readonly deliveryEmail: string;
  readonly emailCanonical: string;
}

export interface AdminPasswordResetInput {
  readonly newPassword: string;
  readonly resetCode: string;
}

export interface AdminRecoveryCaseCreateInput extends AdminReasonInput {
  readonly subjectAdminUserId: string;
}

export interface AdminInvitationCreateInput extends AdminReasonInput {
  readonly deliveryEmail: string;
  readonly emailCanonical: string;
  readonly role: AdminRole;
}

export interface AdminInvitationAcceptInput {
  readonly invitationCode: string;
  readonly password: string;
}

export interface AdminRoleChangeInput extends AdminReasonInput {
  readonly role: AdminRole;
}

export interface AdminStatusChangeInput extends AdminReasonInput {
  readonly status: Extract<AdminStatus, 'ACTIVE' | 'SUSPENDED' | 'DISABLED'>;
}

export interface AdminRecoveryCaseProjection {
  readonly approverAdminUserId: string | null;
  readonly caseId: string;
  readonly createdAt: string;
  readonly creatorAdminUserId: string;
  readonly expiresAt: string;
  readonly state: 'PENDING' | 'APPROVED' | 'CANCELLED' | 'EXPIRED';
  readonly subjectAdminUserId: string;
}

export interface AdminInvitationProjection {
  readonly email: string;
  readonly expiresAt: string;
  readonly invitationId: string;
  readonly role: AdminRole;
  readonly status: 'PENDING';
}

export interface AdminUserProjection {
  readonly adminUserId: string;
  readonly authorizationVersion: number;
  readonly email: string;
  readonly role: AdminRole;
  readonly status: AdminStatus;
}

export interface AdminPage<T> {
  readonly data: readonly T[];
  readonly meta: {
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}

export interface AdminPaginationInput {
  readonly cursor?: string;
  readonly limit: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_PATTERN = /^[\x21-\x7e]{16,128}$/u;
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_{}|~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const NON_AMBIGUOUS_SECRET_PATTERN = /^[A-HJ-NP-Z2-9]{26,64}$/u;
const PASSWORD_PATTERN = /^[\s\S]{12,128}$/u;

const ROLES = new Set<AdminRole>(['SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT']);
const MUTABLE_STATUSES = new Set<AdminStatus>(['ACTIVE', 'SUSPENDED', 'DISABLED']);
const REASON_CODES = new Set<AdminReasonCode>([
  'SECURITY_RESPONSE',
  'ACCOUNT_RECOVERY',
  'ROLE_ADMINISTRATION',
  'STATUS_ADMINISTRATION',
  'AUDIT_EXPORT',
  'INVITATION_ADMINISTRATION',
]);

function invalid(operationId: AdminC2OperationId, field?: string): never {
  throw new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'RECORD_SECURITY_EVENT', {
    ...(field === undefined ? {} : { details: { field } }),
  });
}

function exactRecord(
  operationId: AdminC2OperationId,
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(operationId);
  const record = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    invalid(operationId);
  }
  return record;
}

export function canonicalAdminEmail(operationId: AdminC2OperationId, input: unknown): string {
  if (typeof input !== 'string' || input.length < 3 || input.length > 254) {
    invalid(operationId, 'email');
  }
  const canonical = input.replace(/[A-Z]/gu, (character) => character.toLowerCase());
  if (canonical.trim() !== canonical || !EMAIL_PATTERN.test(canonical))
    invalid(operationId, 'email');
  return canonical;
}

export function assertAdminC2Uuid(operationId: AdminC2OperationId, value: string): string {
  if (!UUID_PATTERN.test(value)) invalid(operationId);
  return value;
}

export function assertAdminC2IdempotencyKey(
  operationId: AdminC2OperationId,
  value: string | undefined,
): string {
  if (value === undefined || !IDEMPOTENCY_PATTERN.test(value)) invalid(operationId);
  return value;
}

export function parsePagination(
  operationId: Extract<AdminC2OperationId, 'listAdminRecoveryCases' | 'listAdminUsers'>,
  cursor: unknown,
  limit: unknown,
): AdminPaginationInput {
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 512)
  ) {
    invalid(operationId, 'cursor');
  }
  const parsedLimit = limit === undefined ? 25 : typeof limit === 'string' ? Number(limit) : NaN;
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    invalid(operationId, 'limit');
  }
  return { ...(cursor === undefined ? {} : { cursor }), limit: parsedLimit };
}

function parseReason(
  operationId: AdminC2OperationId,
  record: Record<string, unknown>,
): AdminReasonInput {
  if (
    typeof record.operatorReason !== 'string' ||
    record.operatorReason.length < 3 ||
    record.operatorReason.length > 500 ||
    typeof record.reasonCode !== 'string' ||
    !REASON_CODES.has(record.reasonCode as AdminReasonCode)
  ) {
    invalid(operationId);
  }
  return {
    operatorReason: record.operatorReason,
    reasonCode: record.reasonCode as AdminReasonCode,
  };
}

export function parsePasswordResetRequest(value: unknown): AdminPasswordResetRequestInput {
  const operationId = 'requestAdminPasswordReset';
  const record = exactRecord(operationId, value, ['email']);
  const emailCanonical = canonicalAdminEmail(operationId, record.email);
  return { deliveryEmail: record.email as string, emailCanonical };
}

export function parsePasswordReset(value: unknown): AdminPasswordResetInput {
  const operationId = 'resetAdminPassword';
  const record = exactRecord(operationId, value, ['newPassword', 'resetCode']);
  if (
    typeof record.resetCode !== 'string' ||
    !/^[A-HJ-NP-Z2-9]{26,32}$/u.test(record.resetCode) ||
    typeof record.newPassword !== 'string' ||
    !PASSWORD_PATTERN.test(record.newPassword)
  ) {
    invalid(operationId);
  }
  return { newPassword: record.newPassword, resetCode: record.resetCode };
}

export function parseRecoveryCaseCreate(value: unknown): AdminRecoveryCaseCreateInput {
  const operationId = 'createAdminRecoveryCase';
  const record = exactRecord(operationId, value, [
    'operatorReason',
    'reasonCode',
    'subjectAdminUserId',
  ]);
  if (typeof record.subjectAdminUserId !== 'string') invalid(operationId);
  const reason = parseReason(operationId, record);
  if (!['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'].includes(reason.reasonCode)) invalid(operationId);
  return {
    ...reason,
    subjectAdminUserId: assertAdminC2Uuid(operationId, record.subjectAdminUserId),
  };
}

export function parseReasonOnly(
  operationId: 'approveAdminRecoveryCase',
  value: unknown,
): AdminReasonInput {
  const reason = parseReason(
    operationId,
    exactRecord(operationId, value, ['operatorReason', 'reasonCode']),
  );
  if (!['ACCOUNT_RECOVERY', 'SECURITY_RESPONSE'].includes(reason.reasonCode)) invalid(operationId);
  return reason;
}

export function parseInvitationCreate(value: unknown): AdminInvitationCreateInput {
  const operationId = 'createAdminInvitation';
  const record = exactRecord(operationId, value, ['email', 'operatorReason', 'reasonCode', 'role']);
  if (typeof record.role !== 'string' || !ROLES.has(record.role as AdminRole)) invalid(operationId);
  const reason = parseReason(operationId, record);
  if (reason.reasonCode !== 'INVITATION_ADMINISTRATION') invalid(operationId);
  const emailCanonical = canonicalAdminEmail(operationId, record.email);
  return {
    ...reason,
    deliveryEmail: record.email as string,
    emailCanonical,
    role: record.role as AdminRole,
  };
}

export function parseInvitationAccept(value: unknown): AdminInvitationAcceptInput {
  const operationId = 'acceptAdminInvitation';
  const record = exactRecord(operationId, value, ['invitationCode', 'password']);
  if (
    typeof record.invitationCode !== 'string' ||
    !NON_AMBIGUOUS_SECRET_PATTERN.test(record.invitationCode) ||
    typeof record.password !== 'string' ||
    !PASSWORD_PATTERN.test(record.password)
  ) {
    invalid(operationId);
  }
  return { invitationCode: record.invitationCode, password: record.password };
}

export function parseRoleChange(value: unknown): AdminRoleChangeInput {
  const operationId = 'changeAdminUserRole';
  const record = exactRecord(operationId, value, ['operatorReason', 'reasonCode', 'role']);
  if (typeof record.role !== 'string' || !ROLES.has(record.role as AdminRole)) invalid(operationId);
  const reason = parseReason(operationId, record);
  if (reason.reasonCode !== 'ROLE_ADMINISTRATION') invalid(operationId);
  return { ...reason, role: record.role as AdminRole };
}

export function parseStatusChange(value: unknown): AdminStatusChangeInput {
  const operationId = 'changeAdminUserStatus';
  const record = exactRecord(operationId, value, ['operatorReason', 'reasonCode', 'status']);
  if (typeof record.status !== 'string' || !MUTABLE_STATUSES.has(record.status as AdminStatus)) {
    invalid(operationId);
  }
  const reason = parseReason(operationId, record);
  if (!['STATUS_ADMINISTRATION', 'SECURITY_RESPONSE'].includes(reason.reasonCode)) {
    invalid(operationId);
  }
  return {
    ...reason,
    status: record.status as AdminStatusChangeInput['status'],
  };
}

export function bearerToken(
  operationId: AdminC2OperationId,
  authorization: string | undefined,
): string {
  if (authorization === undefined || !/^Bearer [A-Za-z0-9._-]{32,4096}$/u.test(authorization)) {
    throw new AdminC2HttpError(operationId, 'AUTH_REQUIRED', 'RECORD_SECURITY_EVENT');
  }
  return authorization.slice('Bearer '.length);
}
