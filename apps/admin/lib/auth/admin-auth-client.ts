import type {
  AdminAccepted,
  AdminAccessSession,
  AdminEnrollmentConfirmation,
  AdminPreAuth,
  AdminRecoveryCode,
  AdminRecoveryCodes,
  AdminRecoveryContext,
  AdminSessionSummary,
} from '@kora-plus/contracts';

import {
  AdminAuthRequestError,
  adminAuthErrorFromResponse,
  type AdminAuthWireErrorCode,
  unknownAdminAuthMutationError,
} from './admin-auth-errors';
import { browserAdminCsrfToken } from './csrf';

const ROOT = '/api/v1/admin/auth';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type RequestSpec = {
  accessToken?: string;
  body?: unknown;
  csrf?: boolean;
  idempotencyKey?: string;
  method: 'DELETE' | 'GET' | 'POST';
  operationId: ClientOperationId;
  path: string;
  uncertainMutation?: boolean;
};

type ClientOperationId =
  | 'acceptAdminInvitation'
  | 'confirmAdminTotpEnrollment'
  | 'createAdminTotpEnrollment'
  | 'deliverAdminTotpEnrollmentQr'
  | 'listAdminSessions'
  | 'loginAdmin'
  | 'refreshAdminSession'
  | 'requestAdminPasswordReset'
  | 'resetAdminPassword'
  | 'revokeCurrentAdminSession'
  | 'rotateAdminRecoveryCodes'
  | 'verifyAdminRecoveryCode'
  | 'verifyAdminTotp';

type ErrorStatusMatrix = Readonly<Partial<Record<number, ReadonlySet<AdminAuthWireErrorCode>>>>;

const codes = (...values: AdminAuthWireErrorCode[]): ReadonlySet<AdminAuthWireErrorCode> =>
  new Set(values);

const OPERATION_ERRORS: Readonly<Record<ClientOperationId, ErrorStatusMatrix>> = {
  acceptAdminInvitation: {
    400: codes('ADMIN_INVITATION_INVALID', 'VALIDATION_ERROR'),
    403: codes('FORBIDDEN'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  confirmAdminTotpEnrollment: {
    400: codes('OTP_INVALID', 'VALIDATION_ERROR'),
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    409: codes('IDEMPOTENCY_CONFLICT'),
    410: codes('OTP_EXPIRED'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  createAdminTotpEnrollment: {
    400: codes('VALIDATION_ERROR'),
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    409: codes('IDEMPOTENCY_CONFLICT'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  deliverAdminTotpEnrollmentQr: {
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    409: codes('SENSITIVE_RESPONSE_ALREADY_DELIVERED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  listAdminSessions: {
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  loginAdmin: {
    400: codes('VALIDATION_ERROR'),
    401: codes('AUTH_INVALID_CREDENTIALS'),
    403: codes('FORBIDDEN'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  refreshAdminSession: {
    401: codes('AUTH_REFRESH_INVALID'),
    403: codes('FORBIDDEN'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  requestAdminPasswordReset: {
    400: codes('VALIDATION_ERROR'),
    403: codes('FORBIDDEN'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  resetAdminPassword: {
    400: codes('ADMIN_RECOVERY_INVALID', 'VALIDATION_ERROR'),
    403: codes('FORBIDDEN'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  revokeCurrentAdminSession: {
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  rotateAdminRecoveryCodes: {
    400: codes('OTP_INVALID', 'VALIDATION_ERROR'),
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    409: codes('IDEMPOTENCY_CONFLICT'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  verifyAdminRecoveryCode: {
    400: codes('ADMIN_RECOVERY_CODE_INVALID', 'VALIDATION_ERROR'),
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
  verifyAdminTotp: {
    400: codes('OTP_INVALID', 'VALIDATION_ERROR'),
    401: codes('AUTH_REQUIRED'),
    403: codes('FORBIDDEN'),
    410: codes('OTP_EXPIRED'),
    429: codes('RATE_LIMITED'),
    503: codes('SERVICE_UNAVAILABLE'),
  },
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function string(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function timestamp(value: unknown): value is string {
  return (
    string(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function preAuth(value: unknown): value is AdminPreAuth {
  return (
    record(value) &&
    exactKeys(value, ['challengeId', 'expiresAt', 'nextStep']) &&
    string(value.challengeId) &&
    UUID.test(value.challengeId) &&
    timestamp(value.expiresAt) &&
    (value.nextStep === 'TOTP_VERIFY' ||
      value.nextStep === 'FIRST_TOTP_ENROLLMENT' ||
      value.nextStep === 'MFA_RECOVERY_TOTP_ENROLLMENT')
  );
}

function session(value: unknown): value is AdminAccessSession {
  return (
    record(value) &&
    exactKeys(value, [
      'absoluteExpiresAt',
      'accessExpiresAt',
      'accessToken',
      'authorizationVersion',
      'idleExpiresAt',
      'role',
      'sessionId',
    ]) &&
    string(value.sessionId) &&
    UUID.test(value.sessionId) &&
    string(value.accessToken) &&
    value.accessToken.length >= 32 &&
    value.accessToken.length <= 4096 &&
    timestamp(value.accessExpiresAt) &&
    timestamp(value.idleExpiresAt) &&
    timestamp(value.absoluteExpiresAt) &&
    integer(value.authorizationVersion) &&
    value.authorizationVersion >= 1 &&
    (value.role === 'SUPER_ADMIN' ||
      value.role === 'CONTENT_EDITOR' ||
      value.role === 'FINANCE_MANAGER' ||
      value.role === 'SUPPORT')
  );
}

function recoveryCode(value: unknown): value is AdminRecoveryCode {
  return (
    record(value) &&
    exactKeys(value, ['selector', 'verifier']) &&
    string(value.selector) &&
    /^[A-HJ-NP-Z2-9]{8,16}$/u.test(value.selector) &&
    string(value.verifier) &&
    /^[A-HJ-NP-Z2-9]{26,32}$/u.test(value.verifier)
  );
}

function recoveryCodes(value: unknown): value is AdminRecoveryCodes {
  return (
    record(value) &&
    exactKeys(value, ['codes']) &&
    Array.isArray(value.codes) &&
    value.codes.length === 10 &&
    value.codes.every(recoveryCode) &&
    new Set(value.codes.map((code) => `${String(code.selector)}:${String(code.verifier)}`)).size ===
      10
  );
}

function enrollmentConfirmation(value: unknown): value is AdminEnrollmentConfirmation {
  return (
    record(value) &&
    exactKeys(value, ['recoveryCodes', 'session']) &&
    session(value.session) &&
    recoveryCodes(value.recoveryCodes)
  );
}

function recoveryContext(value: unknown): value is AdminRecoveryContext {
  return (
    record(value) &&
    exactKeys(value, ['expiresAt', 'nextStep', 'recoveryContextId']) &&
    string(value.recoveryContextId) &&
    UUID.test(value.recoveryContextId) &&
    timestamp(value.expiresAt) &&
    value.nextStep === 'ENROLL_TOTP'
  );
}

function sessionSummary(value: unknown): value is AdminSessionSummary {
  return (
    record(value) &&
    exactKeys(value, [
      'absoluteExpiresAt',
      'createdAt',
      'current',
      'idleExpiresAt',
      'lastSeenAt',
      'sessionId',
    ]) &&
    string(value.sessionId) &&
    UUID.test(value.sessionId) &&
    timestamp(value.createdAt) &&
    timestamp(value.lastSeenAt) &&
    timestamp(value.idleExpiresAt) &&
    timestamp(value.absoluteExpiresAt) &&
    typeof value.current === 'boolean'
  );
}

function envelopeData(value: unknown): unknown {
  if (
    !record(value) ||
    !exactKeys(value, ['data', 'meta']) ||
    !record(value.meta) ||
    !exactKeys(value.meta, ['requestId']) ||
    !string(value.meta.requestId) ||
    value.meta.requestId.length < 8 ||
    value.meta.requestId.length > 128 ||
    !('data' in value)
  ) {
    throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
  }
  return value.data;
}

export function validAdminPasswordLength(password: string): boolean {
  const codePoints = [...password].length;
  return codePoints >= 12 && codePoints <= 128;
}

async function jsonData<T>(
  response: Response,
  validate: (value: unknown) => value is T,
): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
  }
  const data = envelopeData(body);
  if (!validate(data)) {
    throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
  }
  return data;
}

function headers(spec: RequestSpec): Headers {
  const result = new Headers({ Accept: 'application/json' });
  if (spec.body !== undefined) result.set('Content-Type', 'application/json');
  if (spec.accessToken !== undefined) result.set('Authorization', `Bearer ${spec.accessToken}`);
  if (spec.csrf === true) result.set('X-Kora-CSRF', browserAdminCsrfToken());
  if (spec.idempotencyKey !== undefined) result.set('Idempotency-Key', spec.idempotencyKey);
  return result;
}

async function request(spec: RequestSpec): Promise<Response> {
  try {
    const init: RequestInit = {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: headers(spec),
      method: spec.method,
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    };
    if (spec.body !== undefined) init.body = JSON.stringify(spec.body);
    const response = await fetch(`${ROOT}${spec.path}`, init);
    if (!response.ok) {
      const error = await adminAuthErrorFromResponse(response, spec.uncertainMutation === true);
      if (error.outcome === 'UNKNOWN') throw error;
      const allowed =
        error.wireCode !== undefined &&
        OPERATION_ERRORS[spec.operationId][response.status]?.has(error.wireCode) === true;
      if (!allowed) {
        throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
      }
      throw error;
    }
    return response;
  } catch (error: unknown) {
    if (error instanceof AdminAuthRequestError) throw error;
    if (spec.uncertainMutation === true) throw unknownAdminAuthMutationError();
    throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
  }
}

export class AdminAuthClient {
  async login(email: string, password: string): Promise<AdminPreAuth> {
    const response = await request({
      body: { email, password },
      method: 'POST',
      operationId: 'loginAdmin',
      path: '/login',
      uncertainMutation: true,
    });
    return jsonData(response, preAuth);
  }

  async createEnrollment(
    idempotencyKey: string,
  ): Promise<{ enrollmentId: string; expiresAt: string }> {
    const response = await request({
      csrf: true,
      idempotencyKey,
      method: 'POST',
      operationId: 'createAdminTotpEnrollment',
      path: '/totp/enrollments',
      uncertainMutation: true,
    });
    return jsonData(
      response,
      (value): value is { enrollmentId: string; expiresAt: string } =>
        record(value) &&
        exactKeys(value, ['enrollmentId', 'expiresAt']) &&
        typeof value.enrollmentId === 'string' &&
        UUID.test(value.enrollmentId) &&
        timestamp(value.expiresAt),
    );
  }

  async deliverEnrollmentQr(enrollmentId: string, idempotencyKey: string): Promise<Blob> {
    if (!UUID.test(enrollmentId)) {
      throw new AdminAuthRequestError({ code: 'VALIDATION_ERROR', status: 400 });
    }
    const response = await request({
      csrf: true,
      idempotencyKey,
      method: 'POST',
      operationId: 'deliverAdminTotpEnrollmentQr',
      path: `/totp/enrollments/${enrollmentId}/qr`,
      uncertainMutation: true,
    });
    if (response.headers.get('content-type')?.toLowerCase() !== 'image/png') {
      throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    }
    return response.blob();
  }

  async confirmEnrollment(
    enrollmentId: string,
    code: string,
    idempotencyKey: string,
  ): Promise<AdminEnrollmentConfirmation> {
    if (!UUID.test(enrollmentId)) {
      throw new AdminAuthRequestError({ code: 'VALIDATION_ERROR', status: 400 });
    }
    const response = await request({
      body: { code },
      csrf: true,
      idempotencyKey,
      method: 'POST',
      operationId: 'confirmAdminTotpEnrollment',
      path: `/totp/enrollments/${enrollmentId}/confirm`,
      uncertainMutation: true,
    });
    return jsonData(response, enrollmentConfirmation);
  }

  async verifyTotp(code: string): Promise<AdminAccessSession> {
    const response = await request({
      body: { code },
      csrf: true,
      method: 'POST',
      operationId: 'verifyAdminTotp',
      path: '/totp/verify',
      uncertainMutation: true,
    });
    return jsonData(response, session);
  }

  async verifyRecoveryCode(selector: string, verifier: string): Promise<AdminRecoveryContext> {
    const response = await request({
      body: { selector, verifier },
      csrf: true,
      method: 'POST',
      operationId: 'verifyAdminRecoveryCode',
      path: '/recovery-codes/verify',
      uncertainMutation: true,
    });
    return jsonData(response, recoveryContext);
  }

  async rotateRecoveryCodes(
    accessToken: string,
    code: string,
    idempotencyKey: string,
  ): Promise<readonly AdminRecoveryCode[]> {
    const response = await request({
      accessToken,
      body: { code },
      idempotencyKey,
      method: 'POST',
      operationId: 'rotateAdminRecoveryCodes',
      path: '/recovery-codes/rotate',
      uncertainMutation: true,
    });
    return (await jsonData(response, recoveryCodes)).codes;
  }

  async refresh(): Promise<AdminAccessSession> {
    const response = await request({
      csrf: true,
      method: 'POST',
      operationId: 'refreshAdminSession',
      path: '/sessions/refresh',
      uncertainMutation: true,
    });
    return jsonData(response, session);
  }

  async revokeCurrent(accessToken: string): Promise<void> {
    const response = await request({
      accessToken,
      method: 'DELETE',
      operationId: 'revokeCurrentAdminSession',
      path: '/sessions/current',
      uncertainMutation: true,
    });
    if (response.status !== 204) {
      throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    }
  }

  async listSessions(accessToken: string): Promise<readonly AdminSessionSummary[]> {
    const response = await request({
      accessToken,
      method: 'GET',
      operationId: 'listAdminSessions',
      path: '/sessions',
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    }
    if (
      !record(body) ||
      !exactKeys(body, ['data', 'meta']) ||
      !Array.isArray(body.data) ||
      body.data.length > 50 ||
      !body.data.every(sessionSummary) ||
      !record(body.meta) ||
      !exactKeys(body.meta, ['hasMore', 'nextCursor']) ||
      body.meta.hasMore !== false ||
      body.meta.nextCursor !== null
    ) {
      throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    }
    return body.data;
  }

  async requestPasswordReset(email: string): Promise<AdminAccepted> {
    const response = await request({
      body: { email },
      method: 'POST',
      operationId: 'requestAdminPasswordReset',
      path: '/password/reset-requests',
      uncertainMutation: true,
    });
    return jsonData(
      response,
      (value): value is AdminAccepted =>
        record(value) && exactKeys(value, ['accepted']) && value.accepted === true,
    );
  }

  async resetPassword(resetCode: string, newPassword: string): Promise<void> {
    const response = await request({
      body: { newPassword, resetCode },
      method: 'POST',
      operationId: 'resetAdminPassword',
      path: '/password/reset',
      uncertainMutation: true,
    });
    if (response.status !== 204) {
      throw new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    }
  }

  async acceptInvitation(invitationCode: string, password: string): Promise<AdminPreAuth> {
    const response = await request({
      body: { invitationCode, password },
      method: 'POST',
      operationId: 'acceptAdminInvitation',
      path: '/invitations/accept',
      uncertainMutation: true,
    });
    return jsonData(response, preAuth);
  }
}
