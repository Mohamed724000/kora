import { HttpStatus } from '@nestjs/common';

export type AdminC2OperationId =
  | 'requestAdminPasswordReset'
  | 'resetAdminPassword'
  | 'createAdminRecoveryCase'
  | 'listAdminRecoveryCases'
  | 'getAdminRecoveryCase'
  | 'approveAdminRecoveryCase'
  | 'createAdminInvitation'
  | 'acceptAdminInvitation'
  | 'listAdminUsers'
  | 'changeAdminUserRole'
  | 'changeAdminUserStatus'
  | 'listAdminAuditLogs'
  | 'createAdminAuditLogExport'
  | 'getAdminAuditLogExport'
  | 'downloadAdminAuditLogExport';

export type AdminC2ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'ADMIN_RECOVERY_INVALID'
  | 'ADMIN_INVITATION_INVALID'
  | 'ADMIN_USER_NOT_FOUND'
  | 'RECOVERY_CASE_NOT_FOUND'
  | 'RECOVERY_CASE_CONFLICT'
  | 'RECOVERY_CASE_EXPIRED'
  | 'LAST_SUPER_ADMIN_PROTECTED'
  | 'AUDIT_EXPORT_NOT_FOUND'
  | 'AUDIT_EXPORT_NOT_READY'
  | 'AUDIT_EXPORT_EXPIRED';

export type AdminC2FailureDisposition =
  | 'RECORD_SECURITY_EVENT'
  | 'ALREADY_DURABLE'
  | 'NONE_AFTER_PROOF'
  | 'COMMIT_UNKNOWN_NO_SECOND_SINK';

export interface AdminC2FailureAuditContext {
  readonly action: AdminC2OperationId;
  readonly actorAdminUserId?: string;
  readonly adminSessionId?: string;
  readonly entityId?: string;
  readonly entityType?: string;
  readonly failureCode?: string;
  readonly operatorReason?: string;
  readonly reasonCode?: string;
  readonly subjectAdminUserId?: string;
  readonly subjectRefHash?: string;
}

const STATUS: Readonly<Record<AdminC2ErrorCode, number>> = Object.freeze({
  AUDIT_EXPORT_EXPIRED: HttpStatus.GONE,
  AUDIT_EXPORT_NOT_FOUND: HttpStatus.NOT_FOUND,
  AUDIT_EXPORT_NOT_READY: HttpStatus.CONFLICT,
  ADMIN_INVITATION_INVALID: HttpStatus.BAD_REQUEST,
  ADMIN_RECOVERY_INVALID: HttpStatus.BAD_REQUEST,
  ADMIN_USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  AUTH_REQUIRED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  LAST_SUPER_ADMIN_PROTECTED: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  RECOVERY_CASE_CONFLICT: HttpStatus.CONFLICT,
  RECOVERY_CASE_EXPIRED: HttpStatus.GONE,
  RECOVERY_CASE_NOT_FOUND: HttpStatus.NOT_FOUND,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
});

const MESSAGE: Readonly<Record<AdminC2ErrorCode, string>> = Object.freeze({
  AUDIT_EXPORT_EXPIRED: "L'export d'audit a expiré.",
  AUDIT_EXPORT_NOT_FOUND: "Export d'audit introuvable.",
  AUDIT_EXPORT_NOT_READY: "L'export d'audit n'est pas prêt.",
  ADMIN_INVITATION_INVALID: 'Invitation administrateur invalide.',
  ADMIN_RECOVERY_INVALID: 'Récupération administrateur invalide.',
  ADMIN_USER_NOT_FOUND: 'Administrateur introuvable.',
  AUTH_REQUIRED: 'Authentification requise.',
  FORBIDDEN: 'Accès refusé.',
  IDEMPOTENCY_CONFLICT: 'Conflit de requête idempotente.',
  LAST_SUPER_ADMIN_PROTECTED: 'Le dernier super-administrateur actif est protégé.',
  RATE_LIMITED: 'Trop de requêtes.',
  RECOVERY_CASE_CONFLICT: 'Conflit de dossier de récupération.',
  RECOVERY_CASE_EXPIRED: 'Dossier de récupération expiré.',
  RECOVERY_CASE_NOT_FOUND: 'Dossier de récupération introuvable.',
  SERVICE_UNAVAILABLE: 'Service temporairement indisponible.',
  VALIDATION_ERROR: 'Requête invalide.',
});

export class AdminC2HttpError extends Error {
  readonly auditRecorded: boolean;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable = false;
  readonly status: number;

  constructor(
    readonly operationId: AdminC2OperationId,
    readonly code: AdminC2ErrorCode,
    readonly disposition: AdminC2FailureDisposition,
    options: {
      auditContext?: AdminC2FailureAuditContext;
      auditRecorded?: boolean;
      details?: Readonly<Record<string, unknown>>;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(MESSAGE[code]);
    this.name = 'AdminC2HttpError';
    this.status = STATUS[code];
    this.auditContext = options.auditContext;
    this.auditRecorded = options.auditRecorded ?? disposition === 'ALREADY_DURABLE';
    this.details = options.details ?? {};
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  readonly auditContext: AdminC2FailureAuditContext | undefined;
  readonly retryAfterSeconds: number | undefined;
}

export function c2ServiceUnavailable(
  operationId: AdminC2OperationId,
  disposition: AdminC2FailureDisposition,
  auditContext?: AdminC2FailureAuditContext,
): AdminC2HttpError {
  return new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', disposition, {
    ...(auditContext === undefined ? {} : { auditContext }),
  });
}
