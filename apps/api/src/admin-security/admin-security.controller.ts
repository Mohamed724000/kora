import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_PREAUTH_COOKIE,
  ADMIN_REQUEST_POLICY,
  AdminRequestPolicyError,
  serializeAdminCookie,
  type AdminRequestHeaders,
  type AdminRequestPolicy,
} from '../admin-auth/admin-request-policy';
import type { RequestWithId } from '../observability/http-logger';
import { AdminC2HttpError, type AdminC2OperationId } from './admin-security.errors';
import { AdminSecurityService } from './admin-security.service';
import {
  assertAdminC2IdempotencyKey,
  assertAdminC2Uuid,
  parseInvitationAccept,
  parseInvitationCreate,
  parsePagination,
  parsePasswordReset,
  parsePasswordResetRequest,
  parseReasonOnly,
  parseRecoveryCaseCreate,
  parseRoleChange,
  parseStatusChange,
} from './admin-security.types';

type HeadersMap = Readonly<Record<string, string | readonly string[] | undefined>>;

function oneHeader(headers: HeadersMap, name: string): string | undefined {
  const entries = Object.entries(headers).filter(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  if (entries.length !== 1) return undefined;
  return typeof entries[0]![1] === 'string' ? entries[0]![1] : undefined;
}

function execution(request: RequestWithId): { ipAddress: string; requestId: string } {
  return {
    ipAddress: request.socket.remoteAddress ?? 'unavailable',
    requestId: request.id ?? 'unavailable',
  };
}

function mapPolicyError(operationId: AdminC2OperationId, error: unknown): never {
  if (error instanceof AdminRequestPolicyError) {
    const code =
      error.reason === 'SERVICE_UNAVAILABLE'
        ? 'SERVICE_UNAVAILABLE'
        : error.reason === 'VALIDATION_ERROR'
          ? 'VALIDATION_ERROR'
          : error.reason === 'AUTH_REQUIRED'
            ? 'AUTH_REQUIRED'
            : 'FORBIDDEN';
    throw new AdminC2HttpError(operationId, code, 'RECORD_SECURITY_EVENT');
  }
  throw error;
}

@Controller('admin')
export class AdminSecurityController {
  constructor(
    @Inject(AdminSecurityService) private readonly service: AdminSecurityService,
    @Inject(ADMIN_REQUEST_POLICY) private readonly policy: AdminRequestPolicy,
  ) {}

  @Post('auth/password/reset-requests')
  @HttpCode(202)
  async requestPasswordReset(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<unknown> {
    try {
      this.policy.assertLoginRequest(headers as AdminRequestHeaders);
      await this.service.requestPasswordReset(parsePasswordResetRequest(body), execution(request));
      return { data: { accepted: true }, meta: { requestId: request.id } };
    } catch (error: unknown) {
      mapPolicyError('requestAdminPasswordReset', error);
    }
  }

  @Post('auth/password/reset')
  @HttpCode(204)
  async resetPassword(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<void> {
    try {
      this.policy.assertLoginRequest(headers as AdminRequestHeaders);
      await this.service.resetPassword(parsePasswordReset(body), execution(request));
    } catch (error: unknown) {
      mapPolicyError('resetAdminPassword', error);
    }
  }

  @Post('invitations')
  async createInvitation(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const result = await this.service.createInvitation(
        oneHeader(headers, 'authorization'),
        assertAdminC2IdempotencyKey('createAdminInvitation', oneHeader(headers, 'idempotency-key')),
        parseInvitationCreate(body),
        { requestId: request.id ?? 'unavailable' },
      );
      response.statusCode = 201;
      response.setHeader('Location', `/api/v1/admin/invitations/${result.invitationId}`);
      return { data: result, meta: { requestId: request.id } };
    } catch (error: unknown) {
      mapPolicyError('createAdminInvitation', error);
    }
  }

  @Post('auth/invitations/accept')
  @HttpCode(200)
  async acceptInvitation(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertLoginRequest(headers as AdminRequestHeaders);
      const result = await this.service.acceptInvitation(
        parseInvitationAccept(body),
        execution(request),
      );
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Set-Cookie', [
        serializeAdminCookie(ADMIN_PREAUTH_COOKIE, result.preAuthToken, 600),
        serializeAdminCookie(ADMIN_CSRF_COOKIE, result.csrfToken, 600),
      ]);
      return {
        data: {
          challengeId: result.challengeId,
          expiresAt: result.expiresAt,
          nextStep: result.nextStep,
        },
        meta: { requestId: request.id },
      };
    } catch (error: unknown) {
      mapPolicyError('acceptAdminInvitation', error);
    }
  }

  @Get('recovery-cases')
  async listRecoveryCases(
    @Headers() headers: HeadersMap,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<unknown> {
    const result = await this.service.listRecoveryCases(
      oneHeader(headers, 'authorization'),
      parsePagination('listAdminRecoveryCases', cursor, limit),
    );
    return { data: result.data, meta: { ...result.meta, requestId: request.id } };
  }

  @Post('recovery-cases')
  async createRecoveryCase(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const result = await this.service.createRecoveryCase(
        oneHeader(headers, 'authorization'),
        assertAdminC2IdempotencyKey(
          'createAdminRecoveryCase',
          oneHeader(headers, 'idempotency-key'),
        ),
        parseRecoveryCaseCreate(body),
        { requestId: request.id ?? 'unavailable' },
      );
      response.statusCode = 201;
      response.setHeader('Location', `/api/v1/admin/recovery-cases/${result.caseId}`);
      return { data: result, meta: { requestId: request.id } };
    } catch (error: unknown) {
      mapPolicyError('createAdminRecoveryCase', error);
    }
  }

  @Get('recovery-cases/:caseId')
  async getRecoveryCase(
    @Param('caseId') caseId: string,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<unknown> {
    const result = await this.service.getRecoveryCase(
      oneHeader(headers, 'authorization'),
      assertAdminC2Uuid('getAdminRecoveryCase', caseId),
    );
    return { data: result, meta: { requestId: request.id } };
  }

  @Post('recovery-cases/:caseId/approve')
  @HttpCode(204)
  async approveRecoveryCase(
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<void> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      await this.service.approveRecoveryCase(
        oneHeader(headers, 'authorization'),
        assertAdminC2IdempotencyKey(
          'approveAdminRecoveryCase',
          oneHeader(headers, 'idempotency-key'),
        ),
        assertAdminC2Uuid('approveAdminRecoveryCase', caseId),
        parseReasonOnly('approveAdminRecoveryCase', body),
        { requestId: request.id ?? 'unavailable' },
      );
    } catch (error: unknown) {
      mapPolicyError('approveAdminRecoveryCase', error);
    }
  }

  @Get('users')
  async listUsers(
    @Headers() headers: HeadersMap,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
    @Req() request: RequestWithId,
  ): Promise<unknown> {
    const result = await this.service.listUsers(
      oneHeader(headers, 'authorization'),
      parsePagination('listAdminUsers', cursor, limit),
    );
    return { data: result.data, meta: { ...result.meta, requestId: request.id } };
  }

  @Post('users/:adminUserId/role-changes')
  @HttpCode(204)
  async changeUserRole(
    @Param('adminUserId') adminUserId: string,
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<void> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      await this.service.changeUserRole(
        oneHeader(headers, 'authorization'),
        assertAdminC2IdempotencyKey('changeAdminUserRole', oneHeader(headers, 'idempotency-key')),
        assertAdminC2Uuid('changeAdminUserRole', adminUserId),
        parseRoleChange(body),
        { requestId: request.id ?? 'unavailable' },
      );
    } catch (error: unknown) {
      mapPolicyError('changeAdminUserRole', error);
    }
  }

  @Post('users/:adminUserId/status-changes')
  @HttpCode(204)
  async changeUserStatus(
    @Param('adminUserId') adminUserId: string,
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<void> {
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      await this.service.changeUserStatus(
        oneHeader(headers, 'authorization'),
        assertAdminC2IdempotencyKey('changeAdminUserStatus', oneHeader(headers, 'idempotency-key')),
        assertAdminC2Uuid('changeAdminUserStatus', adminUserId),
        parseStatusChange(body),
        { requestId: request.id ?? 'unavailable' },
      );
    } catch (error: unknown) {
      mapPolicyError('changeAdminUserStatus', error);
    }
  }
}
