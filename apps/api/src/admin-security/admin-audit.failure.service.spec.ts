import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminAuditRepository,
  AdminAuditTransactionRepository,
} from './admin-audit.repository';
import { AdminAuditFailureService } from './admin-audit.failure.service';
import { AdminC2HttpError } from './admin-security.errors';

describe('AdminAuditFailureService', () => {
  it('does not create a second sink for a durable or commit-unknown error', async () => {
    const transaction = vi.fn();
    const service = new AdminAuditFailureService({
      transaction,
    } as unknown as AdminAuditRepository);
    await service.recordFailure(
      new AdminC2HttpError('listAdminAuditLogs', 'FORBIDDEN', 'ALREADY_DURABLE'),
      'request-durable',
    );
    await service.recordFailure(
      new AdminC2HttpError(
        'downloadAdminAuditLogExport',
        'SERVICE_UNAVAILABLE',
        'COMMIT_UNKNOWN_NO_SECOND_SINK',
      ),
      'request-unknown',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('records exactly one pre-proof security event with a deterministic subject hash', async () => {
    const insertSecurityEvent = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(async (callback) =>
      callback({ insertSecurityEvent } as unknown as AdminAuditTransactionRepository),
    );
    const service = new AdminAuditFailureService({
      transaction,
    } as unknown as AdminAuditRepository);
    await service.recordFailure(
      new AdminC2HttpError('createAdminAuditLogExport', 'AUTH_REQUIRED', 'RECORD_SECURITY_EVENT'),
      'request-before-proof',
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(insertSecurityEvent).toHaveBeenCalledExactlyOnceWith({
      action: 'createAdminAuditLogExport',
      failureCode: 'AUTH_REQUIRED',
      requestId: 'request-before-proof',
      subjectRefHash: createHash('sha256')
        .update(
          'KORA_ADMIN_C2B_FAILURE_V1\0createAdminAuditLogExport\0request-before-proof',
          'utf8',
        )
        .digest('hex'),
    });
  });
});
