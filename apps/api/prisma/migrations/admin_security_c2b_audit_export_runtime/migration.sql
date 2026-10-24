-- S1.2-03C2b audit/export runtime. Published C1/C2a migrations remain immutable.
-- This directory name is the literal additive migration authorized by the CTO.

DO $c2b_upgrade_preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."AdminPaginationSnapshot"
    WHERE "operation"::text = 'LIST_ADMIN_AUDIT_LOGS'
  ) OR EXISTS (
    SELECT 1 FROM public."AdminC2IdempotencyRecord"
    WHERE "operation"::text = 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'C2b migration refused reserved operations in C2a physical tables';
  END IF;
END;
$c2b_upgrade_preflight$;

ALTER TABLE public."AdminPaginationSnapshot"
  ADD CONSTRAINT "AdminPaginationSnapshot_c2b_operation_reject"
  CHECK ("operation"::text NOT IN ('LIST_ADMIN_AUDIT_LOGS', 'CREATE_ADMIN_AUDIT_LOG_EXPORT'));

ALTER TABLE public."AdminC2IdempotencyRecord"
  ADD CONSTRAINT "AdminC2IdempotencyRecord_c2b_operation_reject"
  CHECK ("operation"::text <> 'CREATE_ADMIN_AUDIT_LOG_EXPORT');

CREATE TYPE "AdminAuditSnapshotOperation" AS ENUM (
  'LIST_ADMIN_AUDIT_LOGS', 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
);
CREATE TYPE "AdminAuditExportIdempotencyOperation" AS ENUM (
  'CREATE_ADMIN_AUDIT_LOG_EXPORT'
);

CREATE TYPE "AdminAuditExportState" AS ENUM (
  'PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED'
);
CREATE TYPE "AdminAuditExportFailureCode" AS ENUM (
  'RETRY_BUDGET_EXHAUSTED',
  'PROJECTION_BUDGET_EXCEEDED',
  'INTEGRITY_FAILED',
  'DEPENDENCY_UNAVAILABLE'
);

ALTER TABLE public."AuditLog"
  ADD COLUMN "adminAuditExportId" TEXT;

CREATE TABLE public."AdminAuditPaginationSnapshot" (
  "id" TEXT NOT NULL,
  "principalAdminUserId" TEXT NOT NULL,
  "operation" "AdminAuditSnapshotOperation" NOT NULL,
  "filtersDigest" TEXT NOT NULL,
  "projectionVersion" INTEGER NOT NULL,
  "entryCount" INTEGER NOT NULL,
  "utf8Bytes" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminAuditPaginationSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminAuditPaginationSnapshot_operation_check"
    CHECK ("operation" IN ('LIST_ADMIN_AUDIT_LOGS', 'CREATE_ADMIN_AUDIT_LOG_EXPORT')),
  CONSTRAINT "AdminAuditPaginationSnapshot_projection_check"
    CHECK (
      "projectionVersion" = 1
      AND "entryCount" BETWEEN 0 AND 10000
      AND "utf8Bytes" BETWEEN 0 AND 26214400
      AND pg_catalog.length("filtersDigest") = 64
    ),
  CONSTRAINT "AdminAuditPaginationSnapshot_window_check"
    CHECK ("expiresAt" = "createdAt" + INTERVAL '15 minutes')
);

CREATE TABLE public."AdminAuditPaginationSnapshotItem" (
  "snapshotId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "resourceId" TEXT NOT NULL,
  "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
  "projectionJson" TEXT NOT NULL,
  "utf8Bytes" INTEGER NOT NULL,
  CONSTRAINT "AdminAuditPaginationSnapshotItem_pkey"
    PRIMARY KEY ("snapshotId", "ordinal"),
  CONSTRAINT "AdminAuditPaginationSnapshotItem_shape_check"
    CHECK (
      "ordinal" >= 0
      AND "utf8Bytes" > 0
      AND "utf8Bytes" <= 26214400
      AND pg_catalog.octet_length("projectionJson") = "utf8Bytes"
    )
);

CREATE TABLE public."AdminAuditExport" (
  "id" TEXT NOT NULL,
  "creatorAdminUserId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "sourceAuditLogId" TEXT NOT NULL,
  "state" "AdminAuditExportState" NOT NULL DEFAULT 'PENDING',
  "generation" BIGINT NOT NULL DEFAULT 1,
  "attemptNumber" INTEGER NOT NULL DEFAULT 0,
  "attemptId" TEXT,
  "claimOwnerHash" TEXT,
  "attemptStartedAt" TIMESTAMP(3),
  "attemptDeadline" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "stagingObjectKey" TEXT,
  "objectKey" TEXT,
  "contentSha256" TEXT,
  "signatureKeyId" TEXT,
  "storageKeyId" TEXT,
  "plaintextBytes" BIGINT,
  "encryptedBytes" BIGINT,
  "failureCode" "AdminAuditExportFailureCode",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  CONSTRAINT "AdminAuditExport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminAuditExport_generation_check" CHECK ("generation" >= 1),
  CONSTRAINT "AdminAuditExport_attempt_check" CHECK ("attemptNumber" BETWEEN 0 AND 3),
  CONSTRAINT "AdminAuditExport_content_hash_check"
    CHECK ("contentSha256" IS NULL OR "contentSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "AdminAuditExport_sizes_check"
    CHECK (
      ("plaintextBytes" IS NULL OR "plaintextBytes" >= 0)
      AND ("encryptedBytes" IS NULL OR "encryptedBytes" > 0)
    ),
  CONSTRAINT "AdminAuditExport_attempt_shape_check"
    CHECK (
      (
        "attemptId" IS NULL AND "claimOwnerHash" IS NULL
        AND "attemptStartedAt" IS NULL AND "attemptDeadline" IS NULL
        AND "leaseExpiresAt" IS NULL
      )
      OR (
        "attemptStartedAt" IS NOT NULL
        AND "attemptDeadline" = "attemptStartedAt" + INTERVAL '600 seconds'
        AND (
          (
            "attemptId" IS NULL AND "claimOwnerHash" IS NULL
            AND "leaseExpiresAt" IS NULL AND "nextAttemptAt" IS NOT NULL
          )
          OR (
            "attemptId" IS NOT NULL AND "claimOwnerHash" IS NOT NULL
            AND "leaseExpiresAt" IS NOT NULL
            AND "leaseExpiresAt" <= "attemptDeadline"
            AND "nextAttemptAt" IS NULL
          )
        )
      )
    ),
  CONSTRAINT "AdminAuditExport_state_shape_check"
    CHECK (
      (
        "state" IN ('PENDING', 'PROCESSING')
        AND "objectKey" IS NULL AND "contentSha256" IS NULL
        AND "signatureKeyId" IS NULL AND "storageKeyId" IS NULL
        AND "plaintextBytes" IS NULL AND "encryptedBytes" IS NULL
        AND "failureCode" IS NULL AND "readyAt" IS NULL
        AND "failedAt" IS NULL AND "expiresAt" IS NULL AND "expiredAt" IS NULL
      )
      OR (
        "state" = 'READY'
        AND "objectKey" IS NOT NULL AND "contentSha256" IS NOT NULL
        AND "signatureKeyId" IS NOT NULL AND "storageKeyId" IS NOT NULL
        AND "plaintextBytes" IS NOT NULL AND "encryptedBytes" IS NOT NULL
        AND "failureCode" IS NULL AND "readyAt" IS NOT NULL
        AND "expiresAt" = "readyAt" + INTERVAL '24 hours'
        AND "failedAt" IS NULL AND "expiredAt" IS NULL
        AND "attemptId" IS NULL AND "claimOwnerHash" IS NULL
        AND "leaseExpiresAt" IS NULL AND "nextAttemptAt" IS NULL
      )
      OR (
        "state" = 'FAILED'
        AND "failureCode" IS NOT NULL AND "failedAt" IS NOT NULL
        AND "objectKey" IS NULL AND "contentSha256" IS NULL
        AND "signatureKeyId" IS NULL AND "storageKeyId" IS NULL
        AND "plaintextBytes" IS NULL AND "encryptedBytes" IS NULL
        AND "readyAt" IS NULL AND "expiresAt" IS NULL AND "expiredAt" IS NULL
        AND "attemptId" IS NULL AND "claimOwnerHash" IS NULL
        AND "leaseExpiresAt" IS NULL AND "nextAttemptAt" IS NULL
      )
      OR (
        "state" = 'EXPIRED'
        AND "objectKey" IS NULL AND "contentSha256" IS NOT NULL
        AND "signatureKeyId" IS NOT NULL AND "storageKeyId" IS NOT NULL
        AND "plaintextBytes" IS NOT NULL AND "encryptedBytes" IS NOT NULL
        AND "failureCode" IS NULL AND "readyAt" IS NOT NULL
        AND "expiresAt" = "readyAt" + INTERVAL '24 hours'
        AND "expiredAt" IS NOT NULL AND "expiredAt" >= "expiresAt"
        AND "failedAt" IS NULL AND "attemptId" IS NULL
        AND "claimOwnerHash" IS NULL AND "leaseExpiresAt" IS NULL
        AND "nextAttemptAt" IS NULL
      )
    )
);

CREATE TABLE public."AdminAuditExportIdempotencyRecord" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "operation" "AdminAuditExportIdempotencyOperation" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "responseCode" INTEGER NOT NULL,
  "exportId" TEXT NOT NULL,
  "generation" BIGINT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminAuditExportIdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminAuditExportIdempotencyRecord_operation_check"
    CHECK ("operation" = 'CREATE_ADMIN_AUDIT_LOG_EXPORT'),
  CONSTRAINT "AdminAuditExportIdempotencyRecord_shape_check"
    CHECK (
      "generation" >= 1
      AND "responseCode" = 202
      AND pg_catalog.length("idempotencyKey") BETWEEN 16 AND 128
      AND pg_catalog.length("requestDigest") = 64
      AND "expiresAt" = "createdAt" + INTERVAL '24 hours'
    )
);

CREATE TABLE public."AdminAuditExportReadLease" (
  "id" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "exportGeneration" BIGINT NOT NULL,
  "readerAdminUserId" TEXT NOT NULL,
  "ownerHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "maximumExpiresAt" TIMESTAMP(3) NOT NULL,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditExportReadLease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminAuditExportReadLease_shape_check"
    CHECK (
      "exportGeneration" >= 1
      AND pg_catalog.length("ownerHash") = 64
      AND "maximumExpiresAt" = "createdAt" + INTERVAL '900 seconds'
      AND "expiresAt" <= "maximumExpiresAt"
      AND "lastHeartbeatAt" >= "createdAt"
      AND ("releasedAt" IS NULL OR "releasedAt" >= "createdAt")
    )
);

CREATE INDEX "AdminAuditPaginationSnapshot_principal_operation_created_idx"
  ON public."AdminAuditPaginationSnapshot" ("principalAdminUserId", "operation", "createdAt");
CREATE INDEX "AdminAuditPaginationSnapshot_operation_expires_idx"
  ON public."AdminAuditPaginationSnapshot" ("operation", "expiresAt");
CREATE UNIQUE INDEX "AdminAuditPaginationSnapshotItem_snapshot_resource_key"
  ON public."AdminAuditPaginationSnapshotItem" ("snapshotId", "resourceId");
CREATE INDEX "AdminAuditExportIdempotencyRecord_active_lookup_idx"
  ON public."AdminAuditExportIdempotencyRecord"
  ("adminUserId", "operation", "idempotencyKey", "expiresAt", "generation");
CREATE INDEX "AdminAuditExportIdempotencyRecord_expires_idx"
  ON public."AdminAuditExportIdempotencyRecord" ("expiresAt");
CREATE UNIQUE INDEX "AdminAuditExportIdempotencyRecord_key_generation_key"
  ON public."AdminAuditExportIdempotencyRecord"
  ("adminUserId", "operation", "idempotencyKey", "generation");
CREATE UNIQUE INDEX "AdminAuditExport_snapshotId_key"
  ON public."AdminAuditExport" ("snapshotId");
CREATE UNIQUE INDEX "AdminAuditExport_sourceAuditLogId_key"
  ON public."AdminAuditExport" ("sourceAuditLogId");
CREATE UNIQUE INDEX "AdminAuditExport_stagingObjectKey_key"
  ON public."AdminAuditExport" ("stagingObjectKey");
CREATE UNIQUE INDEX "AdminAuditExport_objectKey_key"
  ON public."AdminAuditExport" ("objectKey");
CREATE INDEX "AdminAuditExport_claim_idx"
  ON public."AdminAuditExport" ("state", "nextAttemptAt", "createdAt");
CREATE INDEX "AdminAuditExport_watchdog_idx"
  ON public."AdminAuditExport" ("state", "leaseExpiresAt", "attemptDeadline");
CREATE INDEX "AdminAuditExport_creator_created_idx"
  ON public."AdminAuditExport" ("creatorAdminUserId", "createdAt");
CREATE INDEX "AdminAuditExport_expiry_idx"
  ON public."AdminAuditExport" ("state", "expiresAt");
CREATE INDEX "AdminAuditExportReadLease_export_active_idx"
  ON public."AdminAuditExportReadLease" ("exportId", "releasedAt", "expiresAt");
CREATE INDEX "AdminAuditExportReadLease_expires_idx"
  ON public."AdminAuditExportReadLease" ("expiresAt");
CREATE UNIQUE INDEX "AdminAuditExportReadLease_owner_key"
  ON public."AdminAuditExportReadLease" ("exportId", "exportGeneration", "ownerHash");
CREATE INDEX "AuditLog_adminAuditExportId_createdAt_idx"
  ON public."AuditLog" ("adminAuditExportId", "createdAt");
CREATE UNIQUE INDEX "AuditLog_adminAuditExport_create_unique"
  ON public."AuditLog" ("adminAuditExportId")
  WHERE "action" = 'createAdminAuditLogExport';
CREATE UNIQUE INDEX "AuditLog_adminAuditExport_build_unique"
  ON public."AuditLog" ("adminAuditExportId")
  WHERE "action" = 'buildAdminAuditLogExport';
CREATE UNIQUE INDEX "AuditLog_adminAuditExport_expiry_unique"
  ON public."AuditLog" ("adminAuditExportId")
  WHERE "action" = 'expireAdminAuditLogExport';

ALTER TABLE public."AdminAuditPaginationSnapshot"
  ADD CONSTRAINT "AdminAuditPaginationSnapshot_principalAdminUserId_fkey"
    FOREIGN KEY ("principalAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."AdminAuditPaginationSnapshotItem"
  ADD CONSTRAINT "AdminAuditPaginationSnapshotItem_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES public."AdminAuditPaginationSnapshot"("id")
    ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE public."AdminAuditExport"
  ADD CONSTRAINT "AdminAuditExport_creatorAdminUserId_fkey"
    FOREIGN KEY ("creatorAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminAuditExport_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES public."AdminAuditPaginationSnapshot"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminAuditExport_sourceAuditLogId_fkey"
    FOREIGN KEY ("sourceAuditLogId") REFERENCES public."AuditLog"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."AdminAuditExportIdempotencyRecord"
  ADD CONSTRAINT "AdminAuditExportIdempotencyRecord_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminAuditExportIdempotencyRecord_exportId_fkey"
    FOREIGN KEY ("exportId") REFERENCES public."AdminAuditExport"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."AdminAuditExportReadLease"
  ADD CONSTRAINT "AdminAuditExportReadLease_exportId_fkey"
    FOREIGN KEY ("exportId") REFERENCES public."AdminAuditExport"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "AdminAuditExportReadLease_readerAdminUserId_fkey"
    FOREIGN KEY ("readerAdminUserId") REFERENCES public."AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."AuditLog"
  ADD CONSTRAINT "AuditLog_adminAuditExportId_fkey"
    FOREIGN KEY ("adminAuditExportId") REFERENCES public."AdminAuditExport"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE VIEW public."AdminC2bAuditProjectionSource"
WITH (security_barrier = true)
AS
SELECT
  audit_entry."version",
  audit_entry."id" AS "eventId",
  audit_entry."action",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."eventClass"::text END AS "eventClass",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."context"::text END AS "context",
  audit_entry."adminUserId" AS "actorAdminUserId",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."subjectAdminUserId" END AS "subjectAdminUserId",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."delegatedByAdminUserId" END AS "delegatedByAdminUserId",
  audit_entry."adminSessionId",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."adminRecoveryContextId" END AS "adminRecoveryContextId",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."systemExecutionRefHash" END AS "systemExecutionRefHash",
  audit_entry."entityType",
  audit_entry."entityId",
  CASE
    WHEN audit_entry."action" = 'changeAdminUserRole'
      AND pg_catalog.jsonb_typeof(audit_entry."maskedBefore") = 'object'
      AND audit_entry."maskedBefore"->>'role' IN (
        'SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT'
      )
      THEN pg_catalog.jsonb_build_object('role', audit_entry."maskedBefore"->>'role')
    WHEN audit_entry."action" = 'changeAdminUserStatus'
      AND pg_catalog.jsonb_typeof(audit_entry."maskedBefore") = 'object'
      AND audit_entry."maskedBefore"->>'status' IN ('PENDING_MFA', 'ACTIVE', 'SUSPENDED', 'DISABLED')
      THEN pg_catalog.jsonb_build_object('status', audit_entry."maskedBefore"->>'status')
    ELSE NULL
  END AS "maskedBefore",
  CASE
    WHEN audit_entry."action" = 'changeAdminUserRole'
      AND pg_catalog.jsonb_typeof(audit_entry."maskedAfter") = 'object'
      AND audit_entry."maskedAfter"->>'role' IN (
        'SUPER_ADMIN', 'CONTENT_EDITOR', 'FINANCE_MANAGER', 'SUPPORT'
      )
      THEN pg_catalog.jsonb_build_object('role', audit_entry."maskedAfter"->>'role')
    WHEN audit_entry."action" = 'changeAdminUserStatus'
      AND pg_catalog.jsonb_typeof(audit_entry."maskedAfter") = 'object'
      AND audit_entry."maskedAfter"->>'status' IN ('PENDING_MFA', 'ACTIVE', 'SUSPENDED', 'DISABLED')
      THEN pg_catalog.jsonb_build_object('status', audit_entry."maskedAfter"->>'status')
    ELSE NULL
  END AS "maskedAfter",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."reasonCode"::text END AS "reasonCode",
  audit_entry."requestId",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."causationEventId" END AS "causationEventId",
  CASE WHEN audit_entry."version" = 1 THEN NULL
       ELSE audit_entry."causationSecurityEventId" END AS "causationSecurityEventId",
  audit_entry."createdAt",
  CASE WHEN audit_entry."version" = 3 THEN audit_entry."outcome"::text
       ELSE 'UNKNOWN'::text END AS "outcome",
  CASE WHEN audit_entry."version" = 3 THEN audit_entry."failureCode"::text
       ELSE NULL END AS "failureCode",
  (audit_entry."version" = 1) AS "legacyReasonRedacted",
  NULL::text AS "operatorReason",
  true AS "operatorReasonRedacted",
  CASE WHEN audit_entry."version" = 3 THEN 'EXPLICIT_C2'::text
       ELSE 'HISTORICAL_UNKNOWN'::text END AS "outcomeProvenance"
FROM public."AuditLog" AS audit_entry;

REVOKE ALL ON public."AdminC2bAuditProjectionSource" FROM PUBLIC;

CREATE FUNCTION public.kora_lock_admin_c2b_principal(
  principal_admin_user_id TEXT,
  principal_session_id TEXT
)
RETURNS TABLE (
  "adminUserId" TEXT,
  "role" public."AdminRole",
  "status" public."AdminStatus",
  "authorizationVersion" INTEGER,
  "sessionId" TEXT,
  "accessTokenJti" TEXT,
  "sessionAuthorizationVersion" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "absoluteExpiresAt" TIMESTAMP(3),
  "stepUpPurpose" public."AdminStepUpPurpose",
  "stepUpExpiresAt" TIMESTAMP(3),
  "sessionRevokedAt" TIMESTAMP(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF session_user <> 'kora_admin_c2b_audit_api' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only the C2b audit API may lock an administrator principal';
  END IF;
  RETURN QUERY
  SELECT
    user_entry."id",
    user_entry."role",
    user_entry."status",
    user_entry."authorizationVersion",
    session_entry."id",
    session_entry."accessTokenJti",
    session_entry."authorizationVersion",
    session_entry."expiresAt",
    session_entry."absoluteExpiresAt",
    session_entry."stepUpPurpose",
    session_entry."stepUpExpiresAt",
    session_entry."revokedAt"
  FROM public."AdminUser" AS user_entry
  JOIN public."AdminSession" AS session_entry
    ON session_entry."adminUserId" = user_entry."id"
  WHERE user_entry."id" = principal_admin_user_id
    AND session_entry."id" = principal_session_id
  FOR SHARE OF user_entry, session_entry;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_lock_admin_c2b_principal(TEXT, TEXT) FROM PUBLIC;

CREATE FUNCTION public.kora_lock_admin_c2b_export_idempotency(
  principal_admin_user_id TEXT,
  idempotency_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF session_user <> 'kora_admin_c2b_audit_api' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only the C2b audit API may lock export idempotency keys';
  END IF;
  IF principal_admin_user_id IS NULL
     OR pg_catalog.length(principal_admin_user_id) < 1
     OR idempotency_key IS NULL
     OR pg_catalog.length(idempotency_key) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'C2b export idempotency lock input is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        'KORA_ADMIN_C2B_EXPORT_IDEMPOTENCY_LOCK_V1'::text,
        principal_admin_user_id,
        'CREATE_ADMIN_AUDIT_LOG_EXPORT'::text,
        idempotency_key
      )::text,
      0
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.kora_lock_admin_c2b_export_idempotency(TEXT, TEXT) FROM PUBLIC;

CREATE FUNCTION public.kora_lock_admin_c2b_export_lifecycle(export_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF session_user NOT IN (
    'kora_admin_c2b_audit_api',
    'kora_admin_c2b_export_worker'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only a C2b audit-export identity may lock export lifecycle state';
  END IF;
  IF export_id IS NULL OR pg_catalog.length(export_id) < 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'C2b export lifecycle lock input is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        'KORA_ADMIN_C2B_EXPORT_LIFECYCLE_LOCK_V1'::text,
        export_id
      )::text,
      0
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.kora_lock_admin_c2b_export_lifecycle(TEXT) FROM PUBLIC;

CREATE FUNCTION public.kora_guard_admin_audit_snapshot_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  database_now TIMESTAMP(3);
BEGIN
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  IF NEW."operation" NOT IN ('LIST_ADMIN_AUDIT_LOGS', 'CREATE_ADMIN_AUDIT_LOG_EXPORT')
     OR NEW."projectionVersion" <> 1
     OR NEW."entryCount" NOT BETWEEN 0 AND 10000
     OR NEW."utf8Bytes" NOT BETWEEN 0 AND 26214400
     OR pg_catalog.length(NEW."filtersDigest") <> 64 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b audit snapshot shape is invalid';
  END IF;
  NEW."createdAt" := database_now;
  NEW."expiresAt" := database_now + INTERVAL '15 minutes';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_snapshot_insert() FROM PUBLIC;
CREATE TRIGGER "AdminAuditPaginationSnapshot_insert_guard"
  BEFORE INSERT ON public."AdminAuditPaginationSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_snapshot_insert();

CREATE FUNCTION public.kora_validate_admin_audit_snapshot_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  projection JSONB;
  expected_count INTEGER;
BEGIN
  BEGIN
    projection := NEW."projectionJson"::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b audit snapshot item must contain valid JSON';
  END;
  SELECT "entryCount" INTO expected_count
  FROM public."AdminAuditPaginationSnapshot"
  WHERE "id" = NEW."snapshotId";
  IF NOT FOUND OR NEW."ordinal" >= expected_count
     OR pg_catalog.jsonb_typeof(projection) <> 'object'
     OR projection->>'eventId' IS DISTINCT FROM NEW."resourceId"
     OR projection->>'createdAt' IS DISTINCT FROM
        pg_catalog.to_char(NEW."sourceCreatedAt" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     OR projection ? 'legacyReason'
     OR projection ? 'reason'
     OR projection->>'operatorReason' IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b audit snapshot item projection is not allowlisted';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_validate_admin_audit_snapshot_item() FROM PUBLIC;
CREATE TRIGGER "AdminAuditPaginationSnapshotItem_json"
  BEFORE INSERT ON public."AdminAuditPaginationSnapshotItem"
  FOR EACH ROW EXECUTE FUNCTION public.kora_validate_admin_audit_snapshot_item();

CREATE FUNCTION public.kora_assert_admin_audit_snapshot_complete()
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
  order_is_valid BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'AdminAuditPaginationSnapshot' THEN
    affected_snapshot_id := COALESCE(NEW."id", OLD."id");
  ELSE
    affected_snapshot_id := COALESCE(NEW."snapshotId", OLD."snapshotId");
  END IF;
  SELECT "entryCount", "utf8Bytes" INTO expected_count, expected_bytes
  FROM public."AdminAuditPaginationSnapshot" WHERE "id" = affected_snapshot_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  WITH ordered_items AS MATERIALIZED (
    SELECT item."ordinal", item."utf8Bytes", item."sourceCreatedAt", item."resourceId",
           pg_catalog.lead(item."sourceCreatedAt") OVER (
             ORDER BY item."ordinal"
           ) AS next_created_at,
           pg_catalog.lead(item."resourceId") OVER (
             ORDER BY item."ordinal"
           ) AS next_resource_id
    FROM public."AdminAuditPaginationSnapshotItem" AS item
    WHERE item."snapshotId" = affected_snapshot_id
  )
  SELECT count(*)::integer, COALESCE(sum("utf8Bytes"), 0)::bigint,
         min("ordinal"), max("ordinal"),
         COALESCE(bool_and(
           next_created_at IS NULL
           OR ROW("sourceCreatedAt", "resourceId") >=
              ROW(next_created_at, next_resource_id)
         ), true)
  INTO actual_count, actual_bytes, minimum_ordinal, maximum_ordinal, order_is_valid
  FROM ordered_items;
  IF actual_count <> expected_count OR actual_bytes <> expected_bytes
     OR (actual_count > 0 AND (minimum_ordinal <> 0 OR maximum_ordinal <> actual_count - 1))
     OR NOT order_is_valid THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b audit snapshot is incomplete, unordered or non-contiguous';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_audit_snapshot_complete() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminAuditPaginationSnapshot_complete"
  AFTER INSERT OR UPDATE OR DELETE ON public."AdminAuditPaginationSnapshot"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_audit_snapshot_complete();

CREATE FUNCTION public.kora_guard_admin_audit_snapshot_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  database_now TIMESTAMP(3);
BEGIN
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  IF session_user <> 'kora_admin_c2b_export_worker' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b export worker may purge audit snapshots';
  END IF;
  IF OLD."operation" = 'LIST_ADMIN_AUDIT_LOGS' THEN
    IF OLD."expiresAt" > database_now THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b list snapshot is not expired';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public."AdminAuditExport" AS export_entry
    WHERE export_entry."snapshotId" = OLD."id"
      AND export_entry."attemptId" IS NULL
      AND export_entry."claimOwnerHash" IS NULL
      AND export_entry."leaseExpiresAt" IS NULL
      AND (
        (export_entry."state" = 'FAILED'
         AND export_entry."failedAt" + INTERVAL '24 hours' <= database_now)
        OR
        (export_entry."state" = 'EXPIRED'
         AND export_entry."expiredAt" + INTERVAL '24 hours' <= database_now)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public."AdminAuditExportReadLease" AS read_lease
        WHERE read_lease."exportId" = export_entry."id"
          AND read_lease."releasedAt" IS NULL
          AND read_lease."expiresAt" > database_now
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b export snapshot is not purge eligible';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_snapshot_delete() FROM PUBLIC;
CREATE TRIGGER "AdminAuditPaginationSnapshot_delete_guard"
  BEFORE DELETE ON public."AdminAuditPaginationSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_snapshot_delete();

CREATE TRIGGER "AdminAuditPaginationSnapshot_update_reject"
  BEFORE UPDATE ON public."AdminAuditPaginationSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();
CREATE TRIGGER "AdminAuditPaginationSnapshotItem_update_reject"
  BEFORE UPDATE ON public."AdminAuditPaginationSnapshotItem"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();

CREATE FUNCTION public.kora_guard_admin_audit_snapshot_item_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF session_user <> 'kora_admin_c2b_export_worker' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b export worker may purge audit snapshot items';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."AdminAuditPaginationSnapshot"
    WHERE "id" = OLD."snapshotId"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b audit snapshot items may only be deleted by qualified parent cascade';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_snapshot_item_delete() FROM PUBLIC;
CREATE TRIGGER "AdminAuditPaginationSnapshotItem_delete_guard"
  BEFORE DELETE ON public."AdminAuditPaginationSnapshotItem"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_snapshot_item_delete();

CREATE FUNCTION public.kora_guard_admin_audit_export_idempotency_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  database_now TIMESTAMP(3);
  export_creator TEXT;
BEGIN
  IF session_user <> 'kora_admin_c2b_audit_api' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b audit API may create export idempotency records';
  END IF;
  IF NEW."operation" <> 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
     OR pg_catalog.length(NEW."idempotencyKey") NOT BETWEEN 16 AND 128
     OR pg_catalog.length(NEW."requestDigest") <> 64
     OR NEW."responseCode" <> 202 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b export idempotency shape is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        'KORA_ADMIN_C2B_EXPORT_IDEMPOTENCY_LOCK_V1'::text,
        NEW."adminUserId", NEW."operation"::text, NEW."idempotencyKey"
      )::text,
      0
    )
  );
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  IF EXISTS (
    SELECT 1 FROM public."AdminAuditExportIdempotencyRecord" AS existing_record
    WHERE existing_record."adminUserId" = NEW."adminUserId"
      AND existing_record."operation" = NEW."operation"
      AND existing_record."idempotencyKey" = NEW."idempotencyKey"
      AND existing_record."expiresAt" > database_now
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      CONSTRAINT = 'AdminAuditExportIdempotencyRecord_active_key',
      MESSAGE = 'An active C2b export idempotency generation already exists';
  END IF;
  SELECT export_entry."creatorAdminUserId" INTO export_creator
  FROM public."AdminAuditExport" AS export_entry
  WHERE export_entry."id" = NEW."exportId";
  IF NOT FOUND OR export_creator IS DISTINCT FROM NEW."adminUserId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b export idempotency principal binding is invalid';
  END IF;
  SELECT COALESCE(pg_catalog.max(existing_record."generation"), 0) + 1
    INTO NEW."generation"
  FROM public."AdminAuditExportIdempotencyRecord" AS existing_record
  WHERE existing_record."adminUserId" = NEW."adminUserId"
    AND existing_record."operation" = NEW."operation"
    AND existing_record."idempotencyKey" = NEW."idempotencyKey";
  NEW."createdAt" := database_now;
  NEW."expiresAt" := database_now + INTERVAL '24 hours';
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_export_idempotency_insert() FROM PUBLIC;
CREATE TRIGGER "AdminAuditExportIdempotencyRecord_insert_guard"
  BEFORE INSERT ON public."AdminAuditExportIdempotencyRecord"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_export_idempotency_insert();
CREATE TRIGGER "AdminAuditExportIdempotencyRecord_append_only"
  BEFORE UPDATE OR DELETE ON public."AdminAuditExportIdempotencyRecord"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();

CREATE FUNCTION public.kora_guard_admin_audit_export_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  database_now TIMESTAMP(3);
  snapshot_entry public."AdminAuditPaginationSnapshot"%ROWTYPE;
BEGIN
  IF current_user <> 'kora_admin_c2b_audit_api' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b audit API may create exports';
  END IF;
  SELECT * INTO snapshot_entry
  FROM public."AdminAuditPaginationSnapshot"
  WHERE "id" = NEW."snapshotId";
  IF NOT FOUND
     OR snapshot_entry."operation" <> 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
     OR snapshot_entry."principalAdminUserId" IS DISTINCT FROM NEW."creatorAdminUserId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b export snapshot binding is invalid';
  END IF;
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  NEW."state" := 'PENDING';
  NEW."generation" := 1;
  NEW."attemptNumber" := 0;
  NEW."attemptId" := NULL;
  NEW."claimOwnerHash" := NULL;
  NEW."attemptStartedAt" := NULL;
  NEW."attemptDeadline" := NULL;
  NEW."leaseExpiresAt" := NULL;
  NEW."nextAttemptAt" := database_now;
  NEW."stagingObjectKey" := NULL;
  NEW."objectKey" := NULL;
  NEW."contentSha256" := NULL;
  NEW."signatureKeyId" := NULL;
  NEW."storageKeyId" := NULL;
  NEW."plaintextBytes" := NULL;
  NEW."encryptedBytes" := NULL;
  NEW."failureCode" := NULL;
  NEW."createdAt" := database_now;
  NEW."readyAt" := NULL;
  NEW."failedAt" := NULL;
  NEW."expiresAt" := NULL;
  NEW."expiredAt" := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_export_insert() FROM PUBLIC;
CREATE TRIGGER "AdminAuditExport_insert_guard"
  BEFORE INSERT ON public."AdminAuditExport"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_export_insert();

CREATE FUNCTION public.kora_guard_admin_audit_export_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  database_now TIMESTAMP(3);
BEGIN
  IF current_user <> 'kora_admin_c2b_export_worker' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b export worker may update exports';
  END IF;
  IF ROW(NEW."id", NEW."creatorAdminUserId", NEW."snapshotId",
         NEW."sourceAuditLogId", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."id", OLD."creatorAdminUserId", OLD."snapshotId",
         OLD."sourceAuditLogId", OLD."createdAt") THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b export identity is immutable';
  END IF;
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  IF OLD."state" = 'EXPIRED'
     AND NEW."state" = 'EXPIRED'
     AND OLD."stagingObjectKey" IS NOT NULL
     AND NEW."stagingObjectKey" IS NULL
     AND ROW(NEW."id", NEW."creatorAdminUserId", NEW."snapshotId", NEW."sourceAuditLogId",
             NEW."generation", NEW."attemptNumber", NEW."attemptId", NEW."claimOwnerHash",
             NEW."attemptStartedAt", NEW."attemptDeadline", NEW."leaseExpiresAt",
             NEW."nextAttemptAt", NEW."objectKey", NEW."contentSha256",
             NEW."signatureKeyId", NEW."storageKeyId", NEW."plaintextBytes",
             NEW."encryptedBytes", NEW."failureCode", NEW."createdAt", NEW."readyAt",
             NEW."failedAt", NEW."expiresAt", NEW."expiredAt")
        IS NOT DISTINCT FROM
        ROW(OLD."id", OLD."creatorAdminUserId", OLD."snapshotId", OLD."sourceAuditLogId",
            OLD."generation", OLD."attemptNumber", OLD."attemptId", OLD."claimOwnerHash",
            OLD."attemptStartedAt", OLD."attemptDeadline", OLD."leaseExpiresAt",
            OLD."nextAttemptAt", OLD."objectKey", OLD."contentSha256",
            OLD."signatureKeyId", OLD."storageKeyId", OLD."plaintextBytes",
            OLD."encryptedBytes", OLD."failureCode", OLD."createdAt", OLD."readyAt",
            OLD."failedAt", OLD."expiresAt", OLD."expiredAt") THEN
    RETURN NEW;
  END IF;
  IF OLD."state" IN ('FAILED', 'EXPIRED')
     OR (OLD."state" = 'READY' AND NEW."state" <> 'EXPIRED') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b terminal export state is immutable';
  END IF;
  IF (
    (OLD."state" = 'PENDING' AND NEW."state" = 'PROCESSING')
    OR (
      OLD."state" = 'PROCESSING' AND NEW."state" = 'PROCESSING'
      AND OLD."attemptId" IS NULL AND OLD."nextAttemptAt" IS NOT NULL
    )
  ) THEN
    IF OLD."nextAttemptAt" IS NULL OR OLD."nextAttemptAt" > database_now
       OR NEW."generation" <> OLD."generation" + 1
       OR NEW."attemptNumber" <> OLD."attemptNumber" + 1
       OR NEW."attemptNumber" > 3
       OR NEW."attemptId" IS NULL OR NEW."claimOwnerHash" IS NULL
       OR (OLD."state" = 'PROCESSING' AND OLD."attemptDeadline" <= database_now) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b export claim is invalid';
    END IF;
    NEW."state" := 'PROCESSING';
    IF OLD."attemptStartedAt" IS NULL THEN
      NEW."attemptStartedAt" := database_now;
      NEW."attemptDeadline" := database_now + INTERVAL '600 seconds';
    ELSE
      NEW."attemptStartedAt" := OLD."attemptStartedAt";
      NEW."attemptDeadline" := OLD."attemptDeadline";
    END IF;
    NEW."leaseExpiresAt" := LEAST(database_now + INTERVAL '120 seconds', NEW."attemptDeadline");
    NEW."nextAttemptAt" := NULL;
  ELSIF OLD."state" = 'PROCESSING' AND NEW."state" = 'PROCESSING' THEN
    IF NEW."generation" IS DISTINCT FROM OLD."generation"
       OR NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber"
       OR NEW."attemptStartedAt" IS DISTINCT FROM OLD."attemptStartedAt"
       OR NEW."attemptDeadline" IS DISTINCT FROM OLD."attemptDeadline"
       OR database_now >= OLD."attemptDeadline"
       OR (
         NEW."attemptId" IS NOT NULL
         AND (
           NEW."attemptId" IS DISTINCT FROM OLD."attemptId"
           OR NEW."claimOwnerHash" IS DISTINCT FROM OLD."claimOwnerHash"
           OR NEW."nextAttemptAt" IS NOT NULL
         )
       )
       OR (
         NEW."attemptId" IS NULL
         AND (
           OLD."attemptId" IS NULL OR OLD."claimOwnerHash" IS NULL
           OR NEW."claimOwnerHash" IS NOT NULL OR NEW."leaseExpiresAt" IS NOT NULL
           OR OLD."attemptNumber" >= 3
         )
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b export processing transition is invalid';
    END IF;
    IF NEW."attemptId" IS NULL THEN
      NEW."claimOwnerHash" := NULL;
      NEW."leaseExpiresAt" := NULL;
      NEW."nextAttemptAt" := CASE
        WHEN NEW."nextAttemptAt" IS NOT NULL
          AND NEW."nextAttemptAt" = OLD."leaseExpiresAt"
          THEN OLD."leaseExpiresAt"
        ELSE database_now + CASE OLD."attemptNumber"
          WHEN 1 THEN INTERVAL '30 seconds'
          WHEN 2 THEN INTERVAL '120 seconds'
          ELSE INTERVAL '0 seconds'
        END
      END;
      NEW."stagingObjectKey" := NULL;
    ELSE
      NEW."leaseExpiresAt" := LEAST(
        database_now + INTERVAL '120 seconds',
        OLD."attemptDeadline"
      );
      NEW."nextAttemptAt" := NULL;
    END IF;
  ELSIF OLD."state" = 'PROCESSING' AND NEW."state" IN ('READY', 'FAILED') THEN
    IF (NEW."state" = 'READY' AND database_now >= OLD."attemptDeadline")
       OR OLD."nextAttemptAt" IS NOT NULL
       OR OLD."attemptId" IS NULL OR OLD."claimOwnerHash" IS NULL
       OR (NEW."state" = 'READY' AND OLD."leaseExpiresAt" <= database_now)
       OR NEW."generation" IS DISTINCT FROM OLD."generation"
       OR NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber"
       OR NEW."attemptId" IS DISTINCT FROM OLD."attemptId"
       OR NEW."claimOwnerHash" IS DISTINCT FROM OLD."claimOwnerHash" THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b export terminal CAS is invalid';
    END IF;
    NEW."attemptId" := NULL;
    NEW."claimOwnerHash" := NULL;
    NEW."attemptStartedAt" := NULL;
    NEW."attemptDeadline" := NULL;
    NEW."leaseExpiresAt" := NULL;
    NEW."nextAttemptAt" := NULL;
    IF NEW."state" = 'READY' THEN
      NEW."readyAt" := database_now;
      NEW."expiresAt" := database_now + INTERVAL '24 hours';
      NEW."failedAt" := NULL;
      NEW."failureCode" := NULL;
    ELSE
      NEW."failedAt" := database_now;
      NEW."readyAt" := NULL;
      NEW."expiresAt" := NULL;
    END IF;
  ELSIF OLD."state" = 'READY' AND NEW."state" = 'EXPIRED' THEN
    PERFORM public.kora_lock_admin_c2b_export_lifecycle(OLD."id");
    IF ROW(NEW."id", NEW."creatorAdminUserId", NEW."snapshotId",
           NEW."sourceAuditLogId", NEW."generation", NEW."attemptNumber",
           NEW."attemptId", NEW."claimOwnerHash", NEW."attemptStartedAt",
           NEW."attemptDeadline", NEW."leaseExpiresAt", NEW."nextAttemptAt",
           NEW."contentSha256", NEW."signatureKeyId", NEW."storageKeyId",
           NEW."plaintextBytes", NEW."encryptedBytes", NEW."failureCode",
           NEW."createdAt", NEW."readyAt", NEW."failedAt", NEW."expiresAt")
       IS DISTINCT FROM
       ROW(OLD."id", OLD."creatorAdminUserId", OLD."snapshotId",
           OLD."sourceAuditLogId", OLD."generation", OLD."attemptNumber",
           OLD."attemptId", OLD."claimOwnerHash", OLD."attemptStartedAt",
           OLD."attemptDeadline", OLD."leaseExpiresAt", OLD."nextAttemptAt",
           OLD."contentSha256", OLD."signatureKeyId", OLD."storageKeyId",
           OLD."plaintextBytes", OLD."encryptedBytes", OLD."failureCode",
           OLD."createdAt", OLD."readyAt", OLD."failedAt", OLD."expiresAt")
       OR OLD."expiresAt" > database_now OR NEW."objectKey" IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM public."AdminAuditExportReadLease" AS read_lease
         WHERE read_lease."exportId" = OLD."id"
           AND read_lease."exportGeneration" = OLD."generation"
           AND read_lease."releasedAt" IS NULL
           AND read_lease."expiresAt" > database_now
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b export expiry is not eligible';
    END IF;
    NEW."stagingObjectKey" := OLD."objectKey";
    NEW."expiredAt" := database_now;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b export state transition is forbidden';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_export_update() FROM PUBLIC;
CREATE TRIGGER "AdminAuditExport_update_guard"
  BEFORE UPDATE ON public."AdminAuditExport"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_export_update();
CREATE TRIGGER "AdminAuditExport_delete_reject"
  BEFORE DELETE ON public."AdminAuditExport"
  FOR EACH ROW EXECUTE FUNCTION public.kora_reject_row_mutation();

CREATE FUNCTION public.kora_assert_admin_audit_export_creation_atomicity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  valid_link_count INTEGER;
BEGIN
  SELECT count(*) INTO valid_link_count
  FROM public."AdminAuditPaginationSnapshot" AS snapshot_entry
  JOIN public."AuditLog" AS audit_entry
    ON audit_entry."id" = NEW."sourceAuditLogId"
   AND audit_entry."adminAuditExportId" = NEW."id"
  JOIN public."AdminAuditExportIdempotencyRecord" AS idempotency_entry
    ON idempotency_entry."exportId" = NEW."id"
   AND idempotency_entry."adminUserId" = NEW."creatorAdminUserId"
  WHERE snapshot_entry."id" = NEW."snapshotId"
    AND snapshot_entry."principalAdminUserId" = NEW."creatorAdminUserId"
    AND snapshot_entry."operation" = 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
    AND audit_entry."version" = 3
    AND audit_entry."adminUserId" = NEW."creatorAdminUserId"
    AND audit_entry."action" = 'createAdminAuditLogExport'
    AND audit_entry."eventClass" = 'EXPORT'
    AND audit_entry."context" = 'ADMIN_SESSION'
    AND audit_entry."outcome" = 'SUCCESS'
    AND audit_entry."failureCode" IS NULL
    AND audit_entry."entityType" = 'ADMIN_AUDIT_EXPORT'
    AND audit_entry."entityId" = NEW."id"
    AND idempotency_entry."operation" = 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
    AND idempotency_entry."responseCode" = 202
    AND idempotency_entry."expiresAt" > NEW."createdAt";
  IF valid_link_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b snapshot, export, idempotency and source audit must commit atomically';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_audit_export_creation_atomicity() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminAuditExport_creation_atomicity"
  AFTER INSERT ON public."AdminAuditExport"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_audit_export_creation_atomicity();

CREATE FUNCTION public.kora_assert_admin_audit_export_terminal_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_action TEXT;
  expected_outcome TEXT;
  expected_failure_code TEXT;
  matching_count INTEGER;
  action_count INTEGER;
BEGIN
  IF NEW."state" IS NOT DISTINCT FROM OLD."state"
     OR NEW."state" NOT IN ('READY', 'FAILED', 'EXPIRED') THEN
    RETURN NULL;
  END IF;

  IF NEW."state" = 'READY' THEN
    expected_action := 'buildAdminAuditLogExport';
    expected_outcome := 'SUCCESS';
    expected_failure_code := NULL;
  ELSIF NEW."state" = 'FAILED' THEN
    expected_action := 'buildAdminAuditLogExport';
    expected_outcome := 'REJECTED';
    expected_failure_code := CASE NEW."failureCode"::text
      WHEN 'PROJECTION_BUDGET_EXCEEDED' THEN 'PROJECTION_BUDGET_EXCEEDED'
      WHEN 'INTEGRITY_FAILED' THEN 'INTEGRITY_REJECTED'
      WHEN 'RETRY_BUDGET_EXHAUSTED' THEN 'DEPENDENCY_UNAVAILABLE'
      WHEN 'DEPENDENCY_UNAVAILABLE' THEN 'DEPENDENCY_UNAVAILABLE'
      ELSE NULL
    END;
    IF expected_failure_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b FAILED export has no closed audit failure mapping';
    END IF;
  ELSE
    expected_action := 'expireAdminAuditLogExport';
    expected_outcome := 'SUCCESS';
    expected_failure_code := NULL;
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE audit_entry."version" = 3
        AND audit_entry."eventClass" = 'EXPORT'
        AND audit_entry."context" = 'SYSTEM'
        AND audit_entry."outcome"::text = expected_outcome
        AND audit_entry."failureCode"::text IS NOT DISTINCT FROM expected_failure_code
        AND audit_entry."entityType" = 'ADMIN_AUDIT_EXPORT'
        AND audit_entry."entityId" = NEW."id"
        AND audit_entry."reason" = 'C2_RUNTIME'
        AND audit_entry."reasonCode" = 'AUDIT_EXPORT'
    )::integer
  INTO action_count, matching_count
  FROM public."AuditLog" AS audit_entry
  WHERE audit_entry."adminAuditExportId" = NEW."id"
    AND audit_entry."action" = expected_action;

  IF action_count <> 1 OR matching_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b terminal export state and unique system audit must commit atomically';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_assert_admin_audit_export_terminal_audit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER "AdminAuditExport_terminal_audit"
  AFTER UPDATE ON public."AdminAuditExport"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.kora_assert_admin_audit_export_terminal_audit();

CREATE FUNCTION public.kora_guard_admin_audit_export_read_lease_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  database_now TIMESTAMP(3);
  export_entry public."AdminAuditExport"%ROWTYPE;
BEGIN
  IF session_user <> 'kora_admin_c2b_audit_api' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b audit API may acquire read leases';
  END IF;
  PERFORM public.kora_lock_admin_c2b_export_lifecycle(NEW."exportId");
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  SELECT * INTO export_entry
  FROM public."AdminAuditExport"
  WHERE "id" = NEW."exportId";
  IF NOT FOUND
     OR export_entry."creatorAdminUserId" IS DISTINCT FROM NEW."readerAdminUserId"
     OR export_entry."state" <> 'READY'
     OR export_entry."expiresAt" <= database_now
     OR export_entry."objectKey" IS NULL
     OR export_entry."contentSha256" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b read lease export binding is invalid';
  END IF;
  NEW."exportGeneration" := export_entry."generation";
  NEW."createdAt" := database_now;
  NEW."lastHeartbeatAt" := database_now;
  NEW."expiresAt" := database_now + INTERVAL '300 seconds';
  NEW."maximumExpiresAt" := database_now + INTERVAL '900 seconds';
  NEW."releasedAt" := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_export_read_lease_insert() FROM PUBLIC;
CREATE TRIGGER "AdminAuditExportReadLease_insert_guard"
  BEFORE INSERT ON public."AdminAuditExportReadLease"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_export_read_lease_insert();

CREATE FUNCTION public.kora_guard_admin_audit_export_read_lease_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  database_now TIMESTAMP(3);
BEGIN
  IF session_user <> 'kora_admin_c2b_audit_api' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b audit API may renew or release read leases';
  END IF;
  IF ROW(NEW."id", NEW."exportId", NEW."exportGeneration",
         NEW."readerAdminUserId", NEW."ownerHash", NEW."maximumExpiresAt",
         NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD."id", OLD."exportId", OLD."exportGeneration",
         OLD."readerAdminUserId", OLD."ownerHash", OLD."maximumExpiresAt",
          OLD."createdAt") THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b read lease identity or terminal state is immutable';
  END IF;
  PERFORM public.kora_lock_admin_c2b_export_lifecycle(OLD."exportId");
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  IF OLD."releasedAt" IS NOT NULL THEN
    RETURN OLD;
  END IF;
  IF NEW."releasedAt" IS NULL
     AND (OLD."expiresAt" <= database_now OR OLD."maximumExpiresAt" <= database_now) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b read lease cannot renew after expiry';
  END IF;
  NEW."lastHeartbeatAt" := database_now;
  IF NEW."releasedAt" IS NULL THEN
    NEW."expiresAt" := LEAST(database_now + INTERVAL '300 seconds', OLD."maximumExpiresAt");
  ELSE
    NEW."releasedAt" := database_now;
    NEW."expiresAt" := LEAST(OLD."expiresAt", database_now);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_export_read_lease_update() FROM PUBLIC;
CREATE TRIGGER "AdminAuditExportReadLease_update_guard"
  BEFORE UPDATE ON public."AdminAuditExportReadLease"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_export_read_lease_update();

CREATE FUNCTION public.kora_guard_admin_audit_export_read_lease_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  database_now TIMESTAMP(3);
BEGIN
  IF session_user <> 'kora_admin_c2b_export_worker' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the C2b export worker may purge read leases';
  END IF;
  database_now := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3);
  IF OLD."releasedAt" IS NULL AND OLD."expiresAt" > database_now THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b active read lease cannot be purged';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_admin_audit_export_read_lease_delete() FROM PUBLIC;
CREATE TRIGGER "AdminAuditExportReadLease_delete_guard"
  BEFORE DELETE ON public."AdminAuditExportReadLease"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_admin_audit_export_read_lease_delete();

CREATE FUNCTION public.kora_guard_c2b_admin_security_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'kora_admin_c2b_audit_api'
     AND NOT COALESCE((
       NEW."action" IN (
         'listAdminAuditLogs',
         'createAdminAuditLogExport',
         'getAdminAuditLogExport',
         'downloadAdminAuditLogExport'
       )
       AND NEW."eventClass" = 'EXPORT'
       AND NEW."outcome" = 'FAILED'
       AND NEW."adminInvitationId" IS NULL
       AND (
         (NEW."entityType" IS NULL AND NEW."entityId" IS NULL)
         OR NEW."entityType" IN ('ADMIN_AUDIT_SNAPSHOT', 'ADMIN_AUDIT_EXPORT')
       )
     ), FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b audit API attempted an unauthorized AdminSecurityEvent';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_guard_c2b_admin_security_event_insert() FROM PUBLIC;
CREATE TRIGGER "AdminSecurityEvent_c2b_insert_guard"
  BEFORE INSERT ON public."AdminSecurityEvent"
  FOR EACH ROW EXECUTE FUNCTION public.kora_guard_c2b_admin_security_event_insert();

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
    'kora_admin_c2a_bootstrap',
    'kora_admin_c2b_audit_api',
    'kora_admin_c2b_export_worker'
  ) THEN
    IF NEW."version" <> 3 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2 roles must insert AuditLog version 3 explicitly';
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
    IF current_user = 'kora_admin_c2b_audit_api'
       AND NOT COALESCE((
         NEW."action" IN (
           'listAdminAuditLogs',
           'createAdminAuditLogExport',
           'getAdminAuditLogExport',
           'downloadAdminAuditLogExport'
         )
         AND NEW."eventClass" = 'EXPORT'
         AND NEW."context" = 'ADMIN_SESSION'
         AND NEW."adminUserId" IS NOT NULL
         AND NEW."adminSessionId" IS NOT NULL
         AND NEW."delegatedByAdminUserId" IS NULL
         AND NEW."causationEventId" IS NULL
         AND NEW."causationSecurityEventId" IS NULL
         AND NEW."reason" = 'C2_RUNTIME'
         AND (
           (NEW."action" = 'listAdminAuditLogs' AND NEW."adminAuditExportId" IS NULL)
           OR
           (
             NEW."action" <> 'listAdminAuditLogs'
             AND (
               NEW."adminAuditExportId" IS NOT NULL
               OR (NEW."outcome" = 'REJECTED' AND NEW."adminAuditExportId" IS NULL)
             )
           )
         )
       ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b audit API attempted an unauthorized AuditLog action';
    END IF;
    IF current_user = 'kora_admin_c2b_export_worker'
       AND NOT COALESCE((
         NEW."action" IN ('buildAdminAuditLogExport', 'expireAdminAuditLogExport')
         AND NEW."eventClass" = 'EXPORT'
         AND NEW."context" = 'SYSTEM'
         AND NEW."adminUserId" IS NULL
         AND NEW."adminSessionId" IS NULL
         AND NEW."adminAuditExportId" IS NOT NULL
         AND NEW."operatorReason" IS NULL
         AND NEW."reason" = 'C2_RUNTIME'
         AND NEW."reasonCode" = 'AUDIT_EXPORT'
         AND NEW."systemExecutionRefHash" IS NOT NULL
       ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b export worker attempted an unauthorized AuditLog action';
    END IF;
  ELSIF NEW."version" <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C1 and migration-owner AuditLog inserts must use version 2';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_enforce_audit_log_v2_insert() FROM PUBLIC;

CREATE FUNCTION public.kora_validate_audit_log_c2b_causality()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  export_entry public."AdminAuditExport"%ROWTYPE;
  source_audit public."AuditLog"%ROWTYPE;
BEGIN
  IF session_user = 'kora_admin_c2b_audit_api' THEN
    IF NOT COALESCE(NEW."action" IN (
      'listAdminAuditLogs',
      'createAdminAuditLogExport',
      'getAdminAuditLogExport',
      'downloadAdminAuditLogExport'
    ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'C2b audit API attempted a reserved or unknown AuditLog action';
    END IF;
  ELSIF session_user = 'kora_admin_c2b_export_worker' THEN
    IF NOT COALESCE(NEW."action" IN (
      'buildAdminAuditLogExport',
      'expireAdminAuditLogExport'
    ), FALSE) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'C2b export worker attempted a reserved or unknown AuditLog action';
    END IF;
  ELSIF COALESCE(NEW."action" IN (
    'listAdminAuditLogs',
    'createAdminAuditLogExport',
    'getAdminAuditLogExport',
    'downloadAdminAuditLogExport',
    'buildAdminAuditLogExport',
    'expireAdminAuditLogExport'
  ), FALSE) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Only the matching C2b identity may insert a reserved C2b AuditLog action';
  ELSE
    RETURN NEW;
  END IF;
  IF NEW."version" <> 3
     OR NEW."maskedBefore" IS NOT NULL OR NEW."maskedAfter" IS NOT NULL
     OR NEW."subjectAdminUserId" IS NOT NULL
     OR NEW."adminRecoveryContextId" IS NOT NULL
     OR NEW."adminPasswordResetContextId" IS NOT NULL
     OR NEW."notificationOutboxId" IS NOT NULL
     OR NEW."adminInvitationId" IS NOT NULL
     OR NEW."adminRecoveryCaseId" IS NOT NULL
     OR NEW."bootstrapGuardId" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b AuditLog common shape is invalid';
  END IF;
  IF NEW."action" = 'listAdminAuditLogs' THEN
    IF NEW."adminAuditExportId" IS NOT NULL
       OR NEW."context" <> 'ADMIN_SESSION'
       OR NEW."entityType" <> 'ADMIN_AUDIT_SNAPSHOT'
       OR NEW."reasonCode" <> 'AUDIT_EXPORT'
       OR NEW."operatorReason" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b list audit shape is invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."adminAuditExportId" IS NULL THEN
    IF NEW."action" NOT IN (
         'createAdminAuditLogExport', 'getAdminAuditLogExport', 'downloadAdminAuditLogExport'
       )
       OR NEW."context" <> 'ADMIN_SESSION'
       OR NEW."outcome" <> 'REJECTED'
       OR NEW."failureCode" IS NULL
       OR NEW."entityType" <> 'ADMIN_AUDIT_EXPORT'
       OR NEW."adminUserId" IS NULL OR NEW."adminSessionId" IS NULL
       OR NEW."delegatedByAdminUserId" IS NOT NULL
       OR NEW."causationEventId" IS NOT NULL
       OR NEW."causationSecurityEventId" IS NOT NULL
       OR NEW."reasonCode" <> 'AUDIT_EXPORT'
       OR (
         NEW."action" = 'createAdminAuditLogExport'
         AND (
           NEW."operatorReason" IS NULL
           OR pg_catalog.length(NEW."operatorReason") NOT BETWEEN 3 AND 500
         )
       )
       OR (
         NEW."action" <> 'createAdminAuditLogExport'
         AND NEW."operatorReason" IS NOT NULL
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b unbound rejected HTTP AuditLog shape is invalid';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO export_entry
  FROM public."AdminAuditExport"
  WHERE "id" = NEW."adminAuditExportId";
  IF NOT FOUND
     OR NEW."entityType" <> 'ADMIN_AUDIT_EXPORT'
     OR NEW."entityId" IS DISTINCT FROM export_entry."id" THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b AuditLog export binding is invalid';
  END IF;
  IF NEW."action" IN (
    'createAdminAuditLogExport', 'getAdminAuditLogExport', 'downloadAdminAuditLogExport'
  ) THEN
    IF NEW."context" <> 'ADMIN_SESSION'
       OR NEW."adminUserId" IS DISTINCT FROM export_entry."creatorAdminUserId"
       OR NEW."adminSessionId" IS NULL
       OR NEW."delegatedByAdminUserId" IS NOT NULL
       OR NEW."causationEventId" IS NOT NULL
       OR NEW."causationSecurityEventId" IS NOT NULL
       OR (
         NEW."action" = 'createAdminAuditLogExport'
         AND NEW."outcome" = 'SUCCESS'
         AND (
           NEW."reasonCode" <> 'AUDIT_EXPORT'
           OR NEW."operatorReason" IS NULL
           OR pg_catalog.length(NEW."operatorReason") NOT BETWEEN 3 AND 500
         )
       )
       OR (
         NEW."action" <> 'createAdminAuditLogExport'
         AND (NEW."reasonCode" <> 'AUDIT_EXPORT' OR NEW."operatorReason" IS NOT NULL)
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b HTTP AuditLog shape is invalid';
    END IF;
  ELSIF NEW."action" = 'buildAdminAuditLogExport' THEN
    SELECT * INTO source_audit
    FROM public."AuditLog" WHERE "id" = export_entry."sourceAuditLogId";
    IF NOT FOUND
       OR source_audit."action" <> 'createAdminAuditLogExport'
       OR source_audit."version" <> 3
       OR source_audit."outcome" <> 'SUCCESS'
       OR source_audit."failureCode" IS NOT NULL
       OR NEW."context" <> 'SYSTEM'
       OR NEW."causationEventId" IS DISTINCT FROM source_audit."id"
       OR NEW."delegatedByAdminUserId" IS DISTINCT FROM source_audit."adminUserId"
       OR NEW."causationSecurityEventId" IS NOT NULL
       OR (
         export_entry."state" = 'READY'
         AND (NEW."outcome" <> 'SUCCESS' OR NEW."failureCode" IS NOT NULL)
       )
       OR (
         export_entry."state" = 'FAILED'
         AND (NEW."outcome" <> 'REJECTED' OR NEW."failureCode" IS NULL)
       )
       OR export_entry."state" NOT IN ('READY', 'FAILED') THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b build AuditLog causality is invalid';
    END IF;
  ELSIF NEW."action" = 'expireAdminAuditLogExport' THEN
    IF export_entry."state" <> 'EXPIRED'
       OR NEW."context" <> 'SYSTEM'
       OR NEW."outcome" <> 'SUCCESS'
       OR NEW."failureCode" IS NOT NULL
       OR NEW."causationEventId" IS NOT NULL
       OR NEW."causationSecurityEventId" IS NOT NULL
       OR NEW."delegatedByAdminUserId" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'C2b expiry AuditLog causality is invalid';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'C2b AuditLog action is not allowlisted';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.kora_validate_audit_log_c2b_causality() FROM PUBLIC;
CREATE TRIGGER "AuditLog_c2b_causality"
  BEFORE INSERT ON public."AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.kora_validate_audit_log_c2b_causality();
