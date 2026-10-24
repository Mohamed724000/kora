import { Inject, Injectable } from '@nestjs/common';
import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import { AdminSecurityPagination, AdminSecurityPaginationError } from './admin-security.pagination';
import {
  AdminAuditAuthorizationRejection,
  AdminAuditAuthorizationService,
} from './admin-audit.authorization.service';
import { AdminAuditRepository } from './admin-audit.repository';
import type { AdminAuditListInput, AdminAuditLogEntry } from './admin-audit.types';
import { AdminC2HttpError } from './admin-security.errors';
import type { AdminPage } from './admin-security.types';

const MAX_ENTRIES = 10_000;
const MAX_UTF8_BYTES = 25 * 1024 * 1024;

function digestFilters(input: AdminAuditListInput): string {
  const { cursor, limit, ...filters } = input;
  void cursor;
  void limit;
  const serialized = canonicalize(filters);
  if (serialized === undefined) throw new TypeError('Audit filters are not canonicalizable.');
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

class DurableListRejection {
  constructor(readonly error: AdminC2HttpError) {}
}

@Injectable()
export class AdminAuditQueryService {
  constructor(
    @Inject(AdminAuditRepository) private readonly repository: AdminAuditRepository,
    @Inject(AdminAuditAuthorizationService)
    private readonly authorization: AdminAuditAuthorizationService,
    @Inject(AdminSecurityPagination) private readonly pagination: AdminSecurityPagination,
  ) {}

  async list(
    authorizationHeader: string | undefined,
    input: AdminAuditListInput,
    requestId: string,
    now = new Date(),
  ): Promise<AdminPage<AdminAuditLogEntry>> {
    const operationId = 'listAdminAuditLogs';
    const proof = await this.authorization.verifyBearer(operationId, authorizationHeader, now);
    const filtersDigest = digestFilters(input);
    let proofComplete = false;
    let result;
    try {
      result = await this.repository.transaction(async (transaction) => {
        const authorization = await this.authorization.authorize(
          transaction,
          operationId,
          proof,
          requestId,
          { id: requestId, type: 'ADMIN_AUDIT_SNAPSHOT' },
          undefined,
          now,
        );
        if (authorization instanceof AdminAuditAuthorizationRejection) {
          return new DurableListRejection(authorization.error);
        }
        const principal = authorization;
        proofComplete = true;
        let snapshotId: string;
        let firstOrdinal: number;
        let expiresAt: Date;
        if (input.cursor === undefined) {
          const entries = await transaction.selectProjection(input);
          const utf8Bytes = entries.reduce(
            (total, entry) => total + Buffer.byteLength(JSON.stringify(entry), 'utf8'),
            0,
          );
          if (entries.length > MAX_ENTRIES || utf8Bytes > MAX_UTF8_BYTES) {
            await transaction.insertHttpAudit({
              action: operationId,
              actorAdminUserId: principal.adminUserId,
              adminSessionId: principal.sessionId,
              entityId: requestId,
              entityType: 'ADMIN_AUDIT_SNAPSHOT',
              failureCode: 'PROJECTION_BUDGET_EXCEEDED',
              outcome: 'REJECTED',
              requestId,
            });
            return new DurableListRejection(
              new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE'),
            );
          }
          snapshotId = await transaction.insertSnapshot({
            filtersDigest,
            items: entries,
            operation: 'LIST_ADMIN_AUDIT_LOGS',
            principalAdminUserId: principal.adminUserId,
          });
          const snapshot = await transaction.getSnapshot(snapshotId, principal.adminUserId);
          if (snapshot === undefined) throw new Error('C2b snapshot was not persisted.');
          expiresAt = snapshot.expiresAt;
          firstOrdinal = 0;
        } else {
          let cursor;
          try {
            cursor = await this.pagination.verify(
              input.cursor,
              {
                filtersDigest,
                operation: 'LIST_ADMIN_AUDIT_LOGS',
                principalAdminUserId: proof.adminUserId,
              },
              now,
            );
          } catch (error: unknown) {
            if (error instanceof AdminSecurityPaginationError) {
              await transaction.insertHttpAudit({
                action: operationId,
                actorAdminUserId: principal.adminUserId,
                adminSessionId: principal.sessionId,
                entityId: requestId,
                entityType: 'ADMIN_AUDIT_SNAPSHOT',
                failureCode: 'VALIDATION_ERROR',
                outcome: 'REJECTED',
                requestId,
              });
              return new DurableListRejection(
                new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE'),
              );
            }
            throw error;
          }
          const snapshot = await transaction.getSnapshot(cursor.snapshotId, principal.adminUserId);
          if (
            snapshot === undefined ||
            snapshot.operation !== 'LIST_ADMIN_AUDIT_LOGS' ||
            snapshot.filtersDigest !== filtersDigest ||
            snapshot.expiresAt <= now
          ) {
            await transaction.insertHttpAudit({
              action: operationId,
              actorAdminUserId: principal.adminUserId,
              adminSessionId: principal.sessionId,
              entityId: requestId,
              entityType: 'ADMIN_AUDIT_SNAPSHOT',
              failureCode: 'VALIDATION_ERROR',
              outcome: 'REJECTED',
              requestId,
            });
            return new DurableListRejection(
              new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE'),
            );
          }
          snapshotId = snapshot.id;
          firstOrdinal = cursor.nextOrdinal;
          expiresAt = snapshot.expiresAt;
        }
        const rows = await transaction.getSnapshotPage(snapshotId, firstOrdinal, input.limit + 1);
        const hasMore = rows.length > input.limit;
        const selected = rows.slice(0, input.limit);
        const data = selected.map((row) => JSON.parse(row.projectionJson) as AdminAuditLogEntry);
        const nextOrdinal = firstOrdinal + selected.length;
        const nextCursor = hasMore
          ? await this.pagination.issue({
              expiresAt: expiresAt.toISOString(),
              filtersDigest,
              nextOrdinal,
              operation: 'LIST_ADMIN_AUDIT_LOGS',
              principalAdminUserId: principal.adminUserId,
              snapshotId,
            })
          : null;
        await transaction.insertHttpAudit({
          action: operationId,
          actorAdminUserId: principal.adminUserId,
          adminSessionId: principal.sessionId,
          entityId: snapshotId,
          entityType: 'ADMIN_AUDIT_SNAPSHOT',
          outcome: 'SUCCESS',
          requestId,
        });
        return { data, meta: { hasMore, nextCursor } };
      });
    } catch (error: unknown) {
      if (error instanceof AdminC2HttpError) throw error;
      if (
        error instanceof AdminC2TransactionError &&
        error.code === 'CALLBACK_FAILED' &&
        error.primaryError instanceof AdminC2HttpError
      ) {
        throw error.primaryError;
      }
      if (error instanceof AdminC2TransactionError && error.code === 'COMMIT_UNKNOWN') {
        throw new AdminC2HttpError(
          operationId,
          'SERVICE_UNAVAILABLE',
          'COMMIT_UNKNOWN_NO_SECOND_SINK',
        );
      }
      throw new AdminC2HttpError(
        operationId,
        'SERVICE_UNAVAILABLE',
        proofComplete ? 'NONE_AFTER_PROOF' : 'RECORD_SECURITY_EVENT',
      );
    }
    if (result instanceof DurableListRejection) throw result.error;
    return result;
  }
}
