import { describe, expect, it } from 'vitest';
import { projectAdminAudit, type AdminAuditProjectionRow } from './admin-audit.projection';

function row(overrides: Partial<AdminAuditProjectionRow> = {}): AdminAuditProjectionRow {
  return {
    action: 'unknownHistoricalAction',
    actorAdminUserId: null,
    adminRecoveryContextId: null,
    adminSessionId: null,
    causationEventId: null,
    causationSecurityEventId: null,
    context: null,
    createdAt: new Date('2026-10-23T00:00:00.000Z'),
    delegatedByAdminUserId: null,
    entityId: 'entity-1',
    entityType: 'HISTORICAL',
    eventClass: null,
    eventId: 'event-1',
    failureCode: null,
    legacyReasonRedacted: true,
    maskedAfter: null,
    maskedBefore: null,
    operatorReason: null,
    operatorReasonRedacted: true,
    outcome: 'UNKNOWN',
    outcomeProvenance: 'HISTORICAL_UNKNOWN',
    reasonCode: null,
    requestId: 'request-1',
    subjectAdminUserId: null,
    systemExecutionRefHash: null,
    version: 1,
    ...overrides,
  };
}

describe('C2b positive audit projection', () => {
  it('keeps unknown actions while suppressing arbitrary historical JSON', () => {
    const projected = projectAdminAudit(
      row({ maskedBefore: { email: 'secret@example.test', role: 'SUPER_ADMIN' } }),
    );
    expect(projected.maskedBefore).toBeNull();
    expect(projected.action).toBe('unknownHistoricalAction');
    expect(projected.operatorReason).toBeNull();
    expect(projected.legacyReasonRedacted).toBe(true);
  });

  it('selects only an exact normative role and drops sibling keys', () => {
    expect(
      projectAdminAudit(
        row({
          action: 'changeAdminUserRole',
          maskedAfter: { email: 'secret@example.test', role: 'FINANCE_MANAGER' },
        }),
      ).maskedAfter,
    ).toEqual({ role: 'FINANCE_MANAGER' });
  });

  it('selects only an exact normative status and rejects nested values', () => {
    expect(
      projectAdminAudit(
        row({ action: 'changeAdminUserStatus', maskedAfter: { status: 'PENDING_MFA' } }),
      ).maskedAfter,
    ).toEqual({ status: 'PENDING_MFA' });
    expect(
      projectAdminAudit(
        row({ action: 'changeAdminUserStatus', maskedAfter: { status: { value: 'ACTIVE' } } }),
      ).maskedAfter,
    ).toBeNull();
  });

  it('does not coerce scalar, array or invalid enum content', () => {
    for (const value of ['SUPER_ADMIN', ['SUPER_ADMIN'], { role: 'ROOT' }]) {
      expect(
        projectAdminAudit(row({ action: 'changeAdminUserRole', maskedBefore: value })).maskedBefore,
      ).toBeNull();
    }
  });

  it('preserves v2 unknown outcome and exposes v3 explicit outcome only', () => {
    expect(projectAdminAudit(row({ outcome: 'SUCCESS', version: 2 })).outcome).toBe('UNKNOWN');
    expect(projectAdminAudit(row({ outcome: 'REJECTED', version: 3 })).outcome).toBe('REJECTED');
  });
});
