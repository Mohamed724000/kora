import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AdminAuditRepository } from './admin-audit.repository';
import type { AdminC2HttpError } from './admin-security.errors';

@Injectable()
export class AdminAuditFailureService {
  constructor(@Inject(AdminAuditRepository) private readonly repository: AdminAuditRepository) {}

  async recordFailure(exception: AdminC2HttpError, requestId: string): Promise<void> {
    if (exception.disposition !== 'RECORD_SECURITY_EVENT' || exception.auditRecorded) return;
    const context = exception.auditContext;
    await this.repository.transaction((transaction) =>
      transaction.insertSecurityEvent({
        action: exception.operationId,
        ...(context?.actorAdminUserId === undefined
          ? {}
          : { adminUserId: context.actorAdminUserId }),
        ...(context?.entityId === undefined ? {} : { entityId: context.entityId }),
        ...(context?.entityType === undefined ? {} : { entityType: context.entityType }),
        failureCode: exception.code,
        requestId,
        subjectRefHash:
          context?.subjectRefHash ??
          createHash('sha256')
            .update(`KORA_ADMIN_C2B_FAILURE_V1\0${exception.operationId}\0${requestId}`, 'utf8')
            .digest('hex'),
      }),
    );
  }
}
