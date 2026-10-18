-- S1.2-03C2a foundations. C1 migrations and historical rows remain immutable.
-- This directory name is the literal final migration name authorized by the CTO.

DO $email_collision_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."AdminUser"
    GROUP BY pg_catalog.translate(
      "email",
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz'
    )
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'C2a migration refused case-insensitive AdminUser email collisions';
  END IF;
END;
$email_collision_preflight$;

CREATE UNIQUE INDEX "AdminUser_email_login_ci_key"
  ON public."AdminUser" ((pg_catalog.translate(
    "email",
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  )));

CREATE TYPE "AdminAuditOutcome" AS ENUM ('SUCCESS', 'REJECTED');
CREATE TYPE "AdminAuditFailureCode" AS ENUM (
  'FORBIDDEN',
  'STEP_UP_REQUIRED',
  'STEP_UP_EXPIRED',
  'STEP_UP_INVALID',
  'INTEGRITY_REJECTED',
  'DEPENDENCY_UNAVAILABLE',
  'VALIDATION_ERROR',
  'IDEMPOTENCY_CONFLICT',
  'RESOURCE_NOT_FOUND',
  'RESOURCE_CONFLICT',
  'RESOURCE_EXPIRED',
  'PROJECTION_BUDGET_EXCEEDED'
);
CREATE TYPE "AdminRecoveryCaseState" AS ENUM (
  'PENDING',
  'APPROVED',
  'CANCELLED',
  'EXPIRED'
);
CREATE TYPE "AdminInvitationState" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED'
);
CREATE TYPE "AdminNotificationPurpose" AS ENUM ('PASSWORD_RESET', 'INVITATION');
CREATE TYPE "AdminNotificationState" AS ENUM (
  'PENDING',
  'CLAIMED',
  'DELIVERED',
  'FAILED',
  'DELIVERY_UNCERTAIN',
  'CANCELLED'
);
CREATE TYPE "AdminSnapshotOperation" AS ENUM (
  'LIST_ADMIN_RECOVERY_CASES',
  'LIST_ADMIN_USERS',
  'LIST_ADMIN_AUDIT_LOGS'
);
CREATE TYPE "AdminC2IdempotencyOperation" AS ENUM (
  'CREATE_ADMIN_RECOVERY_CASE',
  'APPROVE_ADMIN_RECOVERY_CASE',
  'CREATE_ADMIN_AUDIT_LOG_EXPORT',
  'CREATE_ADMIN_INVITATION',
  'CHANGE_ADMIN_USER_ROLE',
  'CHANGE_ADMIN_USER_STATUS'
);

ALTER TABLE public."AdminSecurityEvent"
  ADD COLUMN "entityType" TEXT,
  ADD COLUMN "entityId" TEXT,
  ADD COLUMN "adminInvitationId" TEXT;

ALTER TABLE public."AdminUser"
  ADD COLUMN "c2aInvitationCreatedXid" BIGINT;

ALTER TABLE public."AuditLog"
  ADD COLUMN "adminPasswordResetContextId" TEXT,
  ADD COLUMN "outcome" "AdminAuditOutcome",
  ADD COLUMN "failureCode" "AdminAuditFailureCode",
  ADD COLUMN "causationSecurityEventId" TEXT,
  ADD COLUMN "adminRecoveryCaseId" TEXT,
  ADD COLUMN "adminInvitationId" TEXT,
  ADD COLUMN "notificationOutboxId" TEXT,
  ADD COLUMN "bootstrapGuardId" TEXT;

CREATE TABLE public."AdminPasswordResetRequest" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "securityEventId" TEXT NOT NULL,
  "replacedRequestId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPasswordResetRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AdminPasswordResetContext" (
  "id" TEXT NOT NULL,
  "passwordResetRequestId" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "authorizationVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPasswordResetContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AdminRecoveryCase" (
  "id" TEXT NOT NULL,
  "subjectAdminUserId" TEXT NOT NULL,
  "creatorAdminUserId" TEXT NOT NULL,
  "approverAdminUserId" TEXT,
  "state" "AdminRecoveryCaseState" NOT NULL DEFAULT 'PENDING',
  "stateGeneration" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRecoveryCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AdminInvitation" (
  "id" TEXT NOT NULL,
  "emailCanonical" TEXT NOT NULL,
  "deliveryEmailEncrypted" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "proposedRole" "AdminRole" NOT NULL,
  "creatorAdminUserId" TEXT NOT NULL,
  "createdByAuditLogId" TEXT NOT NULL,
  "acceptedAdminUserId" TEXT,
  "replacedInvitationId" TEXT,
  "state" "AdminInvitationState" NOT NULL DEFAULT 'PENDING',
  "stateGeneration" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AdminNotificationOutbox" (
  "id" TEXT NOT NULL,
  "purpose" "AdminNotificationPurpose" NOT NULL,
  "state" "AdminNotificationState" NOT NULL DEFAULT 'PENDING',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "encryptedPayload" TEXT NOT NULL,
  "encryptionKeyId" TEXT NOT NULL,
  "encryptionNonce" TEXT NOT NULL,
  "encryptionTag" TEXT NOT NULL,
  "aadHash" TEXT NOT NULL,
  "sourceSecurityEventId" TEXT,
  "sourceAuditLogId" TEXT,
  "passwordResetRequestId" TEXT,
  "adminInvitationId" TEXT,
  "replacedOutboxId" TEXT,
  "claimOwnerHash" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "providerAcknowledgementHash" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "uncertainAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminNotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AdminPaginationSnapshot" (
  "id" TEXT NOT NULL,
  "principalAdminUserId" TEXT NOT NULL,
  "operation" "AdminSnapshotOperation" NOT NULL,
  "filtersDigest" TEXT NOT NULL,
  "projectionVersion" INTEGER NOT NULL,
  "entryCount" INTEGER NOT NULL,
  "utf8Bytes" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminPaginationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."AdminPaginationSnapshotItem" (
  "snapshotId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "resourceId" TEXT NOT NULL,
  "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
  "projectionJson" TEXT NOT NULL,
  "utf8Bytes" INTEGER NOT NULL,
  CONSTRAINT "AdminPaginationSnapshotItem_pkey" PRIMARY KEY ("snapshotId", "ordinal")
);

CREATE TABLE public."AdminBootstrapGuard" (
  "singletonKey" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "bootstrapAuditLogId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminBootstrapGuard_pkey" PRIMARY KEY ("singletonKey")
);

CREATE TABLE public."AdminC2IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "operation" "AdminC2IdempotencyOperation" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "responseCode" INTEGER NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "generation" BIGINT NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminC2IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminPasswordResetRequest_id_adminUserId_key"
  ON public."AdminPasswordResetRequest" ("id", "adminUserId");
CREATE UNIQUE INDEX "AdminPasswordResetRequest_securityEventId_key"
  ON public."AdminPasswordResetRequest" ("securityEventId");
CREATE UNIQUE INDEX "AdminPasswordResetRequest_replacedRequestId_key"
  ON public."AdminPasswordResetRequest" ("replacedRequestId");
CREATE INDEX "AdminPasswordResetRequest_adminUserId_createdAt_idx"
  ON public."AdminPasswordResetRequest" ("adminUserId", "createdAt");
CREATE INDEX "AdminPasswordResetRequest_expiresAt_idx"
  ON public."AdminPasswordResetRequest" ("expiresAt");
CREATE UNIQUE INDEX "AdminPasswordResetRequest_one_unrevoked_admin_key"
  ON public."AdminPasswordResetRequest" ("adminUserId")
  WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "AdminPasswordResetRequest_securityEventId_id_key"
  ON public."AdminPasswordResetRequest" ("securityEventId", "id");

CREATE UNIQUE INDEX "AdminPasswordResetContext_passwordResetRequestId_key"
  ON public."AdminPasswordResetContext" ("passwordResetRequestId");
CREATE UNIQUE INDEX "AdminPasswordResetContext_tokenHash_key"
  ON public."AdminPasswordResetContext" ("tokenHash");
CREATE UNIQUE INDEX "AdminPasswordResetContext_id_adminUserId_key"
  ON public."AdminPasswordResetContext" ("id", "adminUserId");
CREATE UNIQUE INDEX "AdminPasswordResetContext_passwordResetRequestId_adminUserId_key"
  ON public."AdminPasswordResetContext" ("passwordResetRequestId", "adminUserId");
CREATE INDEX "AdminPasswordResetContext_adminUserId_expiresAt_idx"
  ON public."AdminPasswordResetContext" ("adminUserId", "expiresAt");

CREATE INDEX "AdminRecoveryCase_subjectAdminUserId_createdAt_idx"
  ON public."AdminRecoveryCase" ("subjectAdminUserId", "createdAt");
CREATE INDEX "AdminRecoveryCase_state_expiresAt_idx"
  ON public."AdminRecoveryCase" ("state", "expiresAt");
CREATE UNIQUE INDEX "AdminRecoveryCase_one_pending_subject_key"
  ON public."AdminRecoveryCase" ("subjectAdminUserId")
  WHERE "state" = 'PENDING';

CREATE UNIQUE INDEX "AdminInvitation_codeHash_key"
  ON public."AdminInvitation" ("codeHash");
CREATE UNIQUE INDEX "AdminInvitation_createdByAuditLogId_key"
  ON public."AdminInvitation" ("createdByAuditLogId");
CREATE UNIQUE INDEX "AdminInvitation_acceptedAdminUserId_key"
  ON public."AdminInvitation" ("acceptedAdminUserId");
CREATE UNIQUE INDEX "AdminInvitation_replacedInvitationId_key"
  ON public."AdminInvitation" ("replacedInvitationId");
CREATE INDEX "AdminInvitation_emailCanonical_createdAt_idx"
  ON public."AdminInvitation" ("emailCanonical", "createdAt");
CREATE INDEX "AdminInvitation_state_expiresAt_idx"
  ON public."AdminInvitation" ("state", "expiresAt");
CREATE UNIQUE INDEX "AdminInvitation_one_pending_email_key"
  ON public."AdminInvitation" ("emailCanonical")
  WHERE "state" = 'PENDING';
CREATE UNIQUE INDEX "AdminInvitation_createdByAuditLogId_id_key"
  ON public."AdminInvitation" ("createdByAuditLogId", "id");

CREATE UNIQUE INDEX "AdminNotificationOutbox_passwordResetRequestId_key"
  ON public."AdminNotificationOutbox" ("passwordResetRequestId");
CREATE UNIQUE INDEX "AdminNotificationOutbox_adminInvitationId_key"
  ON public."AdminNotificationOutbox" ("adminInvitationId");
CREATE UNIQUE INDEX "AdminNotificationOutbox_replacedOutboxId_key"
  ON public."AdminNotificationOutbox" ("replacedOutboxId");
CREATE INDEX "AdminNotificationOutbox_state_nextAttemptAt_createdAt_idx"
  ON public."AdminNotificationOutbox" ("state", "nextAttemptAt", "createdAt");

CREATE INDEX "AdminPaginationSnapshot_principalAdminUserId_operation_createdAt_idx"
  ON public."AdminPaginationSnapshot" ("principalAdminUserId", "operation", "createdAt");
CREATE INDEX "AdminPaginationSnapshot_expiresAt_idx"
  ON public."AdminPaginationSnapshot" ("expiresAt");
CREATE UNIQUE INDEX "AdminPaginationSnapshotItem_snapshotId_resourceId_key"
  ON public."AdminPaginationSnapshotItem" ("snapshotId", "resourceId");

CREATE UNIQUE INDEX "AdminBootstrapGuard_adminUserId_key"
  ON public."AdminBootstrapGuard" ("adminUserId");
CREATE UNIQUE INDEX "AdminBootstrapGuard_bootstrapAuditLogId_key"
  ON public."AdminBootstrapGuard" ("bootstrapAuditLogId");

CREATE UNIQUE INDEX "AdminC2IdempotencyRecord_key_generation_key"
  ON public."AdminC2IdempotencyRecord" (
    "adminUserId", "operation", "idempotencyKey", "generation"
  );
CREATE INDEX "AdminC2IdempotencyRecord_active_lookup_idx"
  ON public."AdminC2IdempotencyRecord" (
    "adminUserId", "operation", "idempotencyKey", "expiresAt", "generation"
  );
CREATE INDEX "AdminC2IdempotencyRecord_expiresAt_idx"
  ON public."AdminC2IdempotencyRecord" ("expiresAt");

CREATE INDEX "AdminSecurityEvent_entityType_entityId_createdAt_idx"
  ON public."AdminSecurityEvent" ("entityType", "entityId", "createdAt");
CREATE UNIQUE INDEX "AdminSecurityEvent_id_entityId_key"
  ON public."AdminSecurityEvent" ("id", "entityId");
CREATE INDEX "AuditLog_causationSecurityEventId_idx"
  ON public."AuditLog" ("causationSecurityEventId");
CREATE UNIQUE INDEX "AuditLog_id_entityId_key"
  ON public."AuditLog" ("id", "entityId");
CREATE UNIQUE INDEX "AuditLog_notificationOutboxId_action_key"
  ON public."AuditLog" ("notificationOutboxId", "action")
  WHERE "notificationOutboxId" IS NOT NULL;
CREATE UNIQUE INDEX "AuditLog_systemExecutionRefHash_action_key"
  ON public."AuditLog" ("systemExecutionRefHash", "action")
  WHERE "version" = 3;
CREATE UNIQUE INDEX "AuditLog_recovery_terminal_action_key"
  ON public."AuditLog" ("adminRecoveryCaseId", "action")
  WHERE "action" IN ('cancelAdminRecoveryCase', 'expireAdminRecoveryCase');

ALTER TABLE public."AdminPasswordResetRequest"
  ADD CONSTRAINT "AdminPasswordResetRequest_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminPasswordResetRequest_securityEventId_fkey"
    FOREIGN KEY ("securityEventId") REFERENCES public."AdminSecurityEvent"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminPasswordResetRequest_securityEventId_id_fkey"
    FOREIGN KEY ("securityEventId", "id")
    REFERENCES public."AdminSecurityEvent"("id", "entityId")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminPasswordResetRequest_replacedRequestId_fkey"
    FOREIGN KEY ("replacedRequestId") REFERENCES public."AdminPasswordResetRequest"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."AdminPasswordResetContext"
  ADD CONSTRAINT "AdminPasswordResetContext_passwordResetRequestId_adminUserId_fkey"
    FOREIGN KEY ("passwordResetRequestId", "adminUserId")
    REFERENCES public."AdminPasswordResetRequest"("id", "adminUserId")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminPasswordResetContext_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."AdminRecoveryCase"
  ADD CONSTRAINT "AdminRecoveryCase_subjectAdminUserId_fkey"
    FOREIGN KEY ("subjectAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminRecoveryCase_creatorAdminUserId_fkey"
    FOREIGN KEY ("creatorAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminRecoveryCase_approverAdminUserId_fkey"
    FOREIGN KEY ("approverAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."AdminInvitation"
  ADD CONSTRAINT "AdminInvitation_creatorAdminUserId_fkey"
    FOREIGN KEY ("creatorAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminInvitation_createdByAuditLogId_fkey"
    FOREIGN KEY ("createdByAuditLogId") REFERENCES public."AuditLog"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminInvitation_createdByAuditLogId_id_fkey"
    FOREIGN KEY ("createdByAuditLogId", "id")
    REFERENCES public."AuditLog"("id", "entityId")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminInvitation_acceptedAdminUserId_fkey"
    FOREIGN KEY ("acceptedAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminInvitation_replacedInvitationId_fkey"
    FOREIGN KEY ("replacedInvitationId") REFERENCES public."AdminInvitation"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."AdminNotificationOutbox"
  ADD CONSTRAINT "AdminNotificationOutbox_sourceSecurityEventId_fkey"
    FOREIGN KEY ("sourceSecurityEventId") REFERENCES public."AdminSecurityEvent"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminNotificationOutbox_sourceAuditLogId_fkey"
    FOREIGN KEY ("sourceAuditLogId") REFERENCES public."AuditLog"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminNotificationOutbox_passwordResetRequestId_fkey"
    FOREIGN KEY ("passwordResetRequestId") REFERENCES public."AdminPasswordResetRequest"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminNotificationOutbox_reset_source_binding_fkey"
    FOREIGN KEY ("sourceSecurityEventId", "passwordResetRequestId")
    REFERENCES public."AdminPasswordResetRequest"("securityEventId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminNotificationOutbox_adminInvitationId_fkey"
    FOREIGN KEY ("adminInvitationId") REFERENCES public."AdminInvitation"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminNotificationOutbox_invitation_source_binding_fkey"
    FOREIGN KEY ("sourceAuditLogId", "adminInvitationId")
    REFERENCES public."AdminInvitation"("createdByAuditLogId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminNotificationOutbox_replacedOutboxId_fkey"
    FOREIGN KEY ("replacedOutboxId") REFERENCES public."AdminNotificationOutbox"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."AdminPaginationSnapshot"
  ADD CONSTRAINT "AdminPaginationSnapshot_principalAdminUserId_fkey"
    FOREIGN KEY ("principalAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."AdminPaginationSnapshotItem"
  ADD CONSTRAINT "AdminPaginationSnapshotItem_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES public."AdminPaginationSnapshot"("id")
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE public."AdminBootstrapGuard"
  ADD CONSTRAINT "AdminBootstrapGuard_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AdminBootstrapGuard_bootstrapAuditLogId_fkey"
    FOREIGN KEY ("bootstrapAuditLogId") REFERENCES public."AuditLog"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."AdminPasswordResetRequest"
  ADD CONSTRAINT "AdminPasswordResetRequest_state_check" CHECK (
    "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '15 minutes'
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    AND "replacedRequestId" IS DISTINCT FROM "id"
  );

ALTER TABLE public."AdminPasswordResetContext"
  ADD CONSTRAINT "AdminPasswordResetContext_state_check" CHECK (
    "tokenHash" ~ '^[a-f0-9]{64}$'
    AND "authorizationVersion" >= 1
    AND "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '15 minutes'
    AND ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    AND NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
  );

ALTER TABLE public."AdminRecoveryCase"
  ADD CONSTRAINT "AdminRecoveryCase_state_check" CHECK (
    "creatorAdminUserId" <> "subjectAdminUserId"
    AND "stateGeneration" >= 1
    AND "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '24 hours'
    AND (
      (
        "state" = 'PENDING'
        AND "approverAdminUserId" IS NULL
        AND "approvedAt" IS NULL
        AND "cancelledAt" IS NULL
        AND "expiredAt" IS NULL
      )
      OR (
        "state" = 'APPROVED'
        AND "approverAdminUserId" IS NOT NULL
        AND "approverAdminUserId" <> "creatorAdminUserId"
        AND "approverAdminUserId" <> "subjectAdminUserId"
        AND "approvedAt" IS NOT NULL
        AND "cancelledAt" IS NULL
        AND "expiredAt" IS NULL
      )
      OR (
        "state" = 'CANCELLED'
        AND "approverAdminUserId" IS NULL
        AND "approvedAt" IS NULL
        AND "cancelledAt" IS NOT NULL
        AND "expiredAt" IS NULL
      )
      OR (
        "state" = 'EXPIRED'
        AND "approverAdminUserId" IS NULL
        AND "approvedAt" IS NULL
        AND "cancelledAt" IS NULL
        AND "expiredAt" IS NOT NULL
      )
    )
  );

ALTER TABLE public."AdminInvitation"
  ADD CONSTRAINT "AdminInvitation_state_check" CHECK (
    length("emailCanonical") BETWEEN 3 AND 254
    AND "emailCanonical" = pg_catalog.translate(
      "emailCanonical",
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz'
    )
    AND "emailCanonical" ~ '^[a-z0-9.!#$%&''*+/=?^_{}|~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    AND length("deliveryEmailEncrypted") > 0
    AND "codeHash" ~ '^[a-f0-9]{64}$'
    AND "stateGeneration" >= 1
    AND "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '24 hours'
    AND "replacedInvitationId" IS DISTINCT FROM "id"
    AND (
      (
        "state" = 'PENDING'
        AND "acceptedAdminUserId" IS NULL
        AND "acceptedAt" IS NULL
        AND "revokedAt" IS NULL
        AND "expiredAt" IS NULL
      )
      OR (
        "state" = 'ACCEPTED'
        AND "acceptedAdminUserId" IS NOT NULL
        AND "acceptedAt" IS NOT NULL
        AND "revokedAt" IS NULL
        AND "expiredAt" IS NULL
      )
      OR (
        "state" = 'REVOKED'
        AND "acceptedAdminUserId" IS NULL
        AND "acceptedAt" IS NULL
        AND "revokedAt" IS NOT NULL
        AND "expiredAt" IS NULL
      )
      OR (
        "state" = 'EXPIRED'
        AND "acceptedAdminUserId" IS NULL
        AND "acceptedAt" IS NULL
        AND "revokedAt" IS NULL
        AND "expiredAt" IS NOT NULL
      )
    )
  );

ALTER TABLE public."AdminNotificationOutbox"
  ADD CONSTRAINT "AdminNotificationOutbox_state_check" CHECK (
    "generation" >= 1
    AND "attemptCount" >= 0
    AND length("encryptedPayload") > 0
    AND length("encryptionKeyId") BETWEEN 1 AND 128
    AND length("encryptionNonce") > 0
    AND length("encryptionTag") > 0
    AND "aadHash" ~ '^[a-f0-9]{64}$'
    AND ("claimOwnerHash" IS NULL OR "claimOwnerHash" ~ '^[a-f0-9]{64}$')
    AND (
      "providerAcknowledgementHash" IS NULL
      OR "providerAcknowledgementHash" ~ '^[a-f0-9]{64}$'
    )
    AND "replacedOutboxId" IS DISTINCT FROM "id"
    AND (
      (
        "purpose" = 'PASSWORD_RESET'
        AND "sourceSecurityEventId" IS NOT NULL
        AND "sourceAuditLogId" IS NULL
        AND "passwordResetRequestId" IS NOT NULL
        AND "adminInvitationId" IS NULL
      )
      OR (
        "purpose" = 'INVITATION'
        AND "sourceSecurityEventId" IS NULL
        AND "sourceAuditLogId" IS NOT NULL
        AND "passwordResetRequestId" IS NULL
        AND "adminInvitationId" IS NOT NULL
      )
    )
    AND (
      (
        "state" = 'PENDING'
        AND "claimOwnerHash" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "deliveredAt" IS NULL
        AND "failedAt" IS NULL
        AND "uncertainAt" IS NULL
        AND "cancelledAt" IS NULL
      )
      OR (
        "state" = 'CLAIMED'
        AND "claimOwnerHash" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "leaseExpiresAt" > "createdAt"
        AND "deliveredAt" IS NULL
        AND "failedAt" IS NULL
        AND "uncertainAt" IS NULL
        AND "cancelledAt" IS NULL
      )
      OR (
        "state" = 'DELIVERED'
        AND "claimOwnerHash" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "providerAcknowledgementHash" IS NOT NULL
        AND "deliveredAt" IS NOT NULL
        AND "failedAt" IS NULL
        AND "uncertainAt" IS NULL
        AND "cancelledAt" IS NULL
      )
      OR (
        "state" = 'FAILED'
        AND "claimOwnerHash" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "deliveredAt" IS NULL
        AND "failedAt" IS NOT NULL
        AND "uncertainAt" IS NULL
        AND "cancelledAt" IS NULL
      )
      OR (
        "state" = 'DELIVERY_UNCERTAIN'
        AND "claimOwnerHash" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "deliveredAt" IS NULL
        AND "failedAt" IS NULL
        AND "uncertainAt" IS NOT NULL
        AND "cancelledAt" IS NULL
      )
      OR (
        "state" = 'CANCELLED'
        AND "claimOwnerHash" IS NULL
        AND "leaseExpiresAt" IS NULL
        AND "deliveredAt" IS NULL
        AND "failedAt" IS NULL
        AND "uncertainAt" IS NULL
        AND "cancelledAt" IS NOT NULL
      )
    )
  );

ALTER TABLE public."AdminPaginationSnapshot"
  ADD CONSTRAINT "AdminPaginationSnapshot_bounds_check" CHECK (
    "filtersDigest" ~ '^[a-f0-9]{64}$'
    AND "projectionVersion" >= 1
    AND "entryCount" BETWEEN 0 AND 10000
    AND "utf8Bytes" BETWEEN 0 AND 26214400
    AND "expiresAt" > "createdAt"
    AND "expiresAt" <= "createdAt" + INTERVAL '15 minutes'
  );
ALTER TABLE public."AdminPaginationSnapshotItem"
  ADD CONSTRAINT "AdminPaginationSnapshotItem_bounds_check" CHECK (
    "ordinal" >= 0
    AND length("resourceId") > 0
    AND "utf8Bytes" = pg_catalog.octet_length("projectionJson")
  );

ALTER TABLE public."AdminBootstrapGuard"
  ADD CONSTRAINT "AdminBootstrapGuard_singleton_check"
  CHECK ("singletonKey" = 'ADMIN_BOOTSTRAP_V1');

ALTER TABLE public."AdminC2IdempotencyRecord"
  ADD CONSTRAINT "AdminC2IdempotencyRecord_window_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 255
    AND "requestDigest" ~ '^[a-f0-9]{64}$'
    AND "responseCode" BETWEEN 200 AND 599
    AND length("resourceType") BETWEEN 1 AND 120
    AND length("resourceId") > 0
    AND "generation" >= 1
    AND "expiresAt" = "createdAt" + INTERVAL '24 hours'
  );

ALTER TABLE public."AdminSecurityEvent"
  ADD CONSTRAINT "AdminSecurityEvent_c2_entity_check" CHECK (
    ("entityType" IS NULL) = ("entityId" IS NULL)
    AND (
      "adminInvitationId" IS NULL
      OR ("entityType" = 'ADMIN_INVITATION' AND "entityId" = "adminInvitationId")
    )
    AND (
      "action" <> 'requestAdminPasswordReset'
      OR "outcome" = 'FAILED'
      OR ("entityType" = 'ADMIN_PASSWORD_RESET_REQUEST' AND "entityId" IS NOT NULL)
    )
  );

ALTER TABLE public."AuditLog"
  DROP CONSTRAINT "AuditLog_version_check",
  DROP CONSTRAINT "AuditLog_v2_context_check";

ALTER TABLE public."AuditLog"
  ADD CONSTRAINT "AuditLog_version_check" CHECK ("version" IN (1, 2, 3)),
  ADD CONSTRAINT "AuditLog_versioned_context_check" CHECK (
    (
      "version" = 1
      AND "eventClass" IS NULL
      AND "context" IS NULL
      AND "subjectAdminUserId" IS NULL
      AND "delegatedByAdminUserId" IS NULL
      AND "adminRecoveryContextId" IS NULL
      AND "adminPasswordResetContextId" IS NULL
      AND "systemExecutionRefHash" IS NULL
      AND "reasonCode" IS NULL
      AND "operatorReason" IS NULL
      AND "causationEventId" IS NULL
      AND "causationSecurityEventId" IS NULL
      AND "outcome" IS NULL
      AND "failureCode" IS NULL
      AND "adminRecoveryCaseId" IS NULL
      AND "adminInvitationId" IS NULL
      AND "notificationOutboxId" IS NULL
      AND "bootstrapGuardId" IS NULL
    )
    OR (
      "version" = 2
      AND "eventClass" IS NOT NULL
      AND "context" IS NOT NULL
      AND "reasonCode" IS NOT NULL
      AND ("operatorReason" IS NULL OR length("operatorReason") BETWEEN 3 AND 500)
      AND ("context" <> 'SYSTEM' OR "operatorReason" IS NULL)
      AND ("systemExecutionRefHash" IS NULL OR "systemExecutionRefHash" ~ '^[a-f0-9]{64}$')
      AND "causationEventId" IS DISTINCT FROM "id"
      AND "adminPasswordResetContextId" IS NULL
      AND "causationSecurityEventId" IS NULL
      AND "outcome" IS NULL
      AND "failureCode" IS NULL
      AND "adminRecoveryCaseId" IS NULL
      AND "adminInvitationId" IS NULL
      AND "notificationOutboxId" IS NULL
      AND "bootstrapGuardId" IS NULL
      AND (
        (
          "context" = 'ADMIN_SESSION'
          AND "adminUserId" IS NOT NULL
          AND "adminSessionId" IS NOT NULL
          AND "adminRecoveryContextId" IS NULL
          AND "systemExecutionRefHash" IS NULL
          AND "delegatedByAdminUserId" IS NULL
        )
        OR (
          "context" = 'ADMIN_RECOVERY'
          AND "adminUserId" IS NOT NULL
          AND "adminSessionId" IS NULL
          AND "adminRecoveryContextId" IS NOT NULL
          AND "systemExecutionRefHash" IS NULL
          AND "delegatedByAdminUserId" IS NULL
        )
        OR (
          "context" = 'SYSTEM'
          AND "adminUserId" IS NULL
          AND "adminSessionId" IS NULL
          AND "adminRecoveryContextId" IS NULL
          AND "systemExecutionRefHash" IS NOT NULL
          AND (
            ("delegatedByAdminUserId" IS NULL AND "causationEventId" IS NULL)
            OR ("delegatedByAdminUserId" IS NOT NULL AND "causationEventId" IS NOT NULL)
          )
        )
      )
    )
    OR (
      "version" = 3
      AND "eventClass" IS NOT NULL
      AND "context" IS NOT NULL
      AND "reasonCode" IS NOT NULL
      AND "reason" = 'C2_RUNTIME'
      AND "outcome" IS NOT NULL
      AND (
        ("outcome" = 'SUCCESS' AND "failureCode" IS NULL)
        OR ("outcome" = 'REJECTED' AND "failureCode" IS NOT NULL)
      )
      AND ("operatorReason" IS NULL OR length("operatorReason") BETWEEN 3 AND 500)
      AND ("context" <> 'SYSTEM' OR "operatorReason" IS NULL)
      AND (
        "systemExecutionRefHash" IS NULL
        OR "systemExecutionRefHash" ~ '^[a-f0-9]{64}$'
      )
      AND "causationEventId" IS DISTINCT FROM "id"
      AND (
        (
          "context" = 'ADMIN_SESSION'
          AND "adminUserId" IS NOT NULL
          AND "adminSessionId" IS NOT NULL
          AND "adminRecoveryContextId" IS NULL
          AND "adminPasswordResetContextId" IS NULL
          AND "systemExecutionRefHash" IS NULL
          AND "delegatedByAdminUserId" IS NULL
          AND "causationEventId" IS NULL
          AND "causationSecurityEventId" IS NULL
        )
        OR (
          "context" = 'ADMIN_RECOVERY'
          AND "adminUserId" IS NOT NULL
          AND "adminSessionId" IS NULL
          AND (("adminRecoveryContextId" IS NULL) <> ("adminPasswordResetContextId" IS NULL))
          AND "systemExecutionRefHash" IS NULL
          AND "delegatedByAdminUserId" IS NULL
          AND "causationEventId" IS NULL
          AND "causationSecurityEventId" IS NULL
        )
        OR (
          "context" = 'SYSTEM'
          AND "adminUserId" IS NULL
          AND "adminSessionId" IS NULL
          AND "adminRecoveryContextId" IS NULL
          AND "adminPasswordResetContextId" IS NULL
          AND "systemExecutionRefHash" IS NOT NULL
          AND (
            (
              "delegatedByAdminUserId" IS NULL
              AND "causationEventId" IS NULL
              AND "causationSecurityEventId" IS NULL
            )
            OR (
              "delegatedByAdminUserId" IS NOT NULL
              AND "causationEventId" IS NOT NULL
              AND "causationSecurityEventId" IS NULL
            )
            OR (
              "delegatedByAdminUserId" IS NULL
              AND "causationEventId" IS NULL
              AND "causationSecurityEventId" IS NOT NULL
            )
          )
        )
      )
      AND (
        "action" <> 'resetAdminPassword'
        OR (
          "context" = 'ADMIN_RECOVERY'
          AND "adminPasswordResetContextId" IS NOT NULL
          AND "adminRecoveryContextId" IS NULL
        )
      )
      AND ("notificationOutboxId" IS NULL OR "context" = 'SYSTEM')
      AND ("bootstrapGuardId" IS NULL OR "context" = 'SYSTEM')
    )
  );

CREATE OR REPLACE FUNCTION public.kora_guard_admin_user_c1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  table_owner NAME;
BEGIN
  IF NEW."c2aInvitationCreatedXid" IS DISTINCT FROM OLD."c2aInvitationCreatedXid" THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminUser C2a invitation creation provenance is immutable';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(class_entry.relowner)
    INTO table_owner
  FROM pg_catalog.pg_class AS class_entry
  WHERE class_entry.oid = TG_RELID;

  IF NEW."lastAcceptedTotpCounter" IS DISTINCT FROM OLD."lastAcceptedTotpCounter"
     AND (
       NEW."lastAcceptedTotpCounter" IS NULL
       OR (
         OLD."lastAcceptedTotpCounter" IS NOT NULL
         AND NEW."lastAcceptedTotpCounter" <= OLD."lastAcceptedTotpCounter"
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminUser TOTP counter must increase strictly';
  END IF;

  IF NEW."authorizationVersion" < OLD."authorizationVersion"
     OR NEW."authorizationVersion" > OLD."authorizationVersion" + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminUser authorization version transition is invalid';
  END IF;

  IF ROW(NEW."status", NEW."totpSecretEncrypted", NEW."totpEnabledAt")
       IS DISTINCT FROM
     ROW(OLD."status", OLD."totpSecretEncrypted", OLD."totpEnabledAt")
     AND NOT (
       NEW."status" IS NOT DISTINCT FROM OLD."status"
       AND NEW."totpEnabledAt" IS NOT DISTINCT FROM OLD."totpEnabledAt"
       AND NEW."totpSecretEncrypted" IS DISTINCT FROM OLD."totpSecretEncrypted"
       AND NEW."lastAcceptedTotpCounter" IS DISTINCT FROM OLD."lastAcceptedTotpCounter"
       AND NEW."authorizationVersion" = OLD."authorizationVersion"
     )
     AND NEW."authorizationVersion" <> OLD."authorizationVersion" + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminUser security changes require one authorization version increment';
  END IF;

  IF current_user = 'kora_admin_c2a_writer' THEN
    IF ROW(NEW."passwordHash", NEW."role", NEW."status",
           NEW."totpSecretEncrypted", NEW."totpEnabledAt")
         IS DISTINCT FROM
       ROW(OLD."passwordHash", OLD."role", OLD."status",
           OLD."totpSecretEncrypted", OLD."totpEnabledAt")
       AND NEW."authorizationVersion" <> OLD."authorizationVersion" + 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminUser C2 security changes require one authorization version increment';
    END IF;
    IF NEW."status" = 'ACTIVE'
       AND (NEW."totpSecretEncrypted" IS NULL OR NEW."totpEnabledAt" IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminUser ACTIVE status requires an established TOTP factor';
    END IF;
  ELSIF current_user <> table_owner THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
       AND NOT COALESCE((
         (OLD."status" = 'ACTIVE' AND NEW."status" = 'PENDING_MFA')
         OR (OLD."status" = 'PENDING_MFA' AND NEW."status" = 'ACTIVE')
       ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminUser status transition is outside C1';
    END IF;
    IF OLD."totpSecretEncrypted" IS NOT NULL
       AND NEW."totpSecretEncrypted" IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminUser C1 cannot clear an established TOTP factor';
    END IF;
    IF NEW."status" = 'ACTIVE'
       AND (NEW."totpSecretEncrypted" IS NULL OR NEW."totpEnabledAt" IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminUser ACTIVE status requires an established TOTP factor';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.kora_enforce_audit_log_v2_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user IN (
    'kora_admin_c2a_writer',
    'kora_admin_c2a_notification_worker',
    'kora_admin_c2a_expiration_worker',
    'kora_admin_c2a_bootstrap'
  ) THEN
    IF NEW."version" <> 3 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a roles must insert AuditLog version 3 explicitly';
    END IF;
    IF current_user = 'kora_admin_c2a_notification_worker'
       AND NOT COALESCE((
         NEW."context" = 'SYSTEM'
         AND NEW."outcome" = 'SUCCESS'
         AND NEW."failureCode" IS NULL
         AND NEW."operatorReason" IS NULL
         AND NEW."notificationOutboxId" IS NOT NULL
         AND (
           (
             NEW."action" = 'deliverAdminPasswordResetNotification'
             AND NEW."eventClass" = 'LOGIN'
             AND NEW."entityType" = 'ADMIN_PASSWORD_RESET_REQUEST'
             AND NEW."causationSecurityEventId" IS NOT NULL
             AND NEW."causationEventId" IS NULL
             AND NEW."delegatedByAdminUserId" IS NULL
           )
           OR (
             NEW."action" = 'deliverAdminInvitationNotification'
             AND NEW."eventClass" = 'BUSINESS'
             AND NEW."entityType" = 'ADMIN_INVITATION'
             AND NEW."causationEventId" IS NOT NULL
             AND NEW."causationSecurityEventId" IS NULL
             AND NEW."delegatedByAdminUserId" IS NOT NULL
           )
         )
       ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a notification role attempted an unauthorized AuditLog action';
    END IF;
    IF current_user = 'kora_admin_c2a_expiration_worker'
       AND NOT COALESCE((
         NEW."action" = 'expireAdminRecoveryCase'
         AND NEW."eventClass" = 'BUSINESS'
         AND NEW."context" = 'SYSTEM'
         AND NEW."outcome" = 'SUCCESS'
         AND NEW."failureCode" IS NULL
         AND NEW."operatorReason" IS NULL
         AND NEW."entityType" = 'ADMIN_RECOVERY_CASE'
         AND NEW."adminRecoveryCaseId" IS NOT NULL
         AND NEW."causationEventId" IS NULL
         AND NEW."causationSecurityEventId" IS NULL
         AND NEW."delegatedByAdminUserId" IS NULL
       ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a expiration role attempted an unauthorized AuditLog action';
    END IF;
    IF current_user = 'kora_admin_c2a_bootstrap'
       AND NOT COALESCE((
         NEW."action" = 'bootstrapAdminUser'
         AND NEW."eventClass" = 'BUSINESS'
         AND NEW."context" = 'SYSTEM'
         AND NEW."outcome" = 'SUCCESS'
         AND NEW."failureCode" IS NULL
         AND NEW."operatorReason" IS NULL
         AND NEW."entityType" = 'ADMIN_USER'
         AND NEW."bootstrapGuardId" = 'ADMIN_BOOTSTRAP_V1'
         AND NEW."causationEventId" IS NULL
         AND NEW."causationSecurityEventId" IS NULL
         AND NEW."delegatedByAdminUserId" IS NULL
       ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a bootstrap role attempted an unauthorized AuditLog action';
    END IF;
    IF current_user = 'kora_admin_c2a_writer'
       AND NOT COALESCE((
         (
           NEW."context" = 'ADMIN_SESSION'
           AND NEW."action" IN (
             'createAdminRecoveryCase',
             'approveAdminRecoveryCase',
             'createAdminInvitation',
             'changeAdminUserRole',
             'changeAdminUserStatus'
           )
         )
         OR (
           NEW."context" = 'ADMIN_RECOVERY'
           AND NEW."action" = 'resetAdminPassword'
         )
         OR (
           NEW."context" = 'SYSTEM'
           AND NEW."action" = 'cancelAdminRecoveryCase'
           AND NEW."eventClass" = 'BUSINESS'
           AND NEW."outcome" = 'SUCCESS'
           AND NEW."failureCode" IS NULL
           AND NEW."operatorReason" IS NULL
           AND NEW."entityType" = 'ADMIN_RECOVERY_CASE'
           AND NEW."adminRecoveryCaseId" IS NOT NULL
           AND NEW."causationEventId" IS NOT NULL
           AND NEW."causationSecurityEventId" IS NULL
           AND NEW."delegatedByAdminUserId" IS NOT NULL
         )
       ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a writer attempted an unauthorized AuditLog action';
    END IF;
  ELSIF NEW."version" <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C1 and migration-owner AuditLog inserts must use version 2';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.kora_guard_admin_password_reset_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW."id", NEW."adminUserId", NEW."securityEventId",
         NEW."replacedRequestId", NEW."expiresAt", NEW."createdAt")
       IS DISTINCT FROM
     ROW(OLD."id", OLD."adminUserId", OLD."securityEventId",
         OLD."replacedRequestId", OLD."expiresAt", OLD."createdAt")
     OR (
       OLD."revokedAt" IS NOT NULL
       AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminPasswordResetRequest identity or terminal state is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdminPasswordResetRequest_monotone"
  BEFORE UPDATE ON public."AdminPasswordResetRequest"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_password_reset_request();

CREATE FUNCTION public.kora_guard_admin_password_reset_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW."id", NEW."passwordResetRequestId", NEW."adminUserId",
         NEW."tokenHash", NEW."authorizationVersion", NEW."expiresAt", NEW."createdAt")
       IS DISTINCT FROM
     ROW(OLD."id", OLD."passwordResetRequestId", OLD."adminUserId",
         OLD."tokenHash", OLD."authorizationVersion", OLD."expiresAt", OLD."createdAt")
     OR (
       OLD."consumedAt" IS NOT NULL
       AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt"
     )
     OR (
       OLD."revokedAt" IS NOT NULL
       AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminPasswordResetContext identity or terminal state is immutable';
  END IF;
  IF OLD."consumedAt" IS NULL
     AND NEW."consumedAt" IS NOT NULL
     AND (
       OLD."expiresAt" <= LOCALTIMESTAMP(3)
       OR NEW."consumedAt" < OLD."createdAt"
       OR NEW."consumedAt" > OLD."expiresAt"
       OR NEW."consumedAt" > LOCALTIMESTAMP(3)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Expired password-reset context cannot be consumed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdminPasswordResetContext_monotone"
  BEFORE UPDATE ON public."AdminPasswordResetContext"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_password_reset_context();

CREATE FUNCTION public.kora_guard_admin_recovery_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW."id", NEW."subjectAdminUserId", NEW."creatorAdminUserId",
         NEW."expiresAt", NEW."createdAt")
       IS DISTINCT FROM
     ROW(OLD."id", OLD."subjectAdminUserId", OLD."creatorAdminUserId",
         OLD."expiresAt", OLD."createdAt")
     OR OLD."state" <> 'PENDING'
     OR NEW."state" = 'PENDING'
     OR NEW."stateGeneration" <> OLD."stateGeneration" + 1
     OR NEW."state" NOT IN ('APPROVED', 'CANCELLED', 'EXPIRED') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminRecoveryCase transition is not a one-shot PENDING terminalization';
  END IF;
  IF current_user = 'kora_admin_c2a_expiration_worker'
     AND (
       NEW."state" <> 'EXPIRED'
       OR OLD."expiresAt" > LOCALTIMESTAMP(3)
       OR NEW."expiredAt" < OLD."expiresAt"
       OR NEW."expiredAt" > LOCALTIMESTAMP(3)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2a expiration role may only expire due recovery cases';
  END IF;
  IF NEW."state" = 'APPROVED'
     AND (
       OLD."expiresAt" <= LOCALTIMESTAMP(3)
       OR NEW."approvedAt" < OLD."createdAt"
       OR NEW."approvedAt" > OLD."expiresAt"
       OR NEW."approvedAt" > LOCALTIMESTAMP(3)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Expired recovery case cannot be approved';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdminRecoveryCase_monotone"
  BEFORE UPDATE ON public."AdminRecoveryCase"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_recovery_case();

CREATE FUNCTION public.kora_guard_admin_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW."id", NEW."emailCanonical", NEW."deliveryEmailEncrypted",
         NEW."codeHash", NEW."proposedRole", NEW."creatorAdminUserId",
         NEW."createdByAuditLogId", NEW."replacedInvitationId",
         NEW."expiresAt", NEW."createdAt")
       IS DISTINCT FROM
     ROW(OLD."id", OLD."emailCanonical", OLD."deliveryEmailEncrypted",
         OLD."codeHash", OLD."proposedRole", OLD."creatorAdminUserId",
         OLD."createdByAuditLogId", OLD."replacedInvitationId",
         OLD."expiresAt", OLD."createdAt")
     OR OLD."state" <> 'PENDING'
     OR NEW."state" = 'PENDING'
     OR NEW."stateGeneration" <> OLD."stateGeneration" + 1
     OR NEW."state" NOT IN ('ACCEPTED', 'REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminInvitation transition is not a one-shot terminalization';
  END IF;
  IF NEW."state" = 'ACCEPTED'
     AND (
       OLD."expiresAt" <= LOCALTIMESTAMP(3)
       OR NEW."acceptedAt" < OLD."createdAt"
       OR NEW."acceptedAt" > OLD."expiresAt"
       OR NEW."acceptedAt" > LOCALTIMESTAMP(3)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Expired invitation cannot be accepted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdminInvitation_monotone"
  BEFORE UPDATE ON public."AdminInvitation"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_invitation();

CREATE FUNCTION public.kora_guard_admin_notification_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF ROW(NEW."id", NEW."purpose", NEW."encryptedPayload",
         NEW."encryptionKeyId", NEW."encryptionNonce", NEW."encryptionTag",
         NEW."aadHash", NEW."sourceSecurityEventId", NEW."sourceAuditLogId",
         NEW."passwordResetRequestId", NEW."adminInvitationId",
         NEW."replacedOutboxId", NEW."createdAt")
       IS DISTINCT FROM
     ROW(OLD."id", OLD."purpose", OLD."encryptedPayload",
         OLD."encryptionKeyId", OLD."encryptionNonce", OLD."encryptionTag",
         OLD."aadHash", OLD."sourceSecurityEventId", OLD."sourceAuditLogId",
         OLD."passwordResetRequestId", OLD."adminInvitationId",
         OLD."replacedOutboxId", OLD."createdAt")
     OR NEW."generation" <> OLD."generation" + 1
     OR (
       OLD."state" = 'PENDING'
       AND NEW."state" NOT IN ('CLAIMED', 'CANCELLED')
     )
     OR (
       OLD."state" = 'CLAIMED'
       AND NEW."state" NOT IN (
         'PENDING',
         'DELIVERED',
         'FAILED',
         'DELIVERY_UNCERTAIN',
         'CANCELLED'
       )
     )
     OR OLD."state" IN ('DELIVERED', 'FAILED', 'DELIVERY_UNCERTAIN', 'CANCELLED') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminNotificationOutbox transition is invalid';
  END IF;
  IF NEW."attemptCount" < OLD."attemptCount"
     OR NEW."attemptCount" > OLD."attemptCount" + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminNotificationOutbox attempt count is not monotone';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdminNotificationOutbox_monotone"
  BEFORE UPDATE ON public."AdminNotificationOutbox"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_notification_outbox();

CREATE FUNCTION public.kora_validate_admin_snapshot_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM NEW."projectionJson"::jsonb;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdminPaginationSnapshotItem_json"
  BEFORE INSERT ON public."AdminPaginationSnapshotItem"
  FOR EACH ROW EXECUTE FUNCTION public.kora_validate_admin_snapshot_item();

CREATE FUNCTION public.kora_assert_admin_snapshot_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_snapshot_id TEXT;
  expected_count INTEGER;
  expected_bytes BIGINT;
  actual_count INTEGER;
  actual_bytes BIGINT;
  minimum_ordinal INTEGER;
  maximum_ordinal INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'AdminPaginationSnapshot' THEN
    affected_snapshot_id := COALESCE(NEW."id", OLD."id");
  ELSE
    affected_snapshot_id := COALESCE(NEW."snapshotId", OLD."snapshotId");
  END IF;

  SELECT snapshot_entry."entryCount", snapshot_entry."utf8Bytes"
    INTO expected_count, expected_bytes
  FROM public."AdminPaginationSnapshot" AS snapshot_entry
  WHERE snapshot_entry."id" = affected_snapshot_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::INTEGER,
         COALESCE(sum(item_entry."utf8Bytes"), 0)::BIGINT,
         min(item_entry."ordinal"),
         max(item_entry."ordinal")
    INTO actual_count, actual_bytes, minimum_ordinal, maximum_ordinal
  FROM public."AdminPaginationSnapshotItem" AS item_entry
  WHERE item_entry."snapshotId" = affected_snapshot_id;

  IF actual_count <> expected_count
     OR actual_bytes <> expected_bytes
     OR (
       actual_count > 0
       AND (minimum_ordinal <> 0 OR maximum_ordinal <> actual_count - 1)
     )
     OR EXISTS (
       SELECT 1
       FROM public."AdminPaginationSnapshotItem" AS previous_item
       JOIN public."AdminPaginationSnapshotItem" AS next_item
         ON next_item."snapshotId" = previous_item."snapshotId"
        AND next_item."ordinal" = previous_item."ordinal" + 1
       WHERE previous_item."snapshotId" = affected_snapshot_id
         AND ROW(previous_item."sourceCreatedAt", previous_item."resourceId")
             < ROW(next_item."sourceCreatedAt", next_item."resourceId")
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminPaginationSnapshot aggregate is incomplete, unordered or non-contiguous';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "AdminPaginationSnapshot_complete"
  AFTER INSERT OR UPDATE OR DELETE ON public."AdminPaginationSnapshot"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_snapshot_complete();
CREATE CONSTRAINT TRIGGER "AdminPaginationSnapshotItem_complete"
  AFTER INSERT OR UPDATE OR DELETE ON public."AdminPaginationSnapshotItem"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_snapshot_complete();

CREATE TRIGGER "AdminPaginationSnapshot_append_only"
  BEFORE UPDATE OR DELETE ON public."AdminPaginationSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();
CREATE TRIGGER "AdminPaginationSnapshotItem_append_only"
  BEFORE UPDATE OR DELETE ON public."AdminPaginationSnapshotItem"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();
CREATE TRIGGER "AdminBootstrapGuard_append_only"
  BEFORE UPDATE OR DELETE ON public."AdminBootstrapGuard"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();

CREATE FUNCTION public.kora_guard_admin_c2_idempotency_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  database_now TIMESTAMP(3);
BEGIN
  IF pg_catalog.length(NEW."idempotencyKey") NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'AdminC2IdempotencyRecord_window_check',
      MESSAGE = 'C2 idempotency key length is outside the allowed range';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        'KORA_ADMIN_C2_IDEMPOTENCY_LOCK_V2'::pg_catalog.text,
        NEW."adminUserId"::pg_catalog.text,
        NEW."operation"::pg_catalog.text,
        NEW."idempotencyKey"::pg_catalog.text
      )::pg_catalog.text,
      0
    )
  );
  database_now := (
    pg_catalog.clock_timestamp() AT TIME ZONE 'UTC'
  )::pg_catalog.timestamp(3);

  IF EXISTS (
    SELECT 1
    FROM public."AdminC2IdempotencyRecord" AS existing_record
    WHERE existing_record."adminUserId" = NEW."adminUserId"
      AND existing_record."operation" = NEW."operation"
      AND existing_record."idempotencyKey" = NEW."idempotencyKey"
      AND existing_record."expiresAt" > database_now
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'AdminC2IdempotencyRecord_active_key',
      MESSAGE = 'An active C2 idempotency generation already exists';
  END IF;

  SELECT COALESCE(pg_catalog.max(existing_record."generation"), 0) + 1
    INTO NEW."generation"
  FROM public."AdminC2IdempotencyRecord" AS existing_record
  WHERE existing_record."adminUserId" = NEW."adminUserId"
    AND existing_record."operation" = NEW."operation"
    AND existing_record."idempotencyKey" = NEW."idempotencyKey";

  NEW."createdAt" := database_now;
  NEW."expiresAt" := database_now + INTERVAL '24 hours';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_c2_idempotency_insert() FROM PUBLIC;
CREATE TRIGGER "AdminC2IdempotencyRecord_insert_guard"
  BEFORE INSERT ON public."AdminC2IdempotencyRecord"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_c2_idempotency_insert();
CREATE TRIGGER "AdminC2IdempotencyRecord_append_only"
  BEFORE UPDATE OR DELETE ON public."AdminC2IdempotencyRecord"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();

CREATE FUNCTION public.kora_guard_c2a_admin_user_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF session_user = 'kora_admin_c2a_bootstrap' THEN
    IF EXISTS (SELECT 1 FROM public."AdminUser")
       OR NEW."role" <> 'SUPER_ADMIN'
       OR NEW."status" <> 'PENDING_MFA'
       OR NEW."authorizationVersion" <> 1
       OR NEW."totpSecretEncrypted" IS NOT NULL
       OR NEW."totpEnabledAt" IS NOT NULL
       OR NEW."lastAcceptedTotpCounter" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a bootstrap may create only the first pending-MFA super administrator';
    END IF;
  ELSIF session_user = 'kora_admin_c2a_writer' THEN
    IF NEW."status" <> 'PENDING_MFA'
       OR NEW."authorizationVersion" <> 1
       OR NEW."totpSecretEncrypted" IS NOT NULL
       OR NEW."totpEnabledAt" IS NOT NULL
       OR NEW."lastAcceptedTotpCounter" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a invitation acceptance may create only a pending-MFA administrator';
    END IF;
    NEW."c2aInvitationCreatedXid" := pg_catalog.pg_current_xact_id()::text::bigint;
  ELSE
    NEW."c2aInvitationCreatedXid" := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AdminUser_c2a_insert_shape"
  BEFORE INSERT ON public."AdminUser"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_c2a_admin_user_insert();

CREATE FUNCTION public.kora_assert_c2a_admin_user_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  IF session_user = 'kora_admin_c2a_bootstrap' THEN
    SELECT count(*) INTO valid_link_count
    FROM public."AdminBootstrapGuard" AS bootstrap_entry
    JOIN public."AuditLog" AS audit_entry
      ON audit_entry."id" = bootstrap_entry."bootstrapAuditLogId"
    WHERE bootstrap_entry."singletonKey" = 'ADMIN_BOOTSTRAP_V1'
      AND bootstrap_entry."adminUserId" = NEW."id"
      AND audit_entry."version" = 3
      AND audit_entry."action" = 'bootstrapAdminUser'
      AND audit_entry."eventClass" = 'BUSINESS'
      AND audit_entry."context" = 'SYSTEM'
      AND audit_entry."outcome" = 'SUCCESS'
      AND audit_entry."failureCode" IS NULL
      AND audit_entry."entityType" = 'ADMIN_USER'
      AND audit_entry."entityId" = NEW."id"
      AND audit_entry."bootstrapGuardId" = bootstrap_entry."singletonKey";
    IF valid_link_count <> 1
       OR (SELECT count(*) FROM public."AdminUser") <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a bootstrap user, singleton guard and audit must commit atomically';
    END IF;
  ELSIF session_user = 'kora_admin_c2a_writer' THEN
    SELECT count(*) INTO valid_link_count
    FROM public."AdminInvitation" AS invitation_entry
    WHERE invitation_entry."acceptedAdminUserId" = NEW."id"
      AND NEW."c2aInvitationCreatedXid" = pg_catalog.pg_current_xact_id()::text::bigint
      AND invitation_entry."state" = 'ACCEPTED'
      AND invitation_entry."proposedRole" = NEW."role"
      AND invitation_entry."emailCanonical" = pg_catalog.translate(
        NEW."email",
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz'
      )
      AND EXISTS (
        SELECT 1
        FROM public."AdminPreAuthContext" AS preauth_entry
        WHERE preauth_entry."adminUserId" = NEW."id"
          AND preauth_entry."purpose" = 'FIRST_TOTP_ENROLLMENT'
          AND preauth_entry."authorizationVersion" = NEW."authorizationVersion"
          AND preauth_entry."consumedAt" IS NULL
          AND preauth_entry."revokedAt" IS NULL
          AND preauth_entry."expiresAt" > preauth_entry."createdAt"
          AND preauth_entry."expiresAt" <= preauth_entry."createdAt" + INTERVAL '10 minutes'
      )
      AND EXISTS (
        SELECT 1
        FROM public."AdminSecurityEvent" AS security_event
        WHERE security_event."adminInvitationId" = invitation_entry."id"
          AND security_event."adminUserId" = NEW."id"
          AND security_event."action" = 'acceptAdminInvitation'
          AND security_event."eventClass" = 'BUSINESS'
          AND security_event."outcome" = 'SUCCEEDED'
          AND security_event."failureCode" IS NULL
          AND security_event."entityType" = 'ADMIN_INVITATION'
          AND security_event."entityId" = invitation_entry."id"
      );
    IF valid_link_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a invitation, pending-MFA user, preauth and event must commit atomically';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_c2a_admin_user_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminUser_c2a_atomicity"
  AFTER INSERT ON public."AdminUser"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_c2a_admin_user_atomicity();

CREATE FUNCTION public.kora_assert_admin_invitation_acceptance_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  IF NEW."state" = 'ACCEPTED' AND OLD."state" <> 'ACCEPTED' THEN
    SELECT count(*) INTO valid_link_count
    FROM public."AdminUser" AS admin_user
    WHERE admin_user."id" = NEW."acceptedAdminUserId"
      AND admin_user."c2aInvitationCreatedXid" =
          pg_catalog.pg_current_xact_id()::text::bigint
      AND admin_user."status" = 'PENDING_MFA'
      AND admin_user."authorizationVersion" = 1
      AND admin_user."role" = NEW."proposedRole"
      AND pg_catalog.translate(
        admin_user."email",
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz'
      ) = NEW."emailCanonical"
      AND NEW."expiresAt" > LOCALTIMESTAMP(3)
      AND NEW."acceptedAt" <= NEW."expiresAt"
      AND EXISTS (
        SELECT 1
        FROM public."AdminPreAuthContext" AS preauth_entry
        WHERE preauth_entry."adminUserId" = admin_user."id"
          AND preauth_entry."purpose" = 'FIRST_TOTP_ENROLLMENT'
          AND preauth_entry."authorizationVersion" = admin_user."authorizationVersion"
          AND preauth_entry."consumedAt" IS NULL
          AND preauth_entry."revokedAt" IS NULL
          AND preauth_entry."expiresAt" > preauth_entry."createdAt"
          AND preauth_entry."expiresAt" <= preauth_entry."createdAt" + INTERVAL '10 minutes'
      )
      AND EXISTS (
        SELECT 1
        FROM public."AdminSecurityEvent" AS security_event
        WHERE security_event."adminInvitationId" = NEW."id"
          AND security_event."adminUserId" = admin_user."id"
          AND security_event."action" = 'acceptAdminInvitation'
          AND security_event."eventClass" = 'BUSINESS'
          AND security_event."outcome" = 'SUCCEEDED'
          AND security_event."failureCode" IS NULL
          AND security_event."entityType" = 'ADMIN_INVITATION'
          AND security_event."entityId" = NEW."id"
      );
    IF valid_link_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2a invitation acceptance must commit with its pending-MFA user, preauth and event';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_invitation_acceptance_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminInvitation_acceptance_atomicity"
  AFTER UPDATE ON public."AdminInvitation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_invitation_acceptance_atomicity();

CREATE FUNCTION public.kora_assert_admin_invitation_security_event_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  IF NEW."action" = 'acceptAdminInvitation'
     AND NEW."outcome" = 'SUCCEEDED' THEN
    SELECT count(*) INTO valid_link_count
    FROM public."AdminInvitation" AS invitation_entry
    JOIN public."AdminUser" AS admin_user
      ON admin_user."id" = invitation_entry."acceptedAdminUserId"
    WHERE invitation_entry."id" = NEW."adminInvitationId"
      AND invitation_entry."id" = NEW."entityId"
      AND invitation_entry."state" = 'ACCEPTED'
      AND invitation_entry."acceptedAt" IS NOT NULL
      AND invitation_entry."acceptedAt" <= invitation_entry."expiresAt"
      AND invitation_entry."expiresAt" > LOCALTIMESTAMP(3)
      AND admin_user."id" = NEW."adminUserId"
      AND admin_user."c2aInvitationCreatedXid" =
          pg_catalog.pg_current_xact_id()::text::bigint
      AND admin_user."status" = 'PENDING_MFA'
      AND admin_user."authorizationVersion" = 1
      AND admin_user."role" = invitation_entry."proposedRole"
      AND pg_catalog.translate(
        admin_user."email",
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz'
      ) = invitation_entry."emailCanonical"
      AND NEW."eventClass" = 'BUSINESS'
      AND NEW."failureCode" IS NULL
      AND NEW."entityType" = 'ADMIN_INVITATION'
      AND EXISTS (
        SELECT 1
        FROM public."AdminPreAuthContext" AS preauth_entry
        WHERE preauth_entry."adminUserId" = admin_user."id"
          AND preauth_entry."purpose" = 'FIRST_TOTP_ENROLLMENT'
          AND preauth_entry."authorizationVersion" = admin_user."authorizationVersion"
          AND preauth_entry."consumedAt" IS NULL
          AND preauth_entry."revokedAt" IS NULL
          AND preauth_entry."expiresAt" > preauth_entry."createdAt"
          AND preauth_entry."expiresAt" <= preauth_entry."createdAt" + INTERVAL '10 minutes'
      );
    IF valid_link_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Successful invitation-acceptance event must commit with its invitation, new pending-MFA user and preauth';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_invitation_security_event_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminSecurityEvent_invitation_acceptance_atomicity"
  AFTER INSERT ON public."AdminSecurityEvent"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_invitation_security_event_atomicity();

CREATE FUNCTION public.kora_assert_password_reset_request_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  SELECT count(*) INTO valid_link_count
  FROM public."AdminPasswordResetRequest" AS reset_request
  JOIN public."AdminSecurityEvent" AS security_event
    ON security_event."id" = reset_request."securityEventId"
   AND security_event."entityId" = reset_request."id"
   AND security_event."adminUserId" = reset_request."adminUserId"
  JOIN public."AdminNotificationOutbox" AS outbox_entry
    ON outbox_entry."passwordResetRequestId" = reset_request."id"
   AND outbox_entry."sourceSecurityEventId" = reset_request."securityEventId"
  WHERE reset_request."id" = NEW."id"
    AND security_event."action" = 'requestAdminPasswordReset'
    AND security_event."eventClass" = 'LOGIN'
    AND security_event."outcome" = 'SUCCEEDED'
    AND security_event."failureCode" IS NULL
    AND security_event."entityType" = 'ADMIN_PASSWORD_RESET_REQUEST'
    AND outbox_entry."purpose" = 'PASSWORD_RESET'
    AND outbox_entry."state" = 'PENDING'
    AND (
      (
        reset_request."replacedRequestId" IS NULL
        AND outbox_entry."replacedOutboxId" IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public."AdminPasswordResetRequest" AS replaced_request
        JOIN public."AdminNotificationOutbox" AS replaced_outbox
          ON replaced_outbox."passwordResetRequestId" = replaced_request."id"
        WHERE replaced_request."id" = reset_request."replacedRequestId"
          AND replaced_request."adminUserId" = reset_request."adminUserId"
          AND replaced_request."revokedAt" IS NOT NULL
          AND replaced_outbox."id" = outbox_entry."replacedOutboxId"
          AND replaced_outbox."purpose" = 'PASSWORD_RESET'
          AND replaced_outbox."state" = 'CANCELLED'
          AND replaced_outbox."cancelledAt" IS NOT NULL
      )
    );
  IF valid_link_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Password-reset event, request and notification outbox must commit atomically';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_password_reset_request_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminPasswordResetRequest_atomicity"
  AFTER INSERT ON public."AdminPasswordResetRequest"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_password_reset_request_atomicity();

CREATE FUNCTION public.kora_assert_password_reset_security_event_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  IF NEW."action" = 'requestAdminPasswordReset'
     AND NEW."outcome" = 'SUCCEEDED' THEN
    SELECT count(*) INTO valid_link_count
    FROM public."AdminPasswordResetRequest" AS reset_request
    JOIN public."AdminNotificationOutbox" AS outbox_entry
      ON outbox_entry."passwordResetRequestId" = reset_request."id"
     AND outbox_entry."sourceSecurityEventId" = reset_request."securityEventId"
    WHERE reset_request."securityEventId" = NEW."id"
      AND reset_request."id" = NEW."entityId"
      AND reset_request."adminUserId" = NEW."adminUserId"
      AND NEW."eventClass" = 'LOGIN'
      AND NEW."failureCode" IS NULL
      AND NEW."entityType" = 'ADMIN_PASSWORD_RESET_REQUEST'
      AND outbox_entry."purpose" = 'PASSWORD_RESET'
      AND outbox_entry."state" = 'PENDING'
      AND (
        (
          reset_request."replacedRequestId" IS NULL
          AND outbox_entry."replacedOutboxId" IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM public."AdminPasswordResetRequest" AS replaced_request
          JOIN public."AdminNotificationOutbox" AS replaced_outbox
            ON replaced_outbox."passwordResetRequestId" = replaced_request."id"
          WHERE replaced_request."id" = reset_request."replacedRequestId"
            AND replaced_request."adminUserId" = reset_request."adminUserId"
            AND replaced_request."revokedAt" IS NOT NULL
            AND replaced_outbox."id" = outbox_entry."replacedOutboxId"
            AND replaced_outbox."purpose" = 'PASSWORD_RESET'
            AND replaced_outbox."state" = 'CANCELLED'
            AND replaced_outbox."cancelledAt" IS NOT NULL
        )
      );
    IF valid_link_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Successful password-reset event must commit with its request and notification outbox';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_password_reset_security_event_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminSecurityEvent_password_reset_atomicity"
  AFTER INSERT ON public."AdminSecurityEvent"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_password_reset_security_event_atomicity();

CREATE FUNCTION public.kora_assert_admin_invitation_creation_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  SELECT count(*) INTO valid_link_count
  FROM public."AdminInvitation" AS invitation_entry
  JOIN public."AuditLog" AS audit_entry
    ON audit_entry."id" = invitation_entry."createdByAuditLogId"
   AND audit_entry."entityId" = invitation_entry."id"
  JOIN public."AdminNotificationOutbox" AS outbox_entry
    ON outbox_entry."adminInvitationId" = invitation_entry."id"
   AND outbox_entry."sourceAuditLogId" = invitation_entry."createdByAuditLogId"
  WHERE invitation_entry."id" = NEW."id"
    AND invitation_entry."state" = 'PENDING'
    AND audit_entry."version" = 3
    AND audit_entry."adminUserId" = invitation_entry."creatorAdminUserId"
    AND audit_entry."action" = 'createAdminInvitation'
    AND audit_entry."eventClass" = 'BUSINESS'
    AND audit_entry."context" = 'ADMIN_SESSION'
    AND audit_entry."outcome" = 'SUCCESS'
    AND audit_entry."failureCode" IS NULL
    AND audit_entry."entityType" = 'ADMIN_INVITATION'
    AND outbox_entry."purpose" = 'INVITATION'
    AND outbox_entry."state" = 'PENDING'
    AND (
      (
        invitation_entry."replacedInvitationId" IS NULL
        AND outbox_entry."replacedOutboxId" IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public."AdminInvitation" AS replaced_invitation
        JOIN public."AdminNotificationOutbox" AS replaced_outbox
          ON replaced_outbox."adminInvitationId" = replaced_invitation."id"
        WHERE replaced_invitation."id" = invitation_entry."replacedInvitationId"
          AND replaced_invitation."emailCanonical" = invitation_entry."emailCanonical"
          AND replaced_invitation."state" = 'REVOKED'
          AND replaced_invitation."revokedAt" IS NOT NULL
          AND replaced_outbox."id" = outbox_entry."replacedOutboxId"
          AND replaced_outbox."purpose" = 'INVITATION'
          AND replaced_outbox."state" = 'CANCELLED'
          AND replaced_outbox."cancelledAt" IS NOT NULL
      )
    );
  IF valid_link_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Invitation audit, invitation and notification outbox must commit atomically';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_invitation_creation_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminInvitation_creation_atomicity"
  AFTER INSERT ON public."AdminInvitation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_invitation_creation_atomicity();

CREATE FUNCTION public.kora_assert_admin_invitation_audit_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  IF NEW."version" = 3
     AND NEW."action" = 'createAdminInvitation'
     AND NEW."outcome" = 'SUCCESS' THEN
    SELECT count(*) INTO valid_link_count
    FROM public."AdminInvitation" AS invitation_entry
    JOIN public."AdminNotificationOutbox" AS outbox_entry
      ON outbox_entry."adminInvitationId" = invitation_entry."id"
     AND outbox_entry."sourceAuditLogId" = invitation_entry."createdByAuditLogId"
    WHERE invitation_entry."createdByAuditLogId" = NEW."id"
      AND invitation_entry."id" = NEW."entityId"
      AND invitation_entry."creatorAdminUserId" = NEW."adminUserId"
      AND invitation_entry."state" = 'PENDING'
      AND NEW."eventClass" = 'BUSINESS'
      AND NEW."context" = 'ADMIN_SESSION'
      AND NEW."failureCode" IS NULL
      AND NEW."entityType" = 'ADMIN_INVITATION'
      AND outbox_entry."purpose" = 'INVITATION'
      AND outbox_entry."state" = 'PENDING'
      AND (
        (
          invitation_entry."replacedInvitationId" IS NULL
          AND outbox_entry."replacedOutboxId" IS NULL
        )
        OR EXISTS (
          SELECT 1
          FROM public."AdminInvitation" AS replaced_invitation
          JOIN public."AdminNotificationOutbox" AS replaced_outbox
            ON replaced_outbox."adminInvitationId" = replaced_invitation."id"
          WHERE replaced_invitation."id" = invitation_entry."replacedInvitationId"
            AND replaced_invitation."emailCanonical" = invitation_entry."emailCanonical"
            AND replaced_invitation."state" = 'REVOKED'
            AND replaced_invitation."revokedAt" IS NOT NULL
            AND replaced_outbox."id" = outbox_entry."replacedOutboxId"
            AND replaced_outbox."purpose" = 'INVITATION'
            AND replaced_outbox."state" = 'CANCELLED'
            AND replaced_outbox."cancelledAt" IS NOT NULL
        )
      );
    IF valid_link_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Successful invitation audit must commit with its invitation and notification outbox';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_invitation_audit_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AuditLog_invitation_creation_atomicity"
  AFTER INSERT ON public."AuditLog"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_invitation_audit_atomicity();

CREATE FUNCTION public.kora_assert_admin_recovery_expiration_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."state" = 'EXPIRED' AND OLD."state" <> 'EXPIRED' AND NOT EXISTS (
    SELECT 1
    FROM public."AuditLog" AS audit_entry
    WHERE audit_entry."version" = 3
      AND audit_entry."action" = 'expireAdminRecoveryCase'
      AND audit_entry."eventClass" = 'BUSINESS'
      AND audit_entry."context" = 'SYSTEM'
      AND audit_entry."outcome" = 'SUCCESS'
      AND audit_entry."failureCode" IS NULL
      AND audit_entry."entityType" = 'ADMIN_RECOVERY_CASE'
      AND audit_entry."entityId" = NEW."id"
      AND audit_entry."adminRecoveryCaseId" = NEW."id"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Recovery-case expiration and audit must commit atomically';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_recovery_expiration_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminRecoveryCase_expiration_atomicity"
  AFTER UPDATE ON public."AdminRecoveryCase"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_recovery_expiration_atomicity();

CREATE FUNCTION public.kora_assert_admin_recovery_cancellation_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."state" = 'CANCELLED' AND OLD."state" <> 'CANCELLED' AND NOT EXISTS (
    SELECT 1
    FROM public."AuditLog" AS audit_entry
    WHERE audit_entry."version" = 3
      AND audit_entry."action" = 'cancelAdminRecoveryCase'
      AND audit_entry."eventClass" = 'BUSINESS'
      AND audit_entry."context" = 'SYSTEM'
      AND audit_entry."outcome" = 'SUCCESS'
      AND audit_entry."failureCode" IS NULL
      AND audit_entry."entityType" = 'ADMIN_RECOVERY_CASE'
      AND audit_entry."entityId" = NEW."id"
      AND audit_entry."adminRecoveryCaseId" = NEW."id"
      AND audit_entry."delegatedByAdminUserId" IS NOT NULL
      AND audit_entry."causationEventId" IS NOT NULL
      AND audit_entry."causationSecurityEventId" IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Recovery-case cancellation and audit must commit atomically';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_recovery_cancellation_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminRecoveryCase_cancellation_atomicity"
  AFTER UPDATE ON public."AdminRecoveryCase"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_recovery_cancellation_atomicity();

CREATE FUNCTION public.kora_validate_audit_log_v3_causality()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  causal_audit public."AuditLog"%ROWTYPE;
  causal_security_event public."AdminSecurityEvent"%ROWTYPE;
  outbox_entry public."AdminNotificationOutbox"%ROWTYPE;
  reset_request_entry public."AdminPasswordResetRequest"%ROWTYPE;
  invitation_entry public."AdminInvitation"%ROWTYPE;
  recovery_case_entry public."AdminRecoveryCase"%ROWTYPE;
  causal_recovery_case public."AdminRecoveryCase"%ROWTYPE;
  bootstrap_entry public."AdminBootstrapGuard"%ROWTYPE;
BEGIN
  IF NEW."version" <> 3 THEN
    RETURN NEW;
  END IF;

  IF NEW."causationEventId" IS NOT NULL THEN
    SELECT * INTO causal_audit
    FROM public."AuditLog"
    WHERE "id" = NEW."causationEventId";
    IF NOT FOUND
       OR causal_audit."version" <> 3
       OR causal_audit."outcome" <> 'SUCCESS'
       OR causal_audit."failureCode" IS NOT NULL
       OR causal_audit."adminUserId" IS NULL
       OR causal_audit."adminUserId" IS DISTINCT FROM NEW."delegatedByAdminUserId" THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 admin delegation source is invalid';
    END IF;
  END IF;

  IF NEW."causationSecurityEventId" IS NOT NULL THEN
    SELECT * INTO causal_security_event
    FROM public."AdminSecurityEvent"
    WHERE "id" = NEW."causationSecurityEventId";
    IF NOT FOUND
       OR causal_security_event."action" <> 'requestAdminPasswordReset'
       OR causal_security_event."eventClass" <> 'LOGIN'
       OR causal_security_event."outcome" <> 'SUCCEEDED'
       OR causal_security_event."failureCode" IS NOT NULL
       OR causal_security_event."entityType" <> 'ADMIN_PASSWORD_RESET_REQUEST' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 public password-reset source is invalid';
    END IF;
  END IF;

  IF NEW."notificationOutboxId" IS NOT NULL THEN
    SELECT * INTO outbox_entry
    FROM public."AdminNotificationOutbox"
    WHERE "id" = NEW."notificationOutboxId";
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 notification outbox source is missing';
    END IF;
    IF outbox_entry."purpose" = 'PASSWORD_RESET' AND (
      NEW."action" <> 'deliverAdminPasswordResetNotification'
      OR NEW."causationSecurityEventId" IS DISTINCT FROM outbox_entry."sourceSecurityEventId"
      OR NEW."adminInvitationId" IS NOT NULL
      OR NEW."entityType" <> 'ADMIN_PASSWORD_RESET_REQUEST'
      OR NEW."entityId" IS DISTINCT FROM outbox_entry."passwordResetRequestId"
      OR outbox_entry."state" <> 'DELIVERED'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 password-reset delivery binding is invalid';
    END IF;
    IF outbox_entry."purpose" = 'PASSWORD_RESET' THEN
      SELECT * INTO reset_request_entry
      FROM public."AdminPasswordResetRequest"
      WHERE "id" = outbox_entry."passwordResetRequestId";
      IF NOT FOUND
         OR reset_request_entry."securityEventId"
              IS DISTINCT FROM outbox_entry."sourceSecurityEventId"
         OR causal_security_event."entityId" IS DISTINCT FROM reset_request_entry."id"
         OR reset_request_entry."revokedAt" IS NOT NULL
         OR reset_request_entry."expiresAt" <= LOCALTIMESTAMP(3) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'AuditLog v3 password-reset delivery resource is invalid';
      END IF;
    END IF;
    IF outbox_entry."purpose" = 'INVITATION' AND (
      NEW."action" <> 'deliverAdminInvitationNotification'
      OR NEW."causationEventId" IS DISTINCT FROM outbox_entry."sourceAuditLogId"
      OR NEW."adminInvitationId" IS DISTINCT FROM outbox_entry."adminInvitationId"
      OR NEW."entityType" <> 'ADMIN_INVITATION'
      OR NEW."entityId" IS DISTINCT FROM outbox_entry."adminInvitationId"
      OR outbox_entry."state" <> 'DELIVERED'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 invitation delivery binding is invalid';
    END IF;
    IF outbox_entry."purpose" = 'INVITATION' THEN
      SELECT * INTO invitation_entry
      FROM public."AdminInvitation"
      WHERE "id" = outbox_entry."adminInvitationId";
      IF NOT FOUND
         OR invitation_entry."createdByAuditLogId"
              IS DISTINCT FROM outbox_entry."sourceAuditLogId"
         OR causal_audit."entityType" <> 'ADMIN_INVITATION'
         OR causal_audit."entityId" IS DISTINCT FROM invitation_entry."id"
         OR invitation_entry."state" <> 'PENDING'
         OR invitation_entry."expiresAt" <= LOCALTIMESTAMP(3) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'AuditLog v3 invitation delivery resource is invalid';
      END IF;
    END IF;
  END IF;

  IF NEW."action" = 'cancelAdminRecoveryCase' THEN
    SELECT * INTO recovery_case_entry
    FROM public."AdminRecoveryCase"
    WHERE "id" = NEW."adminRecoveryCaseId";
    IF causal_audit."action" = 'createAdminRecoveryCase' THEN
      SELECT * INTO causal_recovery_case
      FROM public."AdminRecoveryCase"
      WHERE "id" = causal_audit."entityId";
    END IF;
    IF recovery_case_entry."id" IS NULL
       OR recovery_case_entry."state" <> 'CANCELLED'
       OR NEW."context" <> 'SYSTEM'
       OR NEW."causationEventId" IS NULL
       OR NEW."causationSecurityEventId" IS NOT NULL
       OR NEW."entityType" <> 'ADMIN_RECOVERY_CASE'
       OR NEW."entityId" IS DISTINCT FROM recovery_case_entry."id"
       OR causal_audit."action" NOT IN (
         'createAdminRecoveryCase',
         'changeAdminUserRole',
         'changeAdminUserStatus'
       )
       OR (
         causal_audit."action" = 'createAdminRecoveryCase'
         AND (
           causal_audit."entityType" <> 'ADMIN_RECOVERY_CASE'
           OR causal_audit."entityId" = recovery_case_entry."id"
           OR causal_audit."adminRecoveryCaseId" IS DISTINCT FROM causal_audit."entityId"
           OR causal_recovery_case."id" IS NULL
           OR causal_recovery_case."subjectAdminUserId"
                IS DISTINCT FROM recovery_case_entry."subjectAdminUserId"
         )
       )
       OR (
         causal_audit."action" IN ('changeAdminUserRole', 'changeAdminUserStatus')
         AND (
           causal_audit."entityType" <> 'ADMIN_USER'
           OR causal_audit."entityId" IS DISTINCT FROM recovery_case_entry."subjectAdminUserId"
         )
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 recovery cancellation source is invalid';
    END IF;
  END IF;

  IF NEW."action" = 'expireAdminRecoveryCase' THEN
    SELECT * INTO recovery_case_entry
    FROM public."AdminRecoveryCase"
    WHERE "id" = NEW."adminRecoveryCaseId";
    IF NOT FOUND
       OR recovery_case_entry."state" <> 'EXPIRED'
       OR NEW."context" <> 'SYSTEM'
       OR NEW."causationEventId" IS NOT NULL
       OR NEW."causationSecurityEventId" IS NOT NULL
       OR NEW."delegatedByAdminUserId" IS NOT NULL
       OR NEW."entityType" <> 'ADMIN_RECOVERY_CASE'
       OR NEW."entityId" IS DISTINCT FROM recovery_case_entry."id" THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 recovery expiration source is invalid';
    END IF;
  END IF;

  IF NEW."action" = 'bootstrapAdminUser' THEN
    SELECT * INTO bootstrap_entry
    FROM public."AdminBootstrapGuard"
    WHERE "singletonKey" = NEW."bootstrapGuardId";
    IF NOT FOUND
       OR NEW."context" <> 'SYSTEM'
       OR bootstrap_entry."bootstrapAuditLogId" IS DISTINCT FROM NEW."id"
       OR NEW."entityType" <> 'ADMIN_USER'
       OR NEW."entityId" IS DISTINCT FROM bootstrap_entry."adminUserId"
       OR NEW."causationEventId" IS NOT NULL
       OR NEW."causationSecurityEventId" IS NOT NULL
       OR NEW."delegatedByAdminUserId" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AuditLog v3 bootstrap source is invalid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_validate_audit_log_v3_causality() FROM PUBLIC;
CREATE TRIGGER "AuditLog_v3_causality"
  BEFORE INSERT ON public."AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.kora_validate_audit_log_v3_causality();

REVOKE ALL ON FUNCTION public.kora_enforce_audit_log_v2_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_guard_admin_password_reset_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_guard_admin_password_reset_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_guard_admin_recovery_case() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_guard_admin_invitation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_guard_admin_notification_outbox() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_validate_admin_snapshot_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_assert_admin_snapshot_complete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_guard_admin_c2_idempotency_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kora_guard_c2a_admin_user_insert() FROM PUBLIC;

CREATE VIEW public."AdminC2NotificationSecurityEventSource"
WITH (security_barrier = true)
AS
SELECT security_event."id", security_event."action", security_event."eventClass",
       security_event."outcome", security_event."failureCode",
       security_event."entityType", security_event."entityId",
       reset_request."id" AS "passwordResetRequestId",
       reset_request."expiresAt", reset_request."revokedAt",
       reset_request."replacedRequestId",
       outbox_entry."id" AS "notificationOutboxId",
       outbox_entry."state" AS "outboxState",
       security_event."createdAt"
FROM public."AdminSecurityEvent" AS security_event
JOIN public."AdminPasswordResetRequest" AS reset_request
  ON reset_request."securityEventId" = security_event."id"
 AND reset_request."id" = security_event."entityId"
JOIN public."AdminNotificationOutbox" AS outbox_entry
  ON outbox_entry."sourceSecurityEventId" = reset_request."securityEventId"
 AND outbox_entry."passwordResetRequestId" = reset_request."id"
WHERE security_event."action" = 'requestAdminPasswordReset'
  AND security_event."eventClass" = 'LOGIN'
  AND security_event."outcome" = 'SUCCEEDED'
  AND security_event."failureCode" IS NULL
  AND security_event."entityType" = 'ADMIN_PASSWORD_RESET_REQUEST'
  AND reset_request."revokedAt" IS NULL
  AND reset_request."expiresAt" > LOCALTIMESTAMP(3)
  AND outbox_entry."purpose" = 'PASSWORD_RESET'
  AND outbox_entry."state" IN ('PENDING', 'CLAIMED');

CREATE VIEW public."AdminC2NotificationAuditSource"
WITH (security_barrier = true)
AS
SELECT audit_entry."id", audit_entry."version",
       audit_entry."adminUserId" AS "actorAdminUserId",
       audit_entry."action", audit_entry."eventClass", audit_entry."context",
       audit_entry."outcome", audit_entry."failureCode",
       audit_entry."entityType", audit_entry."entityId",
       invitation_entry."id" AS "adminInvitationId",
       invitation_entry."state" AS "invitationState",
       invitation_entry."expiresAt", invitation_entry."replacedInvitationId",
       outbox_entry."id" AS "notificationOutboxId",
       outbox_entry."state" AS "outboxState",
       audit_entry."createdAt"
FROM public."AuditLog" AS audit_entry
JOIN public."AdminInvitation" AS invitation_entry
  ON invitation_entry."createdByAuditLogId" = audit_entry."id"
 AND invitation_entry."id" = audit_entry."entityId"
JOIN public."AdminNotificationOutbox" AS outbox_entry
  ON outbox_entry."sourceAuditLogId" = invitation_entry."createdByAuditLogId"
 AND outbox_entry."adminInvitationId" = invitation_entry."id"
WHERE audit_entry."version" = 3
  AND audit_entry."action" = 'createAdminInvitation'
  AND audit_entry."eventClass" = 'BUSINESS'
  AND audit_entry."context" = 'ADMIN_SESSION'
  AND audit_entry."outcome" = 'SUCCESS'
  AND audit_entry."failureCode" IS NULL
  AND audit_entry."entityType" = 'ADMIN_INVITATION'
  AND invitation_entry."state" = 'PENDING'
  AND invitation_entry."expiresAt" > LOCALTIMESTAMP(3)
  AND outbox_entry."purpose" = 'INVITATION'
  AND outbox_entry."state" IN ('PENDING', 'CLAIMED');

REVOKE ALL ON public."AdminC2NotificationSecurityEventSource" FROM PUBLIC;
REVOKE ALL ON public."AdminC2NotificationAuditSource" FROM PUBLIC;

ALTER TABLE public."AdminC2IdempotencyRecord"
  ADD CONSTRAINT "AdminC2IdempotencyRecord_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."AdminSecurityEvent"
  ADD CONSTRAINT "AdminSecurityEvent_adminInvitationId_fkey"
    FOREIGN KEY ("adminInvitationId") REFERENCES public."AdminInvitation"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."AuditLog"
  ADD CONSTRAINT "AuditLog_adminPasswordResetContextId_adminUserId_fkey"
    FOREIGN KEY ("adminPasswordResetContextId", "adminUserId")
    REFERENCES public."AdminPasswordResetContext"("id", "adminUserId")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AuditLog_causationSecurityEventId_fkey"
    FOREIGN KEY ("causationSecurityEventId") REFERENCES public."AdminSecurityEvent"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AuditLog_adminRecoveryCaseId_fkey"
    FOREIGN KEY ("adminRecoveryCaseId") REFERENCES public."AdminRecoveryCase"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AuditLog_adminInvitationId_fkey"
    FOREIGN KEY ("adminInvitationId") REFERENCES public."AdminInvitation"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AuditLog_notificationOutboxId_fkey"
    FOREIGN KEY ("notificationOutboxId") REFERENCES public."AdminNotificationOutbox"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "AuditLog_bootstrapGuardId_fkey"
    FOREIGN KEY ("bootstrapGuardId") REFERENCES public."AdminBootstrapGuard"("singletonKey")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

