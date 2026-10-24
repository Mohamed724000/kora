import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { once } from 'node:events';
import {
  ADMIN_REQUEST_POLICY,
  AdminRequestPolicyError,
  type AdminRequestHeaders,
  type AdminRequestPolicy,
} from '../admin-auth/admin-request-policy';
import type { RequestWithId } from '../observability/http-logger';
import { AdminAuditExportService } from './admin-audit-export.service';
import { AdminAuditQueryService } from './admin-audit.query.service';
import { parseAdminAuditExportCreate, parseAdminAuditListInput } from './admin-audit.types';
import { AdminC2HttpError, type AdminC2OperationId } from './admin-security.errors';
import { assertAdminC2IdempotencyKey, assertAdminC2Uuid } from './admin-security.types';

type HeadersMap = Readonly<Record<string, string | readonly string[] | undefined>>;

function oneHeader(headers: HeadersMap, name: string): string | undefined {
  const entries = Object.entries(headers).filter(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  if (entries.length !== 1) return undefined;
  return typeof entries[0]![1] === 'string' ? entries[0]![1] : undefined;
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
export class AdminAuditController {
  constructor(
    @Inject(AdminAuditQueryService) private readonly queryService: AdminAuditQueryService,
    @Inject(AdminAuditExportService) private readonly exportService: AdminAuditExportService,
    @Inject(ADMIN_REQUEST_POLICY) private readonly policy: AdminRequestPolicy,
  ) {}

  @Get('audit-logs')
  async list(
    @Headers() headers: HeadersMap,
    @Query() query: Readonly<Record<string, unknown>>,
    @Req() request: RequestWithId,
  ): Promise<unknown> {
    const result = await this.queryService.list(
      oneHeader(headers, 'authorization'),
      parseAdminAuditListInput(query),
      request.id ?? 'unavailable',
    );
    return { data: result.data, meta: { ...result.meta, requestId: request.id } };
  }

  @Post('audit-log-exports')
  async create(
    @Body() body: unknown,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<unknown> {
    const operationId = 'createAdminAuditLogExport';
    try {
      this.policy.assertMutationRequest(headers as AdminRequestHeaders, true);
      const result = await this.exportService.create(
        oneHeader(headers, 'authorization'),
        assertAdminC2IdempotencyKey(operationId, oneHeader(headers, 'idempotency-key')),
        parseAdminAuditExportCreate(body),
        request.id ?? 'unavailable',
      );
      response.statusCode = 202;
      response.setHeader('Location', `/api/v1/admin/audit-log-exports/${result.exportId}`);
      return { data: result, meta: { requestId: request.id } };
    } catch (error: unknown) {
      mapPolicyError(operationId, error);
    }
  }

  @Get('audit-log-exports/:exportId')
  async get(
    @Param('exportId') exportId: string,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
  ): Promise<unknown> {
    const result = await this.exportService.get(
      oneHeader(headers, 'authorization'),
      assertAdminC2Uuid('getAdminAuditLogExport', exportId),
      request.id ?? 'unavailable',
    );
    return { data: result, meta: { requestId: request.id } };
  }

  @Get('audit-log-exports/:exportId/content')
  async download(
    @Param('exportId') exportId: string,
    @Headers() headers: HeadersMap,
    @Req() request: RequestWithId,
    @Res() response: ServerResponse,
  ): Promise<void> {
    const delivery = await this.exportService.download(
      oneHeader(headers, 'authorization'),
      assertAdminC2Uuid('downloadAdminAuditLogExport', exportId),
      request.id ?? 'unavailable',
    );
    response.statusCode = 200;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="admin-audit-${delivery.exportId}.zip"`,
    );
    response.setHeader('Content-Length', String(delivery.bytes.byteLength));
    let heartbeatFailed = false;
    const heartbeat = setInterval(() => {
      void delivery
        .heartbeat()
        .then((renewed) => {
          if (!renewed) {
            heartbeatFailed = true;
            response.destroy(new Error('Audit export read lease expired.'));
          }
        })
        .catch((error: unknown) => {
          heartbeatFailed = true;
          response.destroy(error instanceof Error ? error : new Error('Read lease failure.'));
        });
    }, 30_000);
    let started = false;
    try {
      for (let offset = 0; offset < delivery.bytes.byteLength; offset += 64 * 1024) {
        if (heartbeatFailed) throw new Error('Audit export read lease heartbeat failed.');
        started = true;
        const accepted = response.write(
          delivery.bytes.subarray(offset, Math.min(offset + 64 * 1024, delivery.bytes.byteLength)),
        );
        if (!accepted) await once(response, 'drain');
      }
      await new Promise<void>((resolve, reject) => {
        response.once('error', reject);
        response.end(() => resolve());
      });
    } catch (error: unknown) {
      response.destroy(error instanceof Error ? error : new Error('Audit export stream failed.'));
      if (!started) throw error;
    } finally {
      clearInterval(heartbeat);
      await delivery.release();
    }
  }
}
