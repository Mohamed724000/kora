import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminRequestPolicyError,
  type AdminRequestPolicy,
} from '../admin-auth/admin-request-policy';
import type { RequestWithId } from '../observability/http-logger';
import type { AdminAuditExportService } from './admin-audit-export.service';
import { AdminAuditController } from './admin-audit.controller';
import type { AdminAuditQueryService } from './admin-audit.query.service';

function request(id = 'request-c2b-unit'): RequestWithId {
  return { id } as RequestWithId;
}

type TestResponse = ServerResponse & {
  destroy: ReturnType<typeof vi.fn>;
  headers: Map<string, string>;
  write: ReturnType<typeof vi.fn>;
};

function response(): TestResponse {
  const emitter = new EventEmitter() as TestResponse;
  emitter.headers = new Map();
  emitter.statusCode = 0;
  emitter.setHeader = vi.fn((name: string, value: string | number | readonly string[]) => {
    emitter.headers.set(name, String(value));
    return emitter;
  });
  emitter.write = vi.fn(() => true);
  emitter.end = vi.fn((callback?: () => void) => {
    callback?.();
    return emitter;
  }) as unknown as TestResponse['end'];
  emitter.destroy = vi.fn(() => emitter);
  return emitter;
}

describe('AdminAuditController', () => {
  it('maps list filters and bearer to the immutable query service page', async () => {
    const queryService = {
      list: vi.fn().mockResolvedValue({ data: [], meta: { hasMore: false, nextCursor: null } }),
    } as unknown as AdminAuditQueryService;
    const controller = new AdminAuditController(
      queryService,
      {} as AdminAuditExportService,
      {} as AdminRequestPolicy,
    );
    await expect(
      controller.list(
        { authorization: `Bearer ${'a'.repeat(32)}` },
        { action: 'changeAdminUserRole', limit: '50' },
        request('request-list'),
      ),
    ).resolves.toEqual({
      data: [],
      meta: { hasMore: false, nextCursor: null, requestId: 'request-list' },
    });
    expect(queryService.list).toHaveBeenCalledWith(
      `Bearer ${'a'.repeat(32)}`,
      { action: 'changeAdminUserRole', limit: 50 },
      'request-list',
    );
  });

  it('does not invent length limits for historical text filter values', async () => {
    const historicalAction = `legacy-${'x'.repeat(512)}`;
    const historicalEntityId = `external-${'y'.repeat(512)}`;
    const queryService = {
      list: vi.fn().mockResolvedValue({ data: [], meta: { hasMore: false, nextCursor: null } }),
    } as unknown as AdminAuditQueryService;
    const controller = new AdminAuditController(
      queryService,
      {} as AdminAuditExportService,
      {} as AdminRequestPolicy,
    );
    await controller.list(
      { authorization: `Bearer ${'a'.repeat(32)}` },
      { action: historicalAction, entityId: historicalEntityId },
      request('request-long-historical-filter'),
    );
    expect(queryService.list).toHaveBeenCalledWith(
      expect.any(String),
      { action: historicalAction, entityId: historicalEntityId, limit: 25 },
      'request-long-historical-filter',
    );
  });

  it('applies the mutation policy before create and emits the normative 202 Location', async () => {
    const order: string[] = [];
    const exportService = {
      create: vi.fn(async () => {
        order.push('service');
        return {
          contentSha256: null,
          createdAt: '2026-10-23T12:00:00.000Z',
          expiresAt: null,
          exportId: '00000000-0000-4000-8000-000000000003',
          failureCode: null,
          signatureKeyId: null,
          state: 'PENDING',
        };
      }),
    } as unknown as AdminAuditExportService;
    const policy = {
      assertMutationRequest: vi.fn(() => order.push('policy')),
    } as unknown as AdminRequestPolicy;
    const selectedResponse = response();
    const controller = new AdminAuditController(
      {} as AdminAuditQueryService,
      exportService,
      policy,
    );
    await controller.create(
      {
        from: '2026-10-22T00:00:00.000Z',
        operatorReason: 'approved export',
        reasonCode: 'AUDIT_EXPORT',
        to: '2026-10-23T00:00:00.000Z',
      },
      {
        authorization: `Bearer ${'b'.repeat(32)}`,
        'idempotency-key': 'idempotency-key-0001',
      },
      request('request-create'),
      selectedResponse,
    );
    expect(order).toEqual(['policy', 'service']);
    expect(selectedResponse.statusCode).toBe(202);
    expect(selectedResponse.setHeader).toHaveBeenCalledWith(
      'Location',
      '/api/v1/admin/audit-log-exports/00000000-0000-4000-8000-000000000003',
    );
  });

  it('maps a policy refusal to the exact C2b operation before calling the service', async () => {
    const exportService = { create: vi.fn() } as unknown as AdminAuditExportService;
    const controller = new AdminAuditController({} as AdminAuditQueryService, exportService, {
      assertMutationRequest: vi.fn(() => {
        throw new AdminRequestPolicyError('FORBIDDEN');
      }),
    } as unknown as AdminRequestPolicy);
    await expect(controller.create({}, {}, request(), response())).rejects.toMatchObject({
      code: 'FORBIDDEN',
      disposition: 'RECORD_SECURITY_EVENT',
      operationId: 'createAdminAuditLogExport',
    });
    expect(exportService.create).not.toHaveBeenCalled();
  });

  it('writes no byte until the service returns an integrity-verified, durably audited lease', async () => {
    const order: string[] = [];
    const release = vi.fn(async () => order.push('release'));
    const exportService = {
      download: vi.fn(async () => {
        order.push('qualified');
        return {
          bytes: Buffer.from('exact-zip-body'),
          contentSha256: 'a'.repeat(64),
          exportId: '00000000-0000-4000-8000-000000000003',
          heartbeat: vi.fn().mockResolvedValue(true),
          release,
        };
      }),
    } as unknown as AdminAuditExportService;
    const selectedResponse = response();
    selectedResponse.write.mockImplementation(() => {
      order.push('write');
      return true;
    });
    const controller = new AdminAuditController(
      {} as AdminAuditQueryService,
      exportService,
      {} as AdminRequestPolicy,
    );
    await controller.download(
      '00000000-0000-4000-8000-000000000003',
      { authorization: `Bearer ${'c'.repeat(32)}` },
      request('request-download'),
      selectedResponse,
    );
    expect(order).toEqual(['qualified', 'write', 'release']);
    expect(selectedResponse.headers.get('Content-Type')).toBe('application/zip');
    expect(selectedResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(selectedResponse.headers.get('Content-Length')).toBe('14');
  });
});
