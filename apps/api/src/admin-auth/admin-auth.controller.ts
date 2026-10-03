import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import type { RequestWithId } from '../observability/http-logger';
import {
  AdminAuthService,
  assertAdminUuid,
  assertIdempotencyKey,
  parseAdminLogin,
  parseAdminRecovery,
  parseAdminStepUp,
  parseAdminTotp,
} from './admin-auth.service';
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_PREAUTH_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_REQUEST_POLICY,
  AdminRequestPolicyError,
  serializeAdminCookie,
  type AdminRequestHeaders,
} from './admin-request-policy';
import type { AdminRequestPolicy } from './admin-request-policy';
import type { AdminReasonCode } from './admin-auth.repository';
import {
  AdminC1HttpError,
  AdminSessionService,
  type SessionDelivery,
} from './admin-session.service';

type HeadersMap = Readonly<Record<string, string | readonly string[] | undefined>>;

function oneHeader(headers: HeadersMap, name: string): string | undefined {
  const matches = Object.entries(headers).filter(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  if (matches.length !== 1) return undefined;
  const value = matches[0]![1];
  return typeof value === 'string' ? value : undefined;
}

function execution(request: RequestWithId): { ipAddress: string; requestId: string } {
  return {
    ipAddress: request.socket.remoteAddress ?? 'unavailable',
    requestId: request.id ?? 'unavailable',
  };
}

function mapPolicyError(
  error: unknown,
  forbiddenAs:
    'AUTH_REFRESH_INVALID' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'VALIDATION_ERROR' = 'FORBIDDEN',
  validationAsForbidden = false,
): never {
  if (
    validationAsForbidden &&
    error instanceof AdminC1HttpError &&
    error.code === 'VALIDATION_ERROR'
  )
    throw new AdminC1HttpError(403, 'FORBIDDEN');
  if (error instanceof AdminRequestPolicyError) {
    if (error.reason === 'SERVICE_UNAVAILABLE')
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    if (error.reason === 'VALIDATION_ERROR') throw new AdminC1HttpError(400, error.reason);
    if (error.reason === 'FORBIDDEN') {
      const status =
        forbiddenAs === 'VALIDATION_ERROR' ? 400 : forbiddenAs === 'FORBIDDEN' ? 403 : 401;
      throw new AdminC1HttpError(status, forbiddenAs);
    }
    if (forbiddenAs === 'AUTH_REFRESH_INVALID')
      throw new AdminC1HttpError(401, 'AUTH_REFRESH_INVALID');
    throw new AdminC1HttpError(401, error.reason);
  }
  throw error;
}

function sensitiveHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function setContextCookies(
  response: ServerResponse,
  contextName: typeof ADMIN_PREAUTH_COOKIE | typeof ADMIN_REFRESH_COOKIE,
  contextToken: string,
  csrfToken: string,
  maxAge: number,
): void {
  response.setHeader('Set-Cookie', [
    serializeAdminCookie(contextName, contextToken, maxAge),
    serializeAdminCookie(ADMIN_CSRF_COOKIE, csrfToken, maxAge),
  ]);
}

function sessionData(
  delivery: SessionDelivery,
): Omit<SessionDelivery, 'csrfToken' | 'refreshToken'> {
  return {
    absoluteExpiresAt: delivery.absoluteExpiresAt,
    accessExpiresAt: delivery.accessExpiresAt,
    accessToken: delivery.accessToken,
    authorizationVersion: delivery.authorizationVersion,
    idleExpiresAt: delivery.idleExpiresAt,
    role: delivery.role,
    sessionId: delivery.sessionId,
  };
}

export function parseReason(value: unknown): {
  operatorReason: string;
  reasonCode: AdminReasonCode;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  }
  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, 'operatorReason'))
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR', {
      details: { field: 'operatorReason', reason: 'REQUIRED' },
    });
  const reasonCodes = new Set<AdminReasonCode>([
    'SECURITY_RESPONSE',
    'ACCOUNT_RECOVERY',
    'ROLE_ADMINISTRATION',
    'STATUS_ADMINISTRATION',
    'AUDIT_EXPORT',
    'INVITATION_ADMINISTRATION',
  ]);
  if (
    JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify(['operatorReason', 'reasonCode']) ||
    typeof record.operatorReason !== 'string' ||
    record.operatorReason.length < 3 ||
    record.operatorReason.length > 500 ||
    typeof record.reasonCode !== 'string' ||
    !reasonCodes.has(record.reasonCode as AdminReasonCode)
  )
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  return {
    operatorReason: record.operatorReason,
    reasonCode: record.reasonCode as AdminReasonCode,
  };
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(AdminSessionService) private readonly sessions: AdminSessionService,
    @Inject(ADMIN_REQUEST_POLICY) private readonly policy: AdminRequestPolicy,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertLoginRequest(headers as AdminRequestHeaders);
      const result = await this.auth.login(parseAdminLogin(body), execution(request));
      setContextCookies(response, ADMIN_PREAUTH_COOKIE, result.preAuthToken, result.csrfToken, 600);
      sensitiveHeaders(response);
      return {
        data: {
          challengeId: result.challengeId,
          expiresAt: result.expiresAt,
          nextStep: result.nextStep,
        },
        meta: { requestId: request.id },
      };
    } catch (error) {
      mapPolicyError(error, 'VALIDATION_ERROR');
    }
  }

  @Post('totp/enrollments')
  async createEnrollment(
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, false);
      const browser = await this.policy.validateBrowserContext(
        headers as AdminRequestHeaders,
        'PREAUTH',
      );
      const result = await this.auth.createEnrollment(
        browser.contextToken,
        assertIdempotencyKey(oneHeader(headers, 'idempotency-key')),
        request.id,
      );
      sensitiveHeaders(response);
      response.statusCode = 201;
      return { data: result, meta: { requestId: request.id } };
    } catch (error) {
      mapPolicyError(error);
    }
  }

  @Post('totp/enrollments/:enrollmentId/qr')
  @HttpCode(200)
  async qr(
    @Param('enrollmentId') enrollmentId: string,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<StreamableFile> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, false);
      const browser = await this.policy.validateBrowserContext(
        headers as AdminRequestHeaders,
        'PREAUTH',
      );
      const png = await this.auth.deliverQr(
        browser.contextToken,
        assertAdminUuid(enrollmentId),
        assertIdempotencyKey(oneHeader(headers, 'idempotency-key')),
        request.id,
      );
      response.setHeader('Content-Type', 'image/png');
      sensitiveHeaders(response);
      return new StreamableFile(png);
    } catch (error) {
      mapPolicyError(error, 'FORBIDDEN', true);
    }
  }

  @Post('totp/enrollments/:enrollmentId/confirm')
  @HttpCode(200)
  async confirm(
    @Param('enrollmentId') enrollmentId: string,
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const browser = await this.policy.validateBrowserContext(
        headers as AdminRequestHeaders,
        'PREAUTH',
      );
      const result = await this.auth.confirmEnrollment(
        browser.contextToken,
        assertAdminUuid(enrollmentId),
        parseAdminTotp(body).code,
        assertIdempotencyKey(oneHeader(headers, 'idempotency-key')),
        execution(request),
      );
      setContextCookies(
        response,
        ADMIN_REFRESH_COOKIE,
        result.session.refreshToken,
        result.session.csrfToken,
        43_200,
      );
      sensitiveHeaders(response);
      return {
        data: { recoveryCodes: { codes: result.codes }, session: sessionData(result.session) },
        meta: { requestId: request.id },
      };
    } catch (error) {
      mapPolicyError(error);
    }
  }

  @Post('totp/verify')
  @HttpCode(200)
  async verifyTotp(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const browser = await this.policy.validateBrowserContext(
        headers as AdminRequestHeaders,
        'PREAUTH',
      );
      const delivery = await this.auth.verifyTotp(
        browser.contextToken,
        parseAdminTotp(body).code,
        execution(request),
      );
      setContextCookies(
        response,
        ADMIN_REFRESH_COOKIE,
        delivery.refreshToken,
        delivery.csrfToken,
        43_200,
      );
      sensitiveHeaders(response);
      return { data: sessionData(delivery), meta: { requestId: request.id } };
    } catch (error) {
      mapPolicyError(error, 'AUTH_REQUIRED');
    }
  }

  @Post('recovery-codes/verify')
  @HttpCode(200)
  async verifyRecovery(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const browser = await this.policy.validateBrowserContext(
        headers as AdminRequestHeaders,
        'PREAUTH',
      );
      const result = await this.auth.verifyRecoveryCode(
        browser.contextToken,
        parseAdminRecovery(body),
        execution(request),
      );
      setContextCookies(response, ADMIN_PREAUTH_COOKIE, result.preAuthToken, result.csrfToken, 600);
      sensitiveHeaders(response);
      return {
        data: {
          expiresAt: result.expiresAt,
          nextStep: result.nextStep,
          recoveryContextId: result.recoveryContextId,
        },
        meta: { requestId: request.id },
      };
    } catch (error) {
      mapPolicyError(error, 'AUTH_REQUIRED');
    }
  }

  @Post('recovery-codes/rotate')
  @HttpCode(200)
  async rotate(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const totp = parseAdminTotp(body);
      const idempotencyKey = assertIdempotencyKey(oneHeader(headers, 'idempotency-key'));
      const principal = await this.sessions.authenticate(
        oneHeader(headers, 'authorization'),
        new Date(),
        false,
      );
      const codes = await this.auth.rotateRecoveryCodes(
        principal,
        totp.code,
        idempotencyKey,
        execution(request),
      );
      sensitiveHeaders(response);
      return { data: { codes }, meta: { requestId: request.id } };
    } catch (error) {
      mapPolicyError(error);
    }
  }

  @Post('step-up')
  @HttpCode(200)
  async stepUp(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const stepUp = parseAdminStepUp(body);
      const principal = await this.sessions.authenticate(
        oneHeader(headers, 'authorization'),
        new Date(),
        false,
      );
      const data = await this.auth.stepUp(principal, stepUp, execution(request));
      sensitiveHeaders(response);
      return { data, meta: { requestId: request.id } };
    } catch (error) {
      mapPolicyError(error);
    }
  }

  @Post('sessions/refresh')
  @HttpCode(200)
  async refresh(
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, false);
      const browser = await this.policy.validateBrowserContext(
        headers as AdminRequestHeaders,
        'REFRESH',
      );
      const delivery = await this.sessions.refresh(
        browser.contextToken,
        request.id,
        execution(request).ipAddress,
      );
      setContextCookies(
        response,
        ADMIN_REFRESH_COOKIE,
        delivery.refreshToken,
        delivery.csrfToken,
        43_200,
      );
      sensitiveHeaders(response);
      return { data: sessionData(delivery), meta: { requestId: request.id } };
    } catch (error) {
      mapPolicyError(error, 'AUTH_REFRESH_INVALID');
    }
  }

  @Delete('sessions/current')
  @HttpCode(204)
  async revokeCurrent(
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<void> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, false);
      const principal = await this.sessions.authenticate(
        oneHeader(headers, 'authorization'),
        new Date(),
        false,
      );
      await this.sessions.revokeCurrent(principal, request.id);
    } catch (error) {
      mapPolicyError(error, 'AUTH_REQUIRED');
    }
  }

  @Get('sessions')
  async list(@Headers() headers: HeadersMap): Promise<unknown> {
    const principal = await this.sessions.authenticate(oneHeader(headers, 'authorization'));
    return {
      data: await this.sessions.list(principal),
      meta: { hasMore: false, nextCursor: null },
    };
  }

  @Post('sessions/:sessionId/revocations')
  @HttpCode(204)
  async revokeOther(
    @Param('sessionId') sessionId: string,
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<void> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const targetSessionId = assertAdminUuid(sessionId);
      const reason = parseReason(body);
      const principal = await this.sessions.authenticate(
        oneHeader(headers, 'authorization'),
        new Date(),
        false,
      );
      await this.sessions.revokeOther(principal, targetSessionId, reason, request.id);
    } catch (error) {
      mapPolicyError(error);
    }
  }
}
