import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_AUTH_CRYPTO,
  AdminAuthCryptoError,
  type AdminAuthCrypto,
} from '../admin-auth/admin-auth.crypto';
import {
  ADMIN_KEY_PROVIDER,
  AdminKeyProviderUnavailableError,
  type AdminKeyProvider,
} from '../admin-auth/admin-key-provider';
import type { AdminStepUpPurpose } from '../admin-auth/admin-auth.repository';
import type {
  AdminAuditPrincipal,
  AdminAuditTransactionRepository,
} from './admin-audit.repository';
import { AdminC2HttpError, type AdminC2OperationId } from './admin-security.errors';
import { bearerToken, type AdminC2BearerProof } from './admin-security.types';

function proofMatches(
  principal: AdminAuditPrincipal,
  proof: AdminC2BearerProof,
  now: Date,
  requiredStepUp?: AdminStepUpPurpose,
): boolean {
  return (
    principal.adminUserId === proof.adminUserId &&
    principal.sessionId === proof.sessionId &&
    principal.accessTokenJti === proof.tokenId &&
    principal.authorizationVersion === proof.authorizationVersion &&
    principal.sessionAuthorizationVersion === proof.authorizationVersion &&
    principal.role === proof.role &&
    principal.status === 'ACTIVE' &&
    principal.sessionRevokedAt === null &&
    principal.expiresAt > now &&
    principal.absoluteExpiresAt !== null &&
    principal.absoluteExpiresAt > now &&
    (requiredStepUp === undefined ||
      (principal.stepUpPurpose === requiredStepUp &&
        principal.stepUpExpiresAt !== null &&
        principal.stepUpExpiresAt > now))
  );
}

export class AdminAuditAuthorizationRejection {
  constructor(readonly error: AdminC2HttpError) {}
}

@Injectable()
export class AdminAuditAuthorizationService {
  constructor(
    @Inject(ADMIN_AUTH_CRYPTO) private readonly authCrypto: AdminAuthCrypto,
    @Inject(ADMIN_KEY_PROVIDER) private readonly keyProvider: AdminKeyProvider,
  ) {}

  async verifyBearer(
    operationId: AdminC2OperationId,
    authorization: string | undefined,
    now = new Date(),
  ): Promise<AdminC2BearerProof> {
    const token = bearerToken(operationId, authorization);
    try {
      await this.keyProvider.assertAvailable();
      return await this.authCrypto.verifyAccessToken(token, Math.floor(now.getTime() / 1000));
    } catch (error: unknown) {
      if (error instanceof AdminKeyProviderUnavailableError) {
        throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'RECORD_SECURITY_EVENT');
      }
      if (error instanceof AdminAuthCryptoError) {
        throw new AdminC2HttpError(operationId, 'AUTH_REQUIRED', 'RECORD_SECURITY_EVENT');
      }
      throw error;
    }
  }

  async authorize(
    transaction: AdminAuditTransactionRepository,
    operationId: AdminC2OperationId,
    proof: AdminC2BearerProof,
    requestId: string,
    entity: Readonly<{
      id: string;
      type: 'ADMIN_AUDIT_SNAPSHOT' | 'ADMIN_AUDIT_EXPORT';
      operatorReason?: string;
    }>,
    requiredStepUp?: AdminStepUpPurpose,
    now = new Date(),
  ): Promise<AdminAuditPrincipal | AdminAuditAuthorizationRejection> {
    const principal = await transaction.lockPrincipal(proof.adminUserId, proof.sessionId);
    if (principal === undefined || !proofMatches(principal, proof, now)) {
      throw new AdminC2HttpError(operationId, 'AUTH_REQUIRED', 'RECORD_SECURITY_EVENT');
    }
    const auditContext = {
      action: operationId,
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
      entityId: entity.id,
      entityType: entity.type,
    } as const;
    let failureCode: string | undefined;
    if (principal.role !== 'SUPER_ADMIN') failureCode = 'FORBIDDEN';
    else if (requiredStepUp !== undefined && !proofMatches(principal, proof, now, requiredStepUp)) {
      failureCode =
        principal.stepUpPurpose === null
          ? 'STEP_UP_REQUIRED'
          : principal.stepUpExpiresAt === null || principal.stepUpExpiresAt <= now
            ? 'STEP_UP_EXPIRED'
            : 'STEP_UP_INVALID';
    }
    if (failureCode !== undefined) {
      await transaction.insertHttpAudit({
        action: operationId,
        actorAdminUserId: principal.adminUserId,
        adminSessionId: principal.sessionId,
        entityId: entity.id,
        entityType: entity.type,
        failureCode,
        ...(entity.operatorReason === undefined ? {} : { operatorReason: entity.operatorReason }),
        outcome: 'REJECTED',
        requestId,
      });
      return new AdminAuditAuthorizationRejection(
        new AdminC2HttpError(operationId, 'FORBIDDEN', 'ALREADY_DURABLE', { auditContext }),
      );
    }
    return principal;
  }
}
