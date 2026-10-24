import { describe, expect, it, vi } from 'vitest';
import type { AdminAuditAuthorizationService } from './admin-audit.authorization.service';
import type {
  AdminAuditPrincipal,
  AdminAuditRepository,
  AdminAuditTransactionRepository,
} from './admin-audit.repository';
import { AdminAuditQueryService } from './admin-audit.query.service';
import type { AdminAuditLogEntry } from './admin-audit.types';
import {
  AdminSecurityPaginationError,
  type AdminSecurityPagination,
} from './admin-security.pagination';
import type { AdminC2BearerProof } from './admin-security.types';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const PROOF: AdminC2BearerProof = {
  adminUserId: ADMIN_ID,
  authorizationVersion: 2,
  expiresAtSeconds: Math.floor(NOW.getTime() / 1000) + 3_600,
  issuedAtSeconds: Math.floor(NOW.getTime() / 1000) - 60,
  role: 'SUPER_ADMIN',
  sessionId: SESSION_ID,
  tokenId: 'token-id',
};
const PRINCIPAL = {
  adminUserId: ADMIN_ID,
  sessionId: SESSION_ID,
} as AdminAuditPrincipal;
const ENTRY: AdminAuditLogEntry = {
  action: 'changeAdminUserRole',
  actorAdminUserId: ADMIN_ID,
  adminRecoveryContextId: null,
  adminSessionId: SESSION_ID,
  causationEventId: null,
  causationSecurityEventId: null,
  context: 'ADMIN_SESSION',
  createdAt: '2026-10-23T11:00:00.000Z',
  delegatedByAdminUserId: null,
  entityId: ADMIN_ID,
  entityType: 'ADMIN_USER',
  eventClass: 'BUSINESS',
  eventId: '00000000-0000-4000-8000-000000000003',
  failureCode: null,
  maskedAfter: { role: 'SUPPORT' },
  maskedBefore: { role: 'CONTENT_EDITOR' },
  operatorReason: null,
  operatorReasonRedacted: true,
  outcome: 'SUCCESS',
  outcomeProvenance: 'EXPLICIT_C2',
  reasonCode: 'ROLE_ADMINISTRATION',
  requestId: 'source-request',
  subjectAdminUserId: ADMIN_ID,
  systemExecutionRefHash: null,
  version: 3,
};

function harness(
  transactionOverrides: Partial<AdminAuditTransactionRepository>,
  paginationOverrides: Partial<AdminSecurityPagination> = {},
): Readonly<{
  authorization: AdminAuditAuthorizationService;
  service: AdminAuditQueryService;
  transaction: AdminAuditTransactionRepository;
}> {
  const transaction = {
    getSnapshot: vi.fn().mockResolvedValue({
      createdAt: NOW,
      entryCount: 1,
      expiresAt: new Date(NOW.getTime() + 900_000),
      filtersDigest: 'a'.repeat(64),
      id: 'snapshot-id',
      operation: 'LIST_ADMIN_AUDIT_LOGS',
      principalAdminUserId: ADMIN_ID,
      utf8Bytes: 1,
    }),
    getSnapshotPage: vi.fn().mockResolvedValue([
      {
        ordinal: 0,
        projectionJson: JSON.stringify(ENTRY),
        resourceId: ENTRY.eventId,
        sourceCreatedAt: new Date(ENTRY.createdAt),
        utf8Bytes: 1,
      },
    ]),
    insertHttpAudit: vi.fn().mockResolvedValue('audit-id'),
    insertSnapshot: vi.fn().mockResolvedValue('snapshot-id'),
    selectProjection: vi.fn().mockResolvedValue([ENTRY]),
    ...transactionOverrides,
  } as unknown as AdminAuditTransactionRepository;
  const repository = {
    transaction: vi.fn(async (callback) => callback(transaction)),
  } as unknown as AdminAuditRepository;
  const authorization = {
    authorize: vi.fn().mockResolvedValue(PRINCIPAL),
    verifyBearer: vi.fn().mockResolvedValue(PROOF),
  } as unknown as AdminAuditAuthorizationService;
  const pagination = {
    issue: vi.fn().mockResolvedValue('next-cursor'),
    verify: vi.fn(),
    ...paginationOverrides,
  } as unknown as AdminSecurityPagination;
  return {
    authorization,
    service: new AdminAuditQueryService(repository, authorization, pagination),
    transaction,
  };
}

describe('AdminAuditQueryService', () => {
  it('materializes a stable projection snapshot before its success audit', async () => {
    const order: string[] = [];
    const selected = harness({
      insertHttpAudit: vi.fn(async () => {
        order.push('audit');
        return 'audit-id';
      }),
      insertSnapshot: vi.fn(async () => {
        order.push('snapshot');
        return 'snapshot-id';
      }),
    });
    await expect(
      selected.service.list(`Bearer ${'a'.repeat(32)}`, { limit: 25 }, 'request-list', NOW),
    ).resolves.toEqual({ data: [ENTRY], meta: { hasMore: false, nextCursor: null } });
    expect(order).toEqual(['snapshot', 'audit']);
    expect(selected.authorization.authorize).toHaveBeenCalledOnce();
  });

  it('records a durable rejection instead of truncating an over-budget projection', async () => {
    const entries = Array.from({ length: 10_001 }, (_, index) => ({
      ...ENTRY,
      eventId: `event-${String(index).padStart(5, '0')}`,
    }));
    const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
    const insertSnapshot = vi.fn();
    const selected = harness({
      insertHttpAudit,
      insertSnapshot,
      selectProjection: vi.fn().mockResolvedValue(entries),
    });
    await expect(
      selected.service.list(`Bearer ${'a'.repeat(32)}`, { limit: 25 }, 'request-budget', NOW),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', disposition: 'ALREADY_DURABLE' });
    expect(insertSnapshot).not.toHaveBeenCalled();
    expect(insertHttpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'PROJECTION_BUDGET_EXCEEDED', outcome: 'REJECTED' }),
    );
  });

  it('binds a cursor to the principal, operation and filter digest and audits rejection', async () => {
    const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
    const selected = harness(
      { insertHttpAudit },
      { verify: vi.fn().mockRejectedValue(new AdminSecurityPaginationError()) },
    );
    await expect(
      selected.service.list(
        `Bearer ${'a'.repeat(32)}`,
        { action: 'changeAdminUserRole', cursor: 'invalid-cursor', limit: 25 },
        'request-cursor',
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', disposition: 'ALREADY_DURABLE' });
    expect(insertHttpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'VALIDATION_ERROR', outcome: 'REJECTED' }),
    );
  });
});
