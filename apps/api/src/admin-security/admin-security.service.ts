import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ADMIN_AUTH_CRYPTO, AdminAuthCryptoError } from '../admin-auth/admin-auth.crypto';
import type { AdminAuthCrypto } from '../admin-auth/admin-auth.crypto';
import {
  ADMIN_KEY_PROVIDER,
  AdminKeyProviderUnavailableError,
  type AdminKeyProvider,
} from '../admin-auth/admin-key-provider';
import type { AdminRole, AdminStepUpPurpose } from '../admin-auth/admin-auth.repository';
import {
  ADMIN_RATE_LIMITER,
  AdminRateLimitUnavailableError,
  type AdminRateLimitService,
} from '../admin-auth/admin-rate-limit.service';
import {
  ADMIN_REQUEST_POLICY,
  AdminRequestPolicyError,
  type AdminRequestPolicy,
} from '../admin-auth/admin-request-policy';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import { AdminC2HttpError, type AdminC2OperationId } from './admin-security.errors';
import {
  ADMIN_NOTIFICATION_PORT,
  AdminNotificationUnavailableError,
  type AdminNotificationPort,
} from './admin-notification.port';
import {
  ADMIN_NOTIFICATION_WAKEUP,
  type AdminNotificationWakeupPort,
} from './admin-notification.worker';
import {
  ADMIN_PASSWORD_COMPROMISE_PORT,
  AdminPasswordCompromiseUnavailableError,
  type AdminPasswordCompromisePort,
} from './admin-password-compromise.port';
import {
  ADMIN_SECURITY_CRYPTO,
  AdminSecurityOutboxKeyringUnavailableError,
} from './admin-security.crypto';
import type { AdminSecurityCrypto } from './admin-security.crypto';
import {
  AdminSecurityPagination,
  AdminSecurityPaginationError,
  type AdminSnapshotCursor,
  type AdminSnapshotOperation,
} from './admin-security.pagination';
import {
  AdminSecurityRepository,
  type AdminC2AuditInsert,
  type AdminC2LockedPrincipal,
  type AdminInvitationRecord,
  type AdminPasswordResetContextRecord,
  type AdminSecurityTransactionRepository,
} from './admin-security.repository';
import {
  bearerToken,
  type AdminC2BearerProof,
  type AdminPage,
  type AdminInvitationAcceptInput,
  type AdminInvitationCreateInput,
  type AdminInvitationProjection,
  type AdminPaginationInput,
  type AdminPasswordResetInput,
  type AdminPasswordResetRequestInput,
  type AdminReasonInput,
  type AdminRecoveryCaseCreateInput,
  type AdminRecoveryCaseProjection,
  type AdminRoleChangeInput,
  type AdminStatusChangeInput,
  type AdminUserProjection,
} from './admin-security.types';

const SNAPSHOT_MILLISECONDS = 15 * 60 * 1000;
const SNAPSHOT_MAXIMUM_ENTRIES = 10_000;
const SNAPSHOT_MAXIMUM_UTF8_BYTES = 25 * 1024 * 1024;
const SNAPSHOT_PROJECTION_VERSION = 1;
const PASSWORD_RESET_MILLISECONDS = 15 * 60 * 1000;
const INVITATION_MILLISECONDS = 24 * 60 * 60 * 1000;
const PREAUTH_MILLISECONDS = 10 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function proofMatches(
  record: AdminC2LockedPrincipal,
  proof: AdminC2BearerProof,
  now: Date,
  requiredStepUp: AdminStepUpPurpose | undefined,
): boolean {
  return (
    record.adminUserId === proof.adminUserId &&
    record.sessionId === proof.sessionId &&
    record.accessTokenJti === proof.tokenId &&
    record.authorizationVersion === proof.authorizationVersion &&
    record.sessionAuthorizationVersion === proof.authorizationVersion &&
    record.role === proof.role &&
    record.status === 'ACTIVE' &&
    record.sessionRevokedAt === null &&
    record.expiresAt > now &&
    record.absoluteExpiresAt !== null &&
    record.absoluteExpiresAt > now &&
    (requiredStepUp === undefined ||
      (record.stepUpPurpose === requiredStepUp &&
        record.stepUpExpiresAt !== null &&
        record.stepUpExpiresAt > now))
  );
}

function operationForSnapshot(operation: AdminSnapshotOperation): AdminC2OperationId {
  return operation === 'LIST_ADMIN_RECOVERY_CASES' ? 'listAdminRecoveryCases' : 'listAdminUsers';
}

interface MaterializedPage<T> {
  readonly entryCount: number;
  readonly expiresAt: Date;
  readonly items: readonly T[];
  readonly nextOrdinal: number;
  readonly snapshotId: string;
}

class AdminC2DurableRejection {
  constructor(readonly error: AdminC2HttpError) {}
}

@Injectable()
export class AdminSecurityService {
  constructor(
    @Inject(AdminSecurityRepository) private readonly repository: AdminSecurityRepository,
    @Inject(ADMIN_AUTH_CRYPTO) private readonly authCrypto: AdminAuthCrypto,
    @Inject(ADMIN_KEY_PROVIDER) private readonly keyProvider: AdminKeyProvider,
    @Inject(ADMIN_RATE_LIMITER) private readonly rateLimiter: AdminRateLimitService,
    @Inject(ADMIN_REQUEST_POLICY) private readonly requestPolicy: AdminRequestPolicy,
    @Inject(ADMIN_NOTIFICATION_PORT) private readonly notification: AdminNotificationPort,
    @Inject(ADMIN_PASSWORD_COMPROMISE_PORT)
    private readonly passwordCompromise: AdminPasswordCompromisePort,
    @Inject(ADMIN_SECURITY_CRYPTO) private readonly securityCrypto: AdminSecurityCrypto,
    @Inject(AdminSecurityPagination) private readonly pagination: AdminSecurityPagination,
    @Inject(ADMIN_NOTIFICATION_WAKEUP)
    private readonly notificationWakeup: AdminNotificationWakeupPort,
  ) {}

  async recordFailure(exception: AdminC2HttpError, requestId: string): Promise<void> {
    if (exception.disposition !== 'RECORD_SECURITY_EVENT' || exception.auditRecorded) return;
    const context = exception.auditContext;
    await this.run(exception.operationId, (transaction) =>
      transaction.insertSecurityEvent({
        action: exception.operationId,
        ...(context?.actorAdminUserId === undefined
          ? {}
          : { adminUserId: context.actorAdminUserId }),
        ...(context?.entityId === undefined ? {} : { entityId: context.entityId }),
        ...(context?.entityType === undefined ? {} : { entityType: context.entityType }),
        eventClass: ['requestAdminPasswordReset', 'resetAdminPassword'].includes(
          exception.operationId,
        )
          ? 'LOGIN'
          : 'BUSINESS',
        failureCode: exception.code,
        id: randomUUID(),
        outcome: 'FAILED',
        requestId,
        subjectRefHash:
          context?.subjectRefHash ??
          this.securityCrypto.canonicalDigest('KORA_ADMIN_C2_REJECTION_V1', [
            ['operationId', exception.operationId],
            ['requestId', requestId],
          ]),
      }),
    );
  }

  async requestPasswordReset(
    input: AdminPasswordResetRequestInput,
    execution: Readonly<{ ipAddress: string; requestId: string }>,
    now = new Date(),
  ): Promise<void> {
    const operationId = 'requestAdminPasswordReset';
    await this.consumeRecoveryRateLimit(operationId, execution.ipAddress, input.emailCanonical);
    await this.requireNotification(operationId);

    const requestId = randomUUID();
    const contextId = randomUUID();
    const securityEventId = randomUUID();
    const outboxId = randomUUID();
    const code = this.securityCrypto.randomCode(28);
    const tokenHash = this.securityCrypto.sha256(code);
    const subjectRefHash = this.securityCrypto.canonicalDigest(
      'KORA_ADMIN_PASSWORD_RESET_SUBJECT_V1',
      [['email', input.emailCanonical]],
    );
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_MILLISECONDS);
    const encrypted = await this.securityCrypto.encryptOutboxPayload(
      {
        generation: 1,
        logicalDeliveryId: outboxId,
        outboxId,
        purpose: 'PASSWORD_RESET',
        sourceId: securityEventId,
      },
      { code, email: input.deliveryEmail },
    );

    const created = await this.run(operationId, async (transaction) => {
      const user = await transaction.lockAdminUserByEmail(input.emailCanonical);
      if (user === undefined || user.status !== 'ACTIVE') {
        await transaction.insertSecurityEvent({
          action: operationId,
          eventClass: 'LOGIN',
          failureCode: 'INELIGIBLE_ACCOUNT',
          id: securityEventId,
          outcome: 'FAILED',
          requestId: execution.requestId,
          subjectRefHash,
        });
        return false;
      }
      const replaced = await transaction.lockCurrentPasswordReset(user.id);
      if (replaced !== undefined) {
        await transaction.replacePasswordReset(replaced.requestId, replaced.outboxId, now);
      }
      await transaction.insertSecurityEvent({
        action: operationId,
        adminUserId: user.id,
        entityId: requestId,
        entityType: 'ADMIN_PASSWORD_RESET_REQUEST',
        eventClass: 'LOGIN',
        id: securityEventId,
        outcome: 'SUCCEEDED',
        requestId: execution.requestId,
        subjectRefHash,
      });
      await transaction.insertPasswordReset({
        adminUserId: user.id,
        contextId,
        encrypted,
        expiresAt,
        outboxId,
        ...(replaced === undefined
          ? {}
          : { replacedOutboxId: replaced.outboxId, replacedRequestId: replaced.requestId }),
        requestId,
        securityEventId,
        tokenHash,
      });
      return true;
    });
    if (created) this.signalNotification(outboxId);
  }

  async resetPassword(
    input: AdminPasswordResetInput,
    execution: Readonly<{ ipAddress: string; requestId: string }>,
    now = new Date(),
  ): Promise<void> {
    const operationId = 'resetAdminPassword';
    const tokenHash = this.securityCrypto.sha256(input.resetCode);
    await this.consumeRecoveryRateLimit(operationId, execution.ipAddress, tokenHash);
    const preliminary = await this.run(operationId, (transaction) =>
      transaction.lockPasswordResetContext(tokenHash),
    );
    if (!this.validResetContext(preliminary, now)) {
      throw new AdminC2HttpError(operationId, 'ADMIN_RECOVERY_INVALID', 'RECORD_SECURITY_EVENT', {
        auditContext: { action: operationId, subjectRefHash: tokenHash },
      });
    }

    const passwordBinding = this.securityCrypto.passwordBinding(input.newPassword);
    let passwordHash: string;
    try {
      const result = await this.checkPasswordCompromise(input.newPassword);
      if (result === 'COMPROMISED') {
        await this.recordResetRejection(
          tokenHash,
          preliminary!,
          execution.requestId,
          'VALIDATION_ERROR',
          now,
        );
        throw new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE');
      }
      passwordHash = await this.authCrypto.hashPassword(input.newPassword);
    } catch (error: unknown) {
      if (error instanceof AdminC2HttpError) throw error;
      const failure =
        error instanceof AdminPasswordCompromiseUnavailableError
          ? 'DEPENDENCY_UNAVAILABLE'
          : 'DEPENDENCY_UNAVAILABLE';
      await this.recordResetRejection(tokenHash, preliminary!, execution.requestId, failure, now);
      throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'ALREADY_DURABLE');
    }
    if (!this.securityCrypto.bindingMatches(input.newPassword, passwordBinding)) {
      await this.recordResetRejection(
        tokenHash,
        preliminary!,
        execution.requestId,
        'INTEGRITY_REJECTED',
        now,
      );
      throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'ALREADY_DURABLE');
    }

    await this.run(operationId, async (transaction, markProofComplete) => {
      const context = await transaction.lockPasswordResetContext(tokenHash);
      if (!this.validResetContext(context, now)) {
        throw new AdminC2HttpError(operationId, 'ADMIN_RECOVERY_INVALID', 'RECORD_SECURITY_EVENT', {
          auditContext: { action: operationId, subjectRefHash: tokenHash },
        });
      }
      markProofComplete();
      await transaction.consumePasswordReset(context!, passwordHash, now);
      await transaction.insertAudit({
        action: operationId,
        actorAdminUserId: context!.adminUserId,
        adminPasswordResetContextId: context!.contextId,
        context: 'ADMIN_RECOVERY',
        entityId: context!.adminUserId,
        entityType: 'ADMIN_USER',
        eventClass: 'LOGIN',
        id: randomUUID(),
        maskedAfter: { authorizationVersion: context!.userAuthorizationVersion + 1 },
        maskedBefore: { authorizationVersion: context!.userAuthorizationVersion },
        outcome: 'SUCCESS',
        reasonCode: 'ACCOUNT_RECOVERY',
        requestId: execution.requestId,
        subjectAdminUserId: context!.adminUserId,
      });
    });
  }

  async createInvitation(
    authorization: string | undefined,
    idempotencyKey: string,
    input: AdminInvitationCreateInput,
    execution: Readonly<{ requestId: string }>,
    now = new Date(),
  ): Promise<AdminInvitationProjection> {
    const operationId = 'createAdminInvitation';
    const proof = await this.verifyBearer(operationId, authorization, now);
    const requestDigest = this.securityCrypto.canonicalDigest('CREATE_ADMIN_INVITATION_V1', [
      ['email', input.emailCanonical],
      ['role', input.role],
      ['reasonCode', input.reasonCode],
      ['operatorReason', input.operatorReason],
    ]);
    const invitationId = randomUUID();

    const result = await this.run(operationId, async (transaction, markProofComplete) => {
      const principal = await this.authorize(
        transaction,
        operationId,
        proof,
        ['SUPER_ADMIN'],
        now,
        'INVITATION',
        {
          entityId: invitationId,
          entityType: 'ADMIN_INVITATION',
          operatorReason: input.operatorReason,
          reasonCode: input.reasonCode,
          requestId: execution.requestId,
        },
        markProofComplete,
      );
      if (principal instanceof AdminC2DurableRejection) return principal;
      await transaction.lockIdempotencyKey(
        principal.adminUserId,
        'CREATE_ADMIN_INVITATION',
        idempotencyKey,
      );
      const priorIdempotency = await transaction.lockIdempotency(
        principal.adminUserId,
        'CREATE_ADMIN_INVITATION',
        idempotencyKey,
      );
      if (priorIdempotency !== undefined) {
        if (priorIdempotency.requestDigest !== requestDigest) {
          await this.insertRejectedAudit(
            transaction,
            principal,
            operationId,
            { ...input, requestId: execution.requestId },
            {
              entityId: priorIdempotency.resourceId,
              entityType: 'ADMIN_INVITATION',
              failureCode: 'IDEMPOTENCY_CONFLICT',
            },
          );
          return new AdminC2DurableRejection(
            new AdminC2HttpError(operationId, 'IDEMPOTENCY_CONFLICT', 'ALREADY_DURABLE'),
          );
        }
        const prior = await transaction.lockInvitation(priorIdempotency.resourceId);
        if (prior === undefined) {
          throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'NONE_AFTER_PROOF');
        }
        return { created: false as const, projection: this.invitationProjection(prior) };
      }
      let invitationPreparation:
        | Readonly<{
            auditId: string;
            codeHash: string;
            deliveryEmailEncrypted: string;
            encrypted: Awaited<ReturnType<AdminSecurityCrypto['encryptOutboxPayload']>>;
            expiresAt: Date;
            outboxId: string;
          }>
        | undefined;
      try {
        await this.requireNotification(operationId);
        const auditId = randomUUID();
        const outboxId = randomUUID();
        const code = this.securityCrypto.randomCode(32);
        const codeHash = this.securityCrypto.sha256(code);
        const expiresAt = new Date(now.getTime() + INVITATION_MILLISECONDS);
        const encrypted = await this.securityCrypto.encryptOutboxPayload(
          {
            generation: 1,
            logicalDeliveryId: outboxId,
            outboxId,
            purpose: 'INVITATION',
            sourceId: auditId,
          },
          { code, email: input.deliveryEmail },
        );
        invitationPreparation = {
          auditId,
          codeHash,
          deliveryEmailEncrypted: JSON.stringify(encrypted),
          encrypted,
          expiresAt,
          outboxId,
        };
      } catch {
        await this.insertRejectedAudit(
          transaction,
          principal,
          operationId,
          { ...input, requestId: execution.requestId },
          {
            entityId: invitationId,
            entityType: 'ADMIN_INVITATION',
            failureCode: 'DEPENDENCY_UNAVAILABLE',
          },
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'ALREADY_DURABLE'),
        );
      }
      const { auditId, codeHash, deliveryEmailEncrypted, encrypted, expiresAt, outboxId } =
        invitationPreparation;
      if ((await transaction.lockAdminUserByEmail(input.emailCanonical)) !== undefined) {
        await this.insertRejectedAudit(
          transaction,
          principal,
          operationId,
          { ...input, requestId: execution.requestId },
          {
            entityId: invitationId,
            entityType: 'ADMIN_INVITATION',
            failureCode: 'RESOURCE_CONFLICT',
          },
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'IDEMPOTENCY_CONFLICT', 'ALREADY_DURABLE'),
        );
      }
      const replaced = await transaction.lockPendingInvitationByEmail(input.emailCanonical);
      if (replaced !== undefined) {
        await transaction.revokeInvitation(replaced.id, replaced.outboxId, now);
      }
      const audit: AdminC2AuditInsert = {
        action: operationId,
        actorAdminUserId: principal.adminUserId,
        adminInvitationId: invitationId,
        adminSessionId: principal.sessionId,
        context: 'ADMIN_SESSION' as const,
        entityId: invitationId,
        entityType: 'ADMIN_INVITATION',
        eventClass: 'BUSINESS' as const,
        id: auditId,
        maskedAfter: { emailCanonical: input.emailCanonical, role: input.role, state: 'PENDING' },
        operatorReason: input.operatorReason,
        outcome: 'SUCCESS' as const,
        reasonCode: input.reasonCode,
        requestId: execution.requestId,
      };
      await transaction.insertInvitation({
        audit,
        codeHash,
        deliveryEmailEncrypted,
        emailCanonical: input.emailCanonical,
        encrypted,
        expiresAt,
        invitationId,
        outboxId,
        proposedRole: input.role,
        ...(replaced === undefined
          ? {}
          : { replacedInvitationId: replaced.id, replacedOutboxId: replaced.outboxId }),
      });
      await transaction.insertIdempotency({
        adminUserId: principal.adminUserId,
        id: randomUUID(),
        idempotencyKey,
        operation: 'CREATE_ADMIN_INVITATION',
        requestDigest,
        resourceId: invitationId,
        resourceType: 'ADMIN_INVITATION',
        responseCode: 201,
      });
      return {
        created: true as const,
        outboxId,
        projection: {
          email: input.emailCanonical,
          expiresAt: expiresAt.toISOString(),
          invitationId,
          role: input.role,
          status: 'PENDING' as const,
        },
      };
    });
    if (result.created) this.signalNotification(result.outboxId);
    return result.projection;
  }

  async acceptInvitation(
    input: AdminInvitationAcceptInput,
    execution: Readonly<{ ipAddress: string; requestId: string }>,
    now = new Date(),
  ): Promise<{
    challengeId: string;
    csrfToken: string;
    expiresAt: string;
    nextStep: 'FIRST_TOTP_ENROLLMENT';
    preAuthToken: string;
  }> {
    const operationId = 'acceptAdminInvitation';
    const codeHash = this.securityCrypto.sha256(input.invitationCode);
    await this.consumeRecoveryRateLimit(operationId, execution.ipAddress, codeHash);
    const preliminary = await this.run(operationId, (transaction) =>
      transaction.lockInvitationByCodeHash(codeHash),
    );
    if (!this.validInvitation(preliminary, now)) {
      throw new AdminC2HttpError(operationId, 'ADMIN_INVITATION_INVALID', 'RECORD_SECURITY_EVENT', {
        auditContext: { action: operationId, subjectRefHash: codeHash },
      });
    }
    const binding = this.securityCrypto.passwordBinding(input.password);
    let passwordHash: string;
    try {
      const result = await this.checkPasswordCompromise(input.password);
      if (result === 'COMPROMISED') {
        throw new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'RECORD_SECURITY_EVENT', {
          auditContext: { action: operationId, subjectRefHash: codeHash },
        });
      }
      passwordHash = await this.authCrypto.hashPassword(input.password);
    } catch (error: unknown) {
      if (error instanceof AdminC2HttpError) throw error;
      throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'RECORD_SECURITY_EVENT', {
        auditContext: { action: operationId, subjectRefHash: codeHash },
      });
    }
    if (!this.securityCrypto.bindingMatches(input.password, binding)) {
      throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'RECORD_SECURITY_EVENT');
    }
    const preAuthToken = this.authCrypto.randomOpaqueToken();
    let csrfToken: string;
    try {
      csrfToken = await this.requestPolicy.issueCsrfToken('PREAUTH', preAuthToken);
    } catch (error: unknown) {
      if (error instanceof AdminRequestPolicyError) {
        throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'RECORD_SECURITY_EVENT');
      }
      throw error;
    }
    const preAuthId = randomUUID();
    const userId = randomUUID();
    const expiresAt = new Date(now.getTime() + PREAUTH_MILLISECONDS);
    await this.run(operationId, async (transaction) => {
      const invitation = await transaction.lockInvitationByCodeHash(codeHash);
      if (
        !this.validInvitation(invitation, now) ||
        invitation!.id !== preliminary!.id ||
        (await transaction.lockAdminUserByEmail(invitation!.emailCanonical)) !== undefined
      ) {
        throw new AdminC2HttpError(
          operationId,
          'ADMIN_INVITATION_INVALID',
          'RECORD_SECURITY_EVENT',
          { auditContext: { action: operationId, subjectRefHash: codeHash } },
        );
      }
      await transaction.acceptInvitation({
        invitation: invitation!,
        now,
        passwordHash,
        preAuthExpiresAt: expiresAt,
        preAuthId,
        preAuthTokenHash: sha256(preAuthToken),
        requestId: execution.requestId,
        securityEventId: randomUUID(),
        userId,
      });
    });
    return {
      challengeId: preAuthId,
      csrfToken,
      expiresAt: expiresAt.toISOString(),
      nextStep: 'FIRST_TOTP_ENROLLMENT',
      preAuthToken,
    };
  }

  async createRecoveryCase(
    authorization: string | undefined,
    idempotencyKey: string,
    input: AdminRecoveryCaseCreateInput,
    execution: Readonly<{ requestId: string }>,
    now = new Date(),
  ): Promise<AdminRecoveryCaseProjection> {
    const operationId = 'createAdminRecoveryCase';
    const proof = await this.verifyBearer(operationId, authorization, now);
    const caseId = randomUUID();
    const auditId = randomUUID();
    const expiresAt = new Date(now.getTime() + INVITATION_MILLISECONDS);
    const requestDigest = this.securityCrypto.canonicalDigest('CREATE_ADMIN_RECOVERY_CASE_V1', [
      ['subjectAdminUserId', input.subjectAdminUserId],
      ['reasonCode', input.reasonCode],
      ['operatorReason', input.operatorReason],
    ]);
    return this.run(operationId, async (transaction, markProofComplete) => {
      const principal = await this.authorize(
        transaction,
        operationId,
        proof,
        ['SUPER_ADMIN', 'SUPPORT'],
        now,
        undefined,
        {
          entityId: caseId,
          entityType: 'ADMIN_RECOVERY_CASE',
          operatorReason: input.operatorReason,
          reasonCode: input.reasonCode,
          requestId: execution.requestId,
          subjectAdminUserId: input.subjectAdminUserId,
        },
        markProofComplete,
      );
      if (principal instanceof AdminC2DurableRejection) return principal;
      await transaction.lockIdempotencyKey(
        principal.adminUserId,
        'CREATE_ADMIN_RECOVERY_CASE',
        idempotencyKey,
      );
      const prior = await transaction.lockIdempotency(
        principal.adminUserId,
        'CREATE_ADMIN_RECOVERY_CASE',
        idempotencyKey,
      );
      if (prior !== undefined) {
        if (prior.requestDigest !== requestDigest) {
          await this.rejectMutation(
            transaction,
            principal,
            operationId,
            input,
            execution.requestId,
            'IDEMPOTENCY_CONFLICT',
            'ADMIN_RECOVERY_CASE',
            prior.resourceId,
            input.subjectAdminUserId,
          );
          return new AdminC2DurableRejection(
            new AdminC2HttpError(operationId, 'IDEMPOTENCY_CONFLICT', 'ALREADY_DURABLE'),
          );
        }
        const replay = await transaction.lockRecoveryCase(prior.resourceId);
        if (replay === undefined) {
          throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'NONE_AFTER_PROOF');
        }
        return this.recoveryProjection(replay);
      }
      const subject = await transaction.lockAdminUser(input.subjectAdminUserId);
      if (
        subject === undefined ||
        subject.status !== 'ACTIVE' ||
        subject.id === principal.adminUserId
      ) {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'VALIDATION_ERROR',
          'ADMIN_RECOVERY_CASE',
          caseId,
          subject === undefined ? undefined : input.subjectAdminUserId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE'),
        );
      }
      const replaced = await transaction.lockPendingRecoveryCaseBySubject(subject.id);
      await transaction.insertAudit({
        action: operationId,
        actorAdminUserId: principal.adminUserId,
        adminRecoveryCaseId: caseId,
        adminSessionId: principal.sessionId,
        context: 'ADMIN_SESSION',
        entityId: caseId,
        entityType: 'ADMIN_RECOVERY_CASE',
        eventClass: 'BUSINESS',
        id: auditId,
        maskedAfter: { state: 'PENDING', subjectAdminUserId: subject.id },
        operatorReason: input.operatorReason,
        outcome: 'SUCCESS',
        reasonCode: input.reasonCode,
        requestId: execution.requestId,
        subjectAdminUserId: subject.id,
      });
      if (replaced !== undefined) await transaction.markRecoveryCaseCancelled(replaced, now);
      await transaction.insertRecoveryCase({
        creatorAdminUserId: principal.adminUserId,
        expiresAt,
        id: caseId,
        subjectAdminUserId: subject.id,
      });
      if (replaced !== undefined) {
        await transaction.insertRecoveryCancellationAudit(
          replaced,
          auditId,
          principal.adminUserId,
          execution.requestId,
        );
      }
      await transaction.insertIdempotency({
        adminUserId: principal.adminUserId,
        id: randomUUID(),
        idempotencyKey,
        operation: 'CREATE_ADMIN_RECOVERY_CASE',
        requestDigest,
        resourceId: caseId,
        resourceType: 'ADMIN_RECOVERY_CASE',
        responseCode: 201,
      });
      return {
        approverAdminUserId: null,
        caseId,
        createdAt: now.toISOString(),
        creatorAdminUserId: principal.adminUserId,
        expiresAt: expiresAt.toISOString(),
        state: 'PENDING',
        subjectAdminUserId: subject.id,
      };
    });
  }

  async approveRecoveryCase(
    authorization: string | undefined,
    idempotencyKey: string,
    caseId: string,
    input: AdminReasonInput,
    execution: Readonly<{ requestId: string }>,
    now = new Date(),
  ): Promise<void> {
    const operationId = 'approveAdminRecoveryCase';
    const proof = await this.verifyBearer(operationId, authorization, now);
    const requestDigest = this.securityCrypto.canonicalDigest('APPROVE_ADMIN_RECOVERY_CASE_V1', [
      ['caseId', caseId],
      ['reasonCode', input.reasonCode],
      ['operatorReason', input.operatorReason],
    ]);
    await this.run(operationId, async (transaction, markProofComplete) => {
      const principal = await this.authorize(
        transaction,
        operationId,
        proof,
        ['SUPER_ADMIN'],
        now,
        'RECOVERY_APPROVAL',
        {
          entityId: caseId,
          entityType: 'ADMIN_RECOVERY_CASE',
          operatorReason: input.operatorReason,
          reasonCode: input.reasonCode,
          requestId: execution.requestId,
        },
        markProofComplete,
      );
      if (principal instanceof AdminC2DurableRejection) return principal;
      await transaction.lockIdempotencyKey(
        principal.adminUserId,
        'APPROVE_ADMIN_RECOVERY_CASE',
        idempotencyKey,
      );
      const prior = await transaction.lockIdempotency(
        principal.adminUserId,
        'APPROVE_ADMIN_RECOVERY_CASE',
        idempotencyKey,
      );
      if (prior !== undefined) {
        if (prior.requestDigest === requestDigest) return;
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'IDEMPOTENCY_CONFLICT',
          'ADMIN_RECOVERY_CASE',
          caseId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'IDEMPOTENCY_CONFLICT', 'ALREADY_DURABLE'),
        );
      }
      const recoveryCase = await transaction.lockRecoveryCase(caseId);
      if (recoveryCase === undefined) {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'RESOURCE_NOT_FOUND',
          'ADMIN_RECOVERY_CASE',
          caseId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'RECOVERY_CASE_NOT_FOUND', 'ALREADY_DURABLE'),
        );
      }
      const subject = await transaction.lockAdminUser(recoveryCase.subjectAdminUserId);
      if (recoveryCase.expiresAt <= now || recoveryCase.state === 'EXPIRED') {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'RESOURCE_EXPIRED',
          'ADMIN_RECOVERY_CASE',
          caseId,
          recoveryCase.subjectAdminUserId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'RECOVERY_CASE_EXPIRED', 'ALREADY_DURABLE'),
        );
      }
      if (
        recoveryCase.state !== 'PENDING' ||
        recoveryCase.creatorAdminUserId === principal.adminUserId ||
        recoveryCase.subjectAdminUserId === principal.adminUserId
      ) {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'RESOURCE_CONFLICT',
          'ADMIN_RECOVERY_CASE',
          caseId,
          recoveryCase.subjectAdminUserId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'RECOVERY_CASE_CONFLICT', 'ALREADY_DURABLE'),
        );
      }
      if (subject === undefined || subject.status !== 'ACTIVE') {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'VALIDATION_ERROR',
          'ADMIN_RECOVERY_CASE',
          caseId,
          recoveryCase.subjectAdminUserId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE'),
        );
      }
      await transaction.approveRecoveryCase(recoveryCase, principal.adminUserId, now);
      await transaction.insertAudit({
        action: operationId,
        actorAdminUserId: principal.adminUserId,
        adminRecoveryCaseId: caseId,
        adminSessionId: principal.sessionId,
        context: 'ADMIN_SESSION',
        entityId: caseId,
        entityType: 'ADMIN_RECOVERY_CASE',
        eventClass: 'BUSINESS',
        id: randomUUID(),
        maskedAfter: { state: 'APPROVED' },
        maskedBefore: { state: 'PENDING' },
        operatorReason: input.operatorReason,
        outcome: 'SUCCESS',
        reasonCode: input.reasonCode,
        requestId: execution.requestId,
        subjectAdminUserId: recoveryCase.subjectAdminUserId,
      });
      await transaction.insertIdempotency({
        adminUserId: principal.adminUserId,
        id: randomUUID(),
        idempotencyKey,
        operation: 'APPROVE_ADMIN_RECOVERY_CASE',
        requestDigest,
        resourceId: caseId,
        resourceType: 'ADMIN_RECOVERY_CASE',
        responseCode: 204,
      });
      return undefined;
    });
  }

  async changeUserRole(
    authorization: string | undefined,
    idempotencyKey: string,
    adminUserId: string,
    input: AdminRoleChangeInput,
    execution: Readonly<{ requestId: string }>,
    now = new Date(),
  ): Promise<void> {
    return this.changeUserAccess(
      'changeAdminUserRole',
      authorization,
      idempotencyKey,
      adminUserId,
      input,
      execution,
      now,
    );
  }

  async changeUserStatus(
    authorization: string | undefined,
    idempotencyKey: string,
    adminUserId: string,
    input: AdminStatusChangeInput,
    execution: Readonly<{ requestId: string }>,
    now = new Date(),
  ): Promise<void> {
    return this.changeUserAccess(
      'changeAdminUserStatus',
      authorization,
      idempotencyKey,
      adminUserId,
      input,
      execution,
      now,
    );
  }

  async listRecoveryCases(
    authorization: string | undefined,
    input: AdminPaginationInput,
    now = new Date(),
  ): Promise<AdminPage<AdminRecoveryCaseProjection>> {
    return this.listSnapshot(
      'LIST_ADMIN_RECOVERY_CASES',
      authorization,
      input,
      ['SUPER_ADMIN', 'SUPPORT'],
      now,
    );
  }

  async listUsers(
    authorization: string | undefined,
    input: AdminPaginationInput,
    now = new Date(),
  ): Promise<AdminPage<AdminUserProjection>> {
    return this.listSnapshot('LIST_ADMIN_USERS', authorization, input, ['SUPER_ADMIN'], now);
  }

  async getRecoveryCase(
    authorization: string | undefined,
    caseId: string,
    now = new Date(),
  ): Promise<AdminRecoveryCaseProjection> {
    const operationId = 'getAdminRecoveryCase';
    const proof = await this.verifyBearer(operationId, authorization, now);
    return this.run(operationId, async (transaction, markProofComplete) => {
      await this.authorize(
        transaction,
        operationId,
        proof,
        ['SUPER_ADMIN', 'SUPPORT'],
        now,
        undefined,
        undefined,
        markProofComplete,
      );
      const row = await transaction.getRecoveryCaseProjection(caseId);
      if (row === undefined) {
        throw new AdminC2HttpError(operationId, 'RECOVERY_CASE_NOT_FOUND', 'NONE_AFTER_PROOF');
      }
      return transaction.mapRecoveryCase(row);
    });
  }

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
    transaction: AdminSecurityTransactionRepository,
    operationId: AdminC2OperationId,
    proof: AdminC2BearerProof,
    roles: readonly AdminRole[],
    now: Date,
    requiredStepUp?: AdminStepUpPurpose,
    rejection?: Readonly<{
      entityId: string;
      entityType: string;
      operatorReason: string;
      reasonCode: Parameters<AdminSecurityTransactionRepository['insertAudit']>[0]['reasonCode'];
      requestId: string;
      subjectAdminUserId?: string;
    }>,
    markProofComplete?: () => void,
  ): Promise<AdminC2LockedPrincipal | AdminC2DurableRejection> {
    const principal = await transaction.lockPrincipal(proof.adminUserId, proof.sessionId);
    if (principal === undefined || !proofMatches(principal, proof, now, undefined)) {
      throw new AdminC2HttpError(operationId, 'AUTH_REQUIRED', 'RECORD_SECURITY_EVENT');
    }
    markProofComplete?.();
    const auditContext = {
      action: operationId,
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
    } as const;
    if (!roles.includes(principal.role)) {
      if (rejection !== undefined && this.isMutatingOperation(operationId)) {
        await this.insertRejectedAudit(transaction, principal, operationId, rejection, {
          entityId: rejection.entityId,
          entityType: rejection.entityType,
          failureCode: 'FORBIDDEN',
          ...(rejection.subjectAdminUserId === undefined
            ? {}
            : { subjectAdminUserId: rejection.subjectAdminUserId }),
        });
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'FORBIDDEN', 'ALREADY_DURABLE', { auditContext }),
        );
      }
      throw new AdminC2HttpError(operationId, 'FORBIDDEN', 'NONE_AFTER_PROOF', { auditContext });
    }
    if (requiredStepUp !== undefined && !proofMatches(principal, proof, now, requiredStepUp)) {
      if (rejection !== undefined && this.isMutatingOperation(operationId)) {
        const failureCode =
          principal.stepUpPurpose === null
            ? 'STEP_UP_REQUIRED'
            : principal.stepUpExpiresAt === null || principal.stepUpExpiresAt <= now
              ? 'STEP_UP_EXPIRED'
              : 'STEP_UP_INVALID';
        await this.insertRejectedAudit(transaction, principal, operationId, rejection, {
          entityId: rejection.entityId,
          entityType: rejection.entityType,
          failureCode,
          ...(rejection.subjectAdminUserId === undefined
            ? {}
            : { subjectAdminUserId: rejection.subjectAdminUserId }),
        });
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'FORBIDDEN', 'ALREADY_DURABLE', { auditContext }),
        );
      }
      throw new AdminC2HttpError(operationId, 'FORBIDDEN', 'NONE_AFTER_PROOF', { auditContext });
    }
    return principal;
  }

  private isMutatingOperation(
    operationId: AdminC2OperationId,
  ): operationId is
    | 'createAdminRecoveryCase'
    | 'approveAdminRecoveryCase'
    | 'createAdminInvitation'
    | 'changeAdminUserRole'
    | 'changeAdminUserStatus' {
    return [
      'createAdminRecoveryCase',
      'approveAdminRecoveryCase',
      'createAdminInvitation',
      'changeAdminUserRole',
      'changeAdminUserStatus',
    ].includes(operationId);
  }

  private validResetContext(
    context: AdminPasswordResetContextRecord | undefined,
    now: Date,
  ): context is AdminPasswordResetContextRecord {
    return (
      context !== undefined &&
      context.consumedAt === null &&
      context.revokedAt === null &&
      context.requestRevokedAt === null &&
      context.expiresAt > now &&
      context.requestExpiresAt > now &&
      context.authorizationVersion === context.userAuthorizationVersion &&
      context.userStatus === 'ACTIVE'
    );
  }

  private recoveryProjection(
    recoveryCase: Parameters<AdminSecurityTransactionRepository['cancelRecoveryCase']>[0],
  ): AdminRecoveryCaseProjection {
    return {
      approverAdminUserId: recoveryCase.approverAdminUserId,
      caseId: recoveryCase.id,
      createdAt: recoveryCase.createdAt.toISOString(),
      creatorAdminUserId: recoveryCase.creatorAdminUserId,
      expiresAt: recoveryCase.expiresAt.toISOString(),
      state: recoveryCase.state,
      subjectAdminUserId: recoveryCase.subjectAdminUserId,
    };
  }

  private async rejectMutation(
    transaction: AdminSecurityTransactionRepository,
    principal: AdminC2LockedPrincipal,
    operationId: Extract<
      AdminC2OperationId,
      | 'createAdminRecoveryCase'
      | 'approveAdminRecoveryCase'
      | 'createAdminInvitation'
      | 'changeAdminUserRole'
      | 'changeAdminUserStatus'
    >,
    reason: AdminReasonInput,
    requestId: string,
    failureCode: NonNullable<AdminC2AuditInsert['failureCode']>,
    entityType: string,
    entityId: string,
    subjectAdminUserId?: string,
  ): Promise<void> {
    await this.insertRejectedAudit(
      transaction,
      principal,
      operationId,
      { ...reason, requestId },
      {
        entityId,
        entityType,
        failureCode,
        ...(subjectAdminUserId === undefined ? {} : { subjectAdminUserId }),
      },
    );
  }

  private async changeUserAccess(
    operationId: 'changeAdminUserRole' | 'changeAdminUserStatus',
    authorization: string | undefined,
    idempotencyKey: string,
    adminUserId: string,
    input: AdminRoleChangeInput | AdminStatusChangeInput,
    execution: Readonly<{ requestId: string }>,
    now: Date,
  ): Promise<void> {
    const proof = await this.verifyBearer(operationId, authorization, now);
    const isRole = operationId === 'changeAdminUserRole';
    const targetValue = isRole
      ? (input as AdminRoleChangeInput).role
      : (input as AdminStatusChangeInput).status;
    const requestDigest = this.securityCrypto.canonicalDigest(
      isRole ? 'CHANGE_ADMIN_USER_ROLE_V1' : 'CHANGE_ADMIN_USER_STATUS_V1',
      [
        ['adminUserId', adminUserId],
        [isRole ? 'role' : 'status', targetValue],
        ['reasonCode', input.reasonCode],
        ['operatorReason', input.operatorReason],
      ],
    );
    await this.run(operationId, async (transaction, markProofComplete) => {
      const activeSuperAdmins = await transaction.lockActiveSuperAdmins();
      const principal = await this.authorize(
        transaction,
        operationId,
        proof,
        ['SUPER_ADMIN'],
        now,
        isRole ? 'ROLE_CHANGE' : 'STATUS_CHANGE',
        {
          entityId: adminUserId,
          entityType: 'ADMIN_USER',
          operatorReason: input.operatorReason,
          reasonCode: input.reasonCode,
          requestId: execution.requestId,
          subjectAdminUserId: adminUserId,
        },
        markProofComplete,
      );
      if (principal instanceof AdminC2DurableRejection) return principal;
      const idempotencyOperation = isRole ? 'CHANGE_ADMIN_USER_ROLE' : 'CHANGE_ADMIN_USER_STATUS';
      await transaction.lockIdempotencyKey(
        principal.adminUserId,
        idempotencyOperation,
        idempotencyKey,
      );
      const prior = await transaction.lockIdempotency(
        principal.adminUserId,
        idempotencyOperation,
        idempotencyKey,
      );
      if (prior !== undefined) {
        if (prior.requestDigest === requestDigest) return;
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'IDEMPOTENCY_CONFLICT',
          'ADMIN_USER',
          adminUserId,
          adminUserId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'IDEMPOTENCY_CONFLICT', 'ALREADY_DURABLE'),
        );
      }
      const target =
        activeSuperAdmins.find((candidate) => candidate.id === adminUserId) ??
        (await transaction.lockAdminUser(adminUserId));
      if (target === undefined) {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'RESOURCE_NOT_FOUND',
          'ADMIN_USER',
          adminUserId,
          adminUserId,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'ADMIN_USER_NOT_FOUND', 'ALREADY_DURABLE'),
        );
      }
      if (target.id === principal.adminUserId) {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'FORBIDDEN',
          'ADMIN_USER',
          target.id,
          target.id,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'FORBIDDEN', 'ALREADY_DURABLE'),
        );
      }
      const allowedStatusTransition =
        !isRole &&
        ((target.status === 'ACTIVE' && ['SUSPENDED', 'DISABLED'].includes(targetValue)) ||
          (target.status === 'SUSPENDED' && ['ACTIVE', 'DISABLED'].includes(targetValue)));
      const valid = isRole
        ? ['ACTIVE', 'SUSPENDED'].includes(target.status) && target.role !== targetValue
        : allowedStatusTransition;
      if (!valid) {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'VALIDATION_ERROR',
          'ADMIN_USER',
          target.id,
          target.id,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE'),
        );
      }
      const removesActiveSuperAdmin =
        target.role === 'SUPER_ADMIN' &&
        target.status === 'ACTIVE' &&
        ((isRole && targetValue !== 'SUPER_ADMIN') || (!isRole && targetValue !== 'ACTIVE'));
      if (removesActiveSuperAdmin && activeSuperAdmins.length <= 1) {
        await this.rejectMutation(
          transaction,
          principal,
          operationId,
          input,
          execution.requestId,
          'RESOURCE_CONFLICT',
          'ADMIN_USER',
          target.id,
          target.id,
        );
        return new AdminC2DurableRejection(
          new AdminC2HttpError(operationId, 'LAST_SUPER_ADMIN_PROTECTED', 'ALREADY_DURABLE'),
        );
      }
      const auditId = randomUUID();
      await transaction.insertAudit({
        action: operationId,
        actorAdminUserId: principal.adminUserId,
        adminSessionId: principal.sessionId,
        context: 'ADMIN_SESSION',
        entityId: target.id,
        entityType: 'ADMIN_USER',
        eventClass: 'BUSINESS',
        id: auditId,
        maskedAfter: isRole ? { role: targetValue } : { status: targetValue },
        maskedBefore: isRole ? { role: target.role } : { status: target.status },
        operatorReason: input.operatorReason,
        outcome: 'SUCCESS',
        reasonCode: input.reasonCode,
        requestId: execution.requestId,
        subjectAdminUserId: target.id,
      });
      if (isRole) {
        await transaction.changeAdminUserRole(target.id, targetValue as AdminRole, now);
      } else {
        await transaction.changeAdminUserStatus(
          target.id,
          targetValue as AdminStatusChangeInput['status'],
          now,
        );
      }
      const pendingRecovery = await transaction.lockPendingRecoveryCaseBySubject(target.id);
      if (pendingRecovery !== undefined) {
        await transaction.cancelRecoveryCase(
          pendingRecovery,
          auditId,
          principal.adminUserId,
          execution.requestId,
          now,
        );
      }
      await transaction.insertIdempotency({
        adminUserId: principal.adminUserId,
        id: randomUUID(),
        idempotencyKey,
        operation: idempotencyOperation,
        requestDigest,
        resourceId: target.id,
        resourceType: 'ADMIN_USER',
        responseCode: 204,
      });
      return undefined;
    });
  }

  private validInvitation(
    invitation: AdminInvitationRecord | undefined,
    now: Date,
  ): invitation is AdminInvitationRecord {
    return (
      invitation !== undefined &&
      invitation.state === 'PENDING' &&
      invitation.acceptedAdminUserId === null &&
      invitation.revokedAt === null &&
      invitation.expiresAt > now
    );
  }

  private invitationProjection(invitation: AdminInvitationRecord): AdminInvitationProjection {
    return {
      email: invitation.emailCanonical,
      expiresAt: invitation.expiresAt.toISOString(),
      invitationId: invitation.id,
      role: invitation.proposedRole,
      status: 'PENDING',
    };
  }

  private async consumeRecoveryRateLimit(
    operationId: AdminC2OperationId,
    ipAddress: string,
    subject: string,
  ): Promise<void> {
    try {
      const decision = await this.rateLimiter.consume('RECOVERY', ipAddress, subject);
      if (!decision.allowed) {
        throw new AdminC2HttpError(operationId, 'RATE_LIMITED', 'RECORD_SECURITY_EVENT', {
          retryAfterSeconds: decision.retryAfterSeconds,
        });
      }
    } catch (error: unknown) {
      if (error instanceof AdminC2HttpError) throw error;
      if (error instanceof AdminRateLimitUnavailableError) {
        throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'RECORD_SECURITY_EVENT');
      }
      throw error;
    }
  }

  private async requireNotification(operationId: AdminC2OperationId): Promise<void> {
    try {
      await Promise.all([
        this.notification.assertConfigured(),
        this.securityCrypto.assertOutboxAvailable(),
      ]);
    } catch (error: unknown) {
      if (
        error instanceof AdminNotificationUnavailableError ||
        error instanceof AdminSecurityOutboxKeyringUnavailableError
      ) {
        throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'RECORD_SECURITY_EVENT');
      }
      throw error;
    }
  }

  private async recordResetRejection(
    tokenHash: string,
    expected: AdminPasswordResetContextRecord,
    requestId: string,
    failureCode: 'VALIDATION_ERROR' | 'DEPENDENCY_UNAVAILABLE' | 'INTEGRITY_REJECTED',
    now: Date,
  ): Promise<void> {
    await this.run('resetAdminPassword', async (transaction, markProofComplete) => {
      const context = await transaction.lockPasswordResetContext(tokenHash);
      if (
        !this.validResetContext(context, now) ||
        context!.contextId !== expected.contextId ||
        context!.adminUserId !== expected.adminUserId ||
        context!.passwordResetRequestId !== expected.passwordResetRequestId
      ) {
        throw new AdminC2HttpError(
          'resetAdminPassword',
          'ADMIN_RECOVERY_INVALID',
          'RECORD_SECURITY_EVENT',
          { auditContext: { action: 'resetAdminPassword', subjectRefHash: tokenHash } },
        );
      }
      markProofComplete();
      await transaction.insertAudit({
        action: 'resetAdminPassword',
        actorAdminUserId: context!.adminUserId,
        adminPasswordResetContextId: context!.contextId,
        context: 'ADMIN_RECOVERY',
        entityId: context!.adminUserId,
        entityType: 'ADMIN_USER',
        eventClass: 'LOGIN',
        failureCode,
        id: randomUUID(),
        outcome: 'REJECTED',
        reasonCode: 'ACCOUNT_RECOVERY',
        requestId,
        subjectAdminUserId: context!.adminUserId,
      });
    });
  }

  private async insertRejectedAudit(
    transaction: AdminSecurityTransactionRepository,
    principal: AdminC2LockedPrincipal,
    operationId: Extract<
      AdminC2OperationId,
      | 'createAdminRecoveryCase'
      | 'approveAdminRecoveryCase'
      | 'createAdminInvitation'
      | 'changeAdminUserRole'
      | 'changeAdminUserStatus'
    >,
    reason: Readonly<{
      operatorReason: string;
      reasonCode: Parameters<AdminSecurityTransactionRepository['insertAudit']>[0]['reasonCode'];
      requestId: string;
    }>,
    rejection: Readonly<{
      entityId: string;
      entityType: string;
      failureCode: NonNullable<
        Parameters<AdminSecurityTransactionRepository['insertAudit']>[0]['failureCode']
      >;
      subjectAdminUserId?: string;
    }>,
  ): Promise<void> {
    await transaction.insertAudit({
      action: operationId,
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
      context: 'ADMIN_SESSION',
      entityId: rejection.entityId,
      entityType: rejection.entityType,
      eventClass: 'BUSINESS',
      failureCode: rejection.failureCode,
      id: randomUUID(),
      operatorReason: reason.operatorReason,
      outcome: 'REJECTED',
      reasonCode: reason.reasonCode,
      requestId: reason.requestId,
      ...(rejection.subjectAdminUserId === undefined
        ? {}
        : { subjectAdminUserId: rejection.subjectAdminUserId }),
    });
  }

  private async listSnapshot<T extends AdminRecoveryCaseProjection | AdminUserProjection>(
    operation: AdminSnapshotOperation,
    authorization: string | undefined,
    input: AdminPaginationInput,
    roles: readonly AdminRole[],
    now: Date,
  ): Promise<AdminPage<T>> {
    const operationId = operationForSnapshot(operation);
    const proof = await this.verifyBearer(operationId, authorization, now);
    const filtersDigest = sha256(`KORA_ADMIN_C2_FILTERS_V1\0${operation}\0NO_FILTERS`);
    let page: MaterializedPage<T>;

    if (input.cursor === undefined) {
      page = await this.run(operationId, async (transaction, markProofComplete) => {
        await this.authorize(
          transaction,
          operationId,
          proof,
          roles,
          now,
          undefined,
          undefined,
          markProofComplete,
        );
        const rows =
          operation === 'LIST_ADMIN_RECOVERY_CASES'
            ? await transaction.listRecoveryCaseProjections(SNAPSHOT_MAXIMUM_ENTRIES + 1)
            : await transaction.listAdminUserProjections(SNAPSHOT_MAXIMUM_ENTRIES + 1);
        if (rows.length > SNAPSHOT_MAXIMUM_ENTRIES) {
          throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'NONE_AFTER_PROOF');
        }
        const projections = rows.map((row) =>
          operation === 'LIST_ADMIN_RECOVERY_CASES'
            ? transaction.mapRecoveryCase(
                row as Parameters<AdminSecurityTransactionRepository['mapRecoveryCase']>[0],
              )
            : transaction.mapAdminUser(
                row as Parameters<AdminSecurityTransactionRepository['mapAdminUser']>[0],
              ),
        ) as T[];
        const serialized = projections.map((projection, ordinal) => {
          const projectionJson = JSON.stringify(projection);
          return {
            ordinal,
            projectionJson,
            resourceId:
              'caseId' in projection
                ? projection.caseId
                : (projection as AdminUserProjection).adminUserId,
            sourceCreatedAt: rows[ordinal]!.createdAt,
            utf8Bytes: Buffer.byteLength(projectionJson, 'utf8'),
          };
        });
        const utf8Bytes = serialized.reduce((total, item) => total + item.utf8Bytes, 0);
        if (utf8Bytes > SNAPSHOT_MAXIMUM_UTF8_BYTES) {
          throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'NONE_AFTER_PROOF');
        }
        const snapshotId = randomUUID();
        const expiresAt = new Date(now.getTime() + SNAPSHOT_MILLISECONDS);
        await transaction.insertSnapshot({
          expiresAt,
          filtersDigest,
          id: snapshotId,
          items: serialized,
          operation,
          principalAdminUserId: proof.adminUserId,
          projectionVersion: SNAPSHOT_PROJECTION_VERSION,
          utf8Bytes,
        });
        return {
          entryCount: projections.length,
          expiresAt,
          items: projections.slice(0, input.limit),
          nextOrdinal: Math.min(input.limit, projections.length),
          snapshotId,
        };
      });
    } else {
      let cursor: AdminSnapshotCursor;
      try {
        cursor = await this.pagination.verify(
          input.cursor,
          { filtersDigest, operation, principalAdminUserId: proof.adminUserId },
          now,
        );
      } catch (error: unknown) {
        if (error instanceof AdminSecurityPaginationError) {
          throw new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'RECORD_SECURITY_EVENT');
        }
        throw error;
      }
      page = await this.run(operationId, async (transaction, markProofComplete) => {
        await this.authorize(
          transaction,
          operationId,
          proof,
          roles,
          now,
          undefined,
          undefined,
          markProofComplete,
        );
        const snapshot = await transaction.loadSnapshot(cursor.snapshotId);
        if (
          snapshot === undefined ||
          snapshot.principalAdminUserId !== proof.adminUserId ||
          snapshot.operation !== operation ||
          snapshot.filtersDigest !== filtersDigest ||
          snapshot.projectionVersion !== SNAPSHOT_PROJECTION_VERSION ||
          snapshot.expiresAt <= now ||
          snapshot.expiresAt.toISOString() !== cursor.expiresAt
        ) {
          throw new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'NONE_AFTER_PROOF');
        }
        const rows = await transaction.loadSnapshotPage(
          snapshot.id,
          cursor.nextOrdinal,
          input.limit,
        );
        let items: T[];
        try {
          items = rows.map((row) => JSON.parse(row.projectionJson) as T);
        } catch {
          throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'NONE_AFTER_PROOF');
        }
        return {
          entryCount: snapshot.entryCount,
          expiresAt: snapshot.expiresAt,
          items,
          nextOrdinal: cursor.nextOrdinal + items.length,
          snapshotId: snapshot.id,
        };
      });
    }

    const hasMore = page.nextOrdinal < page.entryCount;
    const nextCursor = hasMore
      ? await this.pagination.issue({
          expiresAt: page.expiresAt.toISOString(),
          filtersDigest,
          nextOrdinal: page.nextOrdinal,
          operation,
          principalAdminUserId: proof.adminUserId,
          snapshotId: page.snapshotId,
        })
      : null;
    return { data: page.items, meta: { hasMore, nextCursor } };
  }

  private async run<T>(
    operationId: AdminC2OperationId,
    callback: (
      transaction: AdminSecurityTransactionRepository,
      markProofComplete: () => void,
    ) => Promise<T | AdminC2DurableRejection>,
  ): Promise<T> {
    let proofComplete = false;
    try {
      const result = await this.repository.transaction((transaction) =>
        callback(transaction, () => {
          proofComplete = true;
        }),
      );
      if (result instanceof AdminC2DurableRejection) throw result.error;
      return result;
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
  }

  private signalNotification(outboxId: string): void {
    void this.notificationWakeup.notify(outboxId).catch(() => undefined);
  }

  private async checkPasswordCompromise(password: string): Promise<'SAFE' | 'COMPROMISED'> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new AdminPasswordCompromiseUnavailableError());
      }, 3_000);
    });
    const check = this.passwordCompromise.checkPassword(password, {
      signal: controller.signal,
      timeoutMs: 3_000,
    });
    return Promise.race([check, deadline]).finally(() => {
      if (timeout !== undefined) clearTimeout(timeout);
    });
  }
}
