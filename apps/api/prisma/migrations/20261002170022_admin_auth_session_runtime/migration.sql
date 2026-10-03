-- S1.2-03C1 Admin authentication and session runtime storage.
-- Historical migrations remain immutable. This migration performs no data
-- backfill: legacy admin accounts are conservatively disabled by the column
-- default, and legacy audit rows obtain version 1 through PostgreSQL's ADD
-- COLUMN default semantics before the default is changed for future rows.

CREATE TYPE "AdminStatus" AS ENUM (
  'INVITED', 'PENDING_MFA', 'ACTIVE', 'SUSPENDED', 'DISABLED'
);
CREATE TYPE "AdminPreAuthPurpose" AS ENUM (
  'FIRST_TOTP_ENROLLMENT', 'TOTP_VERIFY'
);
CREATE TYPE "AdminStepUpPurpose" AS ENUM (
  'SESSION_REVOCATION', 'RECOVERY_APPROVAL', 'AUDIT_EXPORT',
  'INVITATION', 'ROLE_CHANGE', 'STATUS_CHANGE'
);
CREATE TYPE "AdminAuditContext" AS ENUM (
  'ADMIN_SESSION', 'ADMIN_RECOVERY', 'SYSTEM'
);
CREATE TYPE "AdminAuditEventClass" AS ENUM (
  'LOGIN', 'SESSION', 'EXPORT', 'BUSINESS'
);
CREATE TYPE "AdminSecurityEventOutcome" AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE "AdminReasonCode" AS ENUM (
  'SECURITY_RESPONSE', 'ACCOUNT_RECOVERY', 'ROLE_ADMINISTRATION',
  'STATUS_ADMINISTRATION', 'AUDIT_EXPORT', 'INVITATION_ADMINISTRATION'
);

ALTER TABLE "AdminUser"
  ADD COLUMN "status" "AdminStatus" NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN "authorizationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastAcceptedTotpCounter" BIGINT;

ALTER TABLE "AdminSession"
  ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3),
  ADD COLUMN "authorizationVersion" INTEGER,
  ADD COLUMN "stepUpPurpose" "AdminStepUpPurpose",
  ADD COLUMN "stepUpVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "stepUpExpiresAt" TIMESTAMP(3);

CREATE TABLE "AdminPreAuthContext" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" "AdminPreAuthPurpose" NOT NULL,
  "authorizationVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPreAuthContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminRecoveryCodeBatch" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRecoveryCodeBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdminRecoveryCode"
  ADD COLUMN "batchId" TEXT,
  ADD COLUMN "selector" TEXT;

CREATE TABLE "AdminRecoveryContext" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "recoveryCodeId" TEXT NOT NULL,
  "authorizationVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRecoveryContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminTotpEnrollment" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "adminPreAuthContextId" TEXT,
  "adminRecoveryContextId" TEXT,
  "secretEncrypted" TEXT NOT NULL,
  "authorizationVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "qrDeliveredAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminTotpEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminRefreshToken" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "adminSessionId" TEXT NOT NULL,
  "previousTokenId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminSecurityEvent" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT,
  "eventClass" "AdminAuditEventClass" NOT NULL,
  "action" TEXT NOT NULL,
  "outcome" "AdminSecurityEventOutcome" NOT NULL,
  "failureCode" TEXT,
  "requestId" TEXT NOT NULL,
  "subjectRefHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSecurityEvent_pkey" PRIMARY KEY ("id")
);

-- Audit v1 rows retain their original physical values and gain only metadata
-- defaults. No UPDATE or trigger disablement is used.
ALTER TABLE "AuditLog"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "subjectAdminUserId" TEXT,
  ADD COLUMN "delegatedByAdminUserId" TEXT,
  ADD COLUMN "adminRecoveryContextId" TEXT,
  ADD COLUMN "systemExecutionRefHash" TEXT,
  ADD COLUMN "eventClass" "AdminAuditEventClass",
  ADD COLUMN "context" "AdminAuditContext",
  ADD COLUMN "reasonCode" "AdminReasonCode",
  ADD COLUMN "operatorReason" TEXT,
  ADD COLUMN "causationEventId" TEXT,
  ALTER COLUMN "adminUserId" DROP NOT NULL,
  ALTER COLUMN "adminSessionId" DROP NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "version" SET DEFAULT 2;

CREATE UNIQUE INDEX "AdminRecoveryCode_id_adminUserId_key"
  ON "AdminRecoveryCode"("id", "adminUserId");
CREATE UNIQUE INDEX "AdminRecoveryCode_selector_key"
  ON "AdminRecoveryCode"("selector");

CREATE UNIQUE INDEX "AdminPreAuthContext_tokenHash_key"
  ON "AdminPreAuthContext"("tokenHash");
CREATE UNIQUE INDEX "AdminPreAuthContext_id_adminUserId_key"
  ON "AdminPreAuthContext"("id", "adminUserId");
CREATE INDEX "AdminPreAuthContext_adminUserId_expiresAt_idx"
  ON "AdminPreAuthContext"("adminUserId", "expiresAt");

CREATE UNIQUE INDEX "AdminRecoveryCodeBatch_id_adminUserId_key"
  ON "AdminRecoveryCodeBatch"("id", "adminUserId");
CREATE UNIQUE INDEX "AdminRecoveryCodeBatch_one_active_per_user_key"
  ON "AdminRecoveryCodeBatch"("adminUserId") WHERE "revokedAt" IS NULL;
CREATE INDEX "AdminRecoveryCodeBatch_adminUserId_createdAt_idx"
  ON "AdminRecoveryCodeBatch"("adminUserId", "createdAt");

CREATE UNIQUE INDEX "AdminRecoveryContext_tokenHash_key"
  ON "AdminRecoveryContext"("tokenHash");
CREATE UNIQUE INDEX "AdminRecoveryContext_recoveryCodeId_key"
  ON "AdminRecoveryContext"("recoveryCodeId");
CREATE UNIQUE INDEX "AdminRecoveryContext_id_adminUserId_key"
  ON "AdminRecoveryContext"("id", "adminUserId");
CREATE INDEX "AdminRecoveryContext_adminUserId_expiresAt_idx"
  ON "AdminRecoveryContext"("adminUserId", "expiresAt");

CREATE UNIQUE INDEX "AdminTotpEnrollment_adminPreAuthContextId_key"
  ON "AdminTotpEnrollment"("adminPreAuthContextId");
CREATE UNIQUE INDEX "AdminTotpEnrollment_adminRecoveryContextId_key"
  ON "AdminTotpEnrollment"("adminRecoveryContextId");
CREATE UNIQUE INDEX "AdminTotpEnrollment_id_adminUserId_key"
  ON "AdminTotpEnrollment"("id", "adminUserId");
CREATE UNIQUE INDEX "AdminTotpEnrollment_adminPreAuthContextId_adminUserId_key"
  ON "AdminTotpEnrollment"("adminPreAuthContextId", "adminUserId");
CREATE UNIQUE INDEX "AdminTotpEnrollment_adminRecoveryContextId_adminUserId_key"
  ON "AdminTotpEnrollment"("adminRecoveryContextId", "adminUserId");
CREATE INDEX "AdminTotpEnrollment_adminUserId_expiresAt_idx"
  ON "AdminTotpEnrollment"("adminUserId", "expiresAt");

CREATE UNIQUE INDEX "AdminRefreshToken_previousTokenId_key"
  ON "AdminRefreshToken"("previousTokenId");
CREATE UNIQUE INDEX "AdminRefreshToken_tokenHash_key"
  ON "AdminRefreshToken"("tokenHash");
CREATE UNIQUE INDEX "AdminRefreshToken_id_adminUserId_adminSessionId_key"
  ON "AdminRefreshToken"("id", "adminUserId", "adminSessionId");
CREATE UNIQUE INDEX "AdminRefreshToken_previousTokenId_adminUserId_adminSessionId_key"
  ON "AdminRefreshToken"("previousTokenId", "adminUserId", "adminSessionId");
CREATE INDEX "AdminRefreshToken_adminSessionId_generation_idx"
  ON "AdminRefreshToken"("adminSessionId", "generation");
CREATE INDEX "AdminRefreshToken_adminUserId_expiresAt_idx"
  ON "AdminRefreshToken"("adminUserId", "expiresAt");

CREATE INDEX "AdminSecurityEvent_adminUserId_createdAt_idx"
  ON "AdminSecurityEvent"("adminUserId", "createdAt");
CREATE INDEX "AdminSecurityEvent_eventClass_action_createdAt_idx"
  ON "AdminSecurityEvent"("eventClass", "action", "createdAt");

CREATE INDEX "AuditLog_subjectAdminUserId_createdAt_idx"
  ON "AuditLog"("subjectAdminUserId", "createdAt");
CREATE INDEX "AuditLog_context_createdAt_idx"
  ON "AuditLog"("context", "createdAt");

ALTER TABLE "AdminPreAuthContext"
  ADD CONSTRAINT "AdminPreAuthContext_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AdminRecoveryCodeBatch"
  ADD CONSTRAINT "AdminRecoveryCodeBatch_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AdminRecoveryCode"
  ADD CONSTRAINT "AdminRecoveryCode_batchId_adminUserId_fkey"
  FOREIGN KEY ("batchId", "adminUserId")
  REFERENCES "AdminRecoveryCodeBatch"("id", "adminUserId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AdminRecoveryContext"
  ADD CONSTRAINT "AdminRecoveryContext_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminRecoveryContext_recoveryCodeId_adminUserId_fkey"
  FOREIGN KEY ("recoveryCodeId", "adminUserId")
  REFERENCES "AdminRecoveryCode"("id", "adminUserId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AdminTotpEnrollment"
  ADD CONSTRAINT "AdminTotpEnrollment_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminTotpEnrollment_adminPreAuthContextId_adminUserId_fkey"
  FOREIGN KEY ("adminPreAuthContextId", "adminUserId")
  REFERENCES "AdminPreAuthContext"("id", "adminUserId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminTotpEnrollment_adminRecoveryContextId_adminUserId_fkey"
  FOREIGN KEY ("adminRecoveryContextId", "adminUserId")
  REFERENCES "AdminRecoveryContext"("id", "adminUserId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AdminRefreshToken"
  ADD CONSTRAINT "AdminRefreshToken_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminRefreshToken_adminSessionId_adminUserId_fkey"
  FOREIGN KEY ("adminSessionId", "adminUserId")
  REFERENCES "AdminSession"("id", "adminUserId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminRefreshToken_previousTokenId_adminUserId_adminSessionId_fkey"
  FOREIGN KEY ("previousTokenId", "adminUserId", "adminSessionId")
  REFERENCES "AdminRefreshToken"("id", "adminUserId", "adminSessionId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AdminSecurityEvent"
  ADD CONSTRAINT "AdminSecurityEvent_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_subjectAdminUserId_fkey"
  FOREIGN KEY ("subjectAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AuditLog_delegatedByAdminUserId_fkey"
  FOREIGN KEY ("delegatedByAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AuditLog_adminRecoveryContextId_adminUserId_fkey"
  FOREIGN KEY ("adminRecoveryContextId", "adminUserId")
  REFERENCES "AdminRecoveryContext"("id", "adminUserId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AuditLog_causationEventId_fkey"
  FOREIGN KEY ("causationEventId") REFERENCES "AuditLog"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "AdminUser"
  ADD CONSTRAINT "AdminUser_authorizationVersion_check"
  CHECK ("authorizationVersion" >= 1),
  ADD CONSTRAINT "AdminUser_lastAcceptedTotpCounter_check"
  CHECK ("lastAcceptedTotpCounter" IS NULL OR "lastAcceptedTotpCounter" >= 0);

ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_c1_window_check"
  CHECK (
    ("absoluteExpiresAt" IS NULL AND "authorizationVersion" IS NULL)
    OR (
      "absoluteExpiresAt" IS NOT NULL
      AND "authorizationVersion" >= 1
      AND "expiresAt" <= "absoluteExpiresAt"
      AND "absoluteExpiresAt" <= "createdAt" + INTERVAL '12 hours'
    )
  ),
  ADD CONSTRAINT "AdminSession_step_up_check"
  CHECK (
    ("stepUpPurpose" IS NULL AND "stepUpVerifiedAt" IS NULL AND "stepUpExpiresAt" IS NULL)
    OR (
      "stepUpPurpose" IS NOT NULL
      AND "stepUpVerifiedAt" IS NOT NULL
      AND "stepUpExpiresAt" > "stepUpVerifiedAt"
      AND "stepUpExpiresAt" <= "stepUpVerifiedAt" + INTERVAL '5 minutes'
    )
  );

CREATE FUNCTION public.kora_guard_admin_user_c1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  table_owner NAME;
BEGIN
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

  IF current_user <> table_owner THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
       AND NOT (
         (OLD."status" = 'ACTIVE' AND NEW."status" = 'PENDING_MFA')
         OR (OLD."status" = 'PENDING_MFA' AND NEW."status" = 'ACTIVE')
       ) THEN
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

CREATE TRIGGER "AdminUser_c1_transitions"
  BEFORE UPDATE ON "AdminUser"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_user_c1();

CREATE FUNCTION public.kora_guard_admin_session_c1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."absoluteExpiresAt" IS NULL OR NEW."authorizationVersion" IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'new AdminSession rows require C1 authorization and absolute expiry';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW."id", NEW."adminUserId", NEW."tokenFamilyId", NEW."lastTwoFactorAt",
         NEW."absoluteExpiresAt", NEW."authorizationVersion", NEW."createdAt")
       IS DISTINCT FROM
     ROW(OLD."id", OLD."adminUserId", OLD."tokenFamilyId", OLD."lastTwoFactorAt",
         OLD."absoluteExpiresAt", OLD."authorizationVersion", OLD."createdAt") THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminSession identity and absolute authorization binding are immutable';
  END IF;

  IF ROW(NEW."accessTokenJti", NEW."refreshTokenHash", NEW."refreshTokenVersion")
       IS DISTINCT FROM
     ROW(OLD."accessTokenJti", OLD."refreshTokenHash", OLD."refreshTokenVersion")
     AND NOT (
       NEW."accessTokenJti" IS DISTINCT FROM OLD."accessTokenJti"
       AND NEW."refreshTokenHash" IS DISTINCT FROM OLD."refreshTokenHash"
       AND NEW."refreshTokenVersion" = OLD."refreshTokenVersion" + 1
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminSession access and refresh pointers must rotate atomically';
  END IF;

  IF NEW."lastActivityAt" < OLD."lastActivityAt"
     OR NEW."expiresAt" < OLD."expiresAt"
     OR NEW."updatedAt" < OLD."updatedAt"
     OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt")
     OR (NEW."revokedAt" IS NOT NULL AND NEW."revokedAt" < NEW."createdAt") THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminSession temporal transition is not monotone';
  END IF;

  IF OLD."stepUpVerifiedAt" IS NOT NULL
     AND (
       NEW."stepUpVerifiedAt" IS NULL
       OR NEW."stepUpVerifiedAt" < OLD."stepUpVerifiedAt"
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminSession step-up proof cannot move backward';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdminSession_c1_transitions"
  BEFORE INSERT OR UPDATE ON "AdminSession"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_session_c1();

CREATE FUNCTION public.kora_assert_admin_session_family_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  active_family_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER
    INTO active_family_count
  FROM public."AdminSession" AS session_entry
  WHERE session_entry."adminUserId" = NEW."adminUserId"
    AND session_entry."revokedAt" IS NULL
    AND session_entry."expiresAt" > CURRENT_TIMESTAMP
    AND session_entry."absoluteExpiresAt" > CURRENT_TIMESTAMP;

  IF active_family_count > 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminSession active family cap exceeded';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AdminSession_family_cap"
  AFTER INSERT OR UPDATE ON "AdminSession"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_session_family_cap();

CREATE FUNCTION public.kora_guard_admin_pre_auth_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."id", NEW."adminUserId", NEW."tokenHash", NEW."purpose",
           NEW."authorizationVersion", NEW."expiresAt", NEW."createdAt")
         IS DISTINCT FROM
       ROW(OLD."id", OLD."adminUserId", OLD."tokenHash", OLD."purpose",
           OLD."authorizationVersion", OLD."expiresAt", OLD."createdAt")
       OR (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt")
       OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminPreAuthContext identity or terminal marker is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdminPreAuthContext_monotone"
  BEFORE UPDATE ON "AdminPreAuthContext"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_pre_auth_context();

CREATE FUNCTION public.kora_guard_admin_recovery_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."id", NEW."adminUserId", NEW."tokenHash", NEW."recoveryCodeId",
           NEW."authorizationVersion", NEW."expiresAt", NEW."createdAt")
         IS DISTINCT FROM
       ROW(OLD."id", OLD."adminUserId", OLD."tokenHash", OLD."recoveryCodeId",
           OLD."authorizationVersion", OLD."expiresAt", OLD."createdAt")
       OR (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt")
       OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminRecoveryContext identity or terminal marker is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdminRecoveryContext_monotone"
  BEFORE UPDATE ON "AdminRecoveryContext"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_recovery_context();

CREATE FUNCTION public.kora_guard_admin_totp_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."id", NEW."adminUserId", NEW."adminPreAuthContextId",
           NEW."adminRecoveryContextId", NEW."secretEncrypted",
           NEW."authorizationVersion", NEW."expiresAt", NEW."createdAt")
         IS DISTINCT FROM
       ROW(OLD."id", OLD."adminUserId", OLD."adminPreAuthContextId",
           OLD."adminRecoveryContextId", OLD."secretEncrypted",
           OLD."authorizationVersion", OLD."expiresAt", OLD."createdAt")
       OR (OLD."qrDeliveredAt" IS NOT NULL AND NEW."qrDeliveredAt" IS DISTINCT FROM OLD."qrDeliveredAt")
       OR (OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt")
       OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt") THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminTotpEnrollment identity or transition marker is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdminTotpEnrollment_monotone"
  BEFORE UPDATE ON "AdminTotpEnrollment"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_totp_enrollment();

CREATE FUNCTION public.kora_guard_admin_recovery_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    ROW(NEW."id", NEW."adminUserId", NEW."createdAt")
      IS DISTINCT FROM ROW(OLD."id", OLD."adminUserId", OLD."createdAt")
    OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt")
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminRecoveryCodeBatch identity or revocation is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdminRecoveryCodeBatch_monotone"
  BEFORE UPDATE ON "AdminRecoveryCodeBatch"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_recovery_batch();

-- Replace the historical guard so C1 batch and selector identity are covered
-- while legacy rows with both new fields null remain consumable.
CREATE OR REPLACE FUNCTION public.kora_guard_admin_recovery_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."usedAt" IS NOT NULL
       OR NEW."batchId" IS NULL
       OR NEW."selector" IS NULL
       OR NEW."codeHash" NOT LIKE '$argon2id$%' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'new AdminRecoveryCode rows require an unused C1 batch, selector and Argon2id hash';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW."id", NEW."adminUserId", NEW."batchId", NEW."selector",
         NEW."codeHash", NEW."createdAt")
       IS DISTINCT FROM
     ROW(OLD."id", OLD."adminUserId", OLD."batchId", OLD."selector",
         OLD."codeHash", OLD."createdAt")
     OR (OLD."usedAt" IS NOT NULL AND NEW."usedAt" IS DISTINCT FROM OLD."usedAt") THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminRecoveryCode identity, hash and consumption proof are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.kora_assert_admin_recovery_batch_size()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_batch_id TEXT;
  code_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'AdminRecoveryCodeBatch' THEN
    affected_batch_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    affected_batch_id := OLD."batchId";
  ELSE
    affected_batch_id := NEW."batchId";
  END IF;

  IF affected_batch_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public."AdminRecoveryCodeBatch" AS batch_entry
       WHERE batch_entry."id" = affected_batch_id
     ) THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::INTEGER
    INTO code_count
  FROM public."AdminRecoveryCode" AS code_entry
  WHERE code_entry."batchId" = affected_batch_id;

  IF code_count <> 10 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminRecoveryCodeBatch must contain exactly ten codes at commit';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AdminRecoveryCodeBatch_exactly_ten"
  AFTER INSERT OR UPDATE ON "AdminRecoveryCodeBatch"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_recovery_batch_size();
CREATE CONSTRAINT TRIGGER "AdminRecoveryCode_exactly_ten_per_batch"
  AFTER INSERT OR UPDATE OR DELETE ON "AdminRecoveryCode"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_recovery_batch_size();

CREATE FUNCTION public.kora_guard_admin_refresh_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  predecessor_generation INTEGER;
  predecessor_consumed_at TIMESTAMP(3);
BEGIN
  IF TG_OP = 'INSERT' AND NEW."previousTokenId" IS NOT NULL THEN
    SELECT token_entry."generation", token_entry."consumedAt"
      INTO predecessor_generation, predecessor_consumed_at
    FROM public."AdminRefreshToken" AS token_entry
    WHERE token_entry."id" = NEW."previousTokenId"
      AND token_entry."adminUserId" = NEW."adminUserId"
      AND token_entry."adminSessionId" = NEW."adminSessionId"
    FOR KEY SHARE;

    IF predecessor_generation IS NULL
       OR NEW."generation" <> predecessor_generation + 1
       OR predecessor_consumed_at IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'AdminRefreshToken predecessor must be consumed and generation must increase by one';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    ROW(NEW."id", NEW."adminUserId", NEW."adminSessionId", NEW."previousTokenId",
        NEW."tokenHash", NEW."generation", NEW."expiresAt", NEW."createdAt")
      IS DISTINCT FROM
    ROW(OLD."id", OLD."adminUserId", OLD."adminSessionId", OLD."previousTokenId",
        OLD."tokenHash", OLD."generation", OLD."expiresAt", OLD."createdAt")
    OR (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt")
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'AdminRefreshToken identity, chain and consumption are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AdminRefreshToken_chain_and_consumption"
  BEFORE INSERT OR UPDATE ON "AdminRefreshToken"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_refresh_token();

CREATE FUNCTION public.kora_enforce_audit_log_v2_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."version" <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'new AuditLog rows must use version 2';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditLog_v2_insert"
  BEFORE INSERT ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.kora_enforce_audit_log_v2_insert();

CREATE TRIGGER "AdminSecurityEvent_append_only"
  BEFORE UPDATE OR DELETE ON "AdminSecurityEvent"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();

ALTER TABLE "AdminPreAuthContext"
  ADD CONSTRAINT "AdminPreAuthContext_state_check"
  CHECK (
    "tokenHash" ~ '^[a-f0-9]{64}$'
    AND "authorizationVersion" >= 1
    AND "expiresAt" > "createdAt"
    AND ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    AND NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
  );

ALTER TABLE "AdminRecoveryCodeBatch"
  ADD CONSTRAINT "AdminRecoveryCodeBatch_revokedAt_check"
  CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");

ALTER TABLE "AdminRecoveryCode"
  ADD CONSTRAINT "AdminRecoveryCode_batch_selector_check"
  CHECK (
    ("batchId" IS NULL AND "selector" IS NULL)
    OR (
      "batchId" IS NOT NULL
      AND "selector" IS NOT NULL
      AND length("selector") BETWEEN 8 AND 16
      AND "selector" ~ '^[A-HJ-NP-Z2-9]+$'
    )
  );

ALTER TABLE "AdminRecoveryContext"
  ADD CONSTRAINT "AdminRecoveryContext_state_check"
  CHECK (
    "tokenHash" ~ '^[a-f0-9]{64}$'
    AND "authorizationVersion" >= 1
    AND "expiresAt" > "createdAt"
    AND ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    AND NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
  );

ALTER TABLE "AdminTotpEnrollment"
  ADD CONSTRAINT "AdminTotpEnrollment_context_xor_check"
  CHECK (("adminPreAuthContextId" IS NULL) <> ("adminRecoveryContextId" IS NULL)),
  ADD CONSTRAINT "AdminTotpEnrollment_state_check"
  CHECK (
    length("secretEncrypted") > 0
    AND "authorizationVersion" >= 1
    AND "expiresAt" > "createdAt"
    AND ("qrDeliveredAt" IS NULL OR "qrDeliveredAt" >= "createdAt")
    AND (
      "confirmedAt" IS NULL
      OR ("qrDeliveredAt" IS NOT NULL AND "confirmedAt" >= "qrDeliveredAt")
    )
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
    AND NOT ("confirmedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
  );

ALTER TABLE "AdminRefreshToken"
  ADD CONSTRAINT "AdminRefreshToken_state_check"
  CHECK (
    "tokenHash" ~ '^[a-f0-9]{64}$'
    AND "generation" >= 1
    AND "expiresAt" > "createdAt"
    AND ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
    AND (
      ("generation" = 1 AND "previousTokenId" IS NULL)
      OR ("generation" > 1 AND "previousTokenId" IS NOT NULL)
    )
  );

ALTER TABLE "AdminSecurityEvent"
  ADD CONSTRAINT "AdminSecurityEvent_payload_check"
  CHECK (
    length("action") BETWEEN 1 AND 120
    AND length("requestId") BETWEEN 8 AND 128
    AND ("subjectRefHash" IS NULL OR "subjectRefHash" ~ '^[a-f0-9]{64}$')
    AND (
      ("outcome" = 'SUCCEEDED' AND "failureCode" IS NULL)
      OR (
        "outcome" = 'FAILED'
        AND "failureCode" IS NOT NULL
        AND length("failureCode") BETWEEN 1 AND 120
      )
    )
  );

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_version_check" CHECK ("version" IN (1, 2)),
  ADD CONSTRAINT "AuditLog_v2_context_check"
  CHECK (
    (
      "version" = 1
      AND "eventClass" IS NULL
      AND "context" IS NULL
      AND "subjectAdminUserId" IS NULL
      AND "delegatedByAdminUserId" IS NULL
      AND "adminRecoveryContextId" IS NULL
      AND "systemExecutionRefHash" IS NULL
      AND "reasonCode" IS NULL
      AND "operatorReason" IS NULL
      AND "causationEventId" IS NULL
    )
    OR (
      "version" = 2
      AND "eventClass" IS NOT NULL
      AND "context" IS NOT NULL
      AND "reasonCode" IS NOT NULL
      AND ("operatorReason" IS NULL OR length("operatorReason") BETWEEN 3 AND 500)
      AND ("systemExecutionRefHash" IS NULL OR "systemExecutionRefHash" ~ '^[a-f0-9]{64}$')
      AND "causationEventId" IS DISTINCT FROM "id"
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
  );
