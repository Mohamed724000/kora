#!/bin/sh
set -eu

runtime_user="${KORA_POSTGRES_RUNTIME_USER:?KORA_POSTGRES_RUNTIME_USER is required}"
admin_writer_user="${KORA_POSTGRES_ADMIN_WRITER_USER:?KORA_POSTGRES_ADMIN_WRITER_USER is required}"
case "$runtime_user" in
  *[!A-Za-z0-9_]* | [0-9]* | '')
    echo 'PostgreSQL runtime role has an invalid identifier.' >&2
    exit 1
    ;;
esac
case "$admin_writer_user" in
  *[!A-Za-z0-9_]* | [0-9]* | '')
    echo 'PostgreSQL admin writer role has an invalid identifier.' >&2
    exit 1
    ;;
esac
if [ "$runtime_user" = "$admin_writer_user" ]; then
  echo 'PostgreSQL reader and admin writer roles must be distinct.' >&2
  exit 1
fi

runtime_password_length="$(tr -d '\r\n' </run/secrets/postgres_runtime_password | wc -c | tr -d ' ')"
if [ "$runtime_password_length" -ne 43 ]; then
  echo 'PostgreSQL runtime secret has an invalid format.' >&2
  exit 1
fi
admin_writer_password_length="$(tr -d '\r\n' </run/secrets/postgres_admin_writer_password | wc -c | tr -d ' ')"
if [ "$admin_writer_password_length" -ne 43 ]; then
  echo 'PostgreSQL admin writer secret has an invalid format.' >&2
  exit 1
fi
if [ "$(tr -d '\r\n' </run/secrets/postgres_runtime_password)" = "$(tr -d '\r\n' </run/secrets/postgres_admin_writer_password)" ]; then
  echo 'PostgreSQL reader and admin writer secrets must be distinct.' >&2
  exit 1
fi

c2a_enabled="${KORA_POSTGRES_C2A_ENABLED:-false}"
case "$c2a_enabled" in
  true | false) ;;
  *)
    echo 'PostgreSQL C2a enable flag must be true or false.' >&2
    exit 1
    ;;
esac

if [ "$c2a_enabled" = 'true' ]; then
  c2a_writer_user="${KORA_POSTGRES_C2A_WRITER_USER:-}"
  c2a_notification_user="${KORA_POSTGRES_C2A_NOTIFICATION_WORKER_USER:-}"
  c2a_expiration_user="${KORA_POSTGRES_C2A_EXPIRATION_WORKER_USER:-}"
  c2a_bootstrap_user="${KORA_POSTGRES_C2A_BOOTSTRAP_USER:-}"
  c2a_secret_directory="${KORA_POSTGRES_C2A_SECRET_DIRECTORY:-}"

  if [ "$c2a_writer_user" != 'kora_admin_c2a_writer' ] \
    || [ "$c2a_notification_user" != 'kora_admin_c2a_notification_worker' ] \
    || [ "$c2a_expiration_user" != 'kora_admin_c2a_expiration_worker' ] \
    || [ "$c2a_bootstrap_user" != 'kora_admin_c2a_bootstrap' ]; then
    echo 'PostgreSQL C2a role names do not match the authorized identities.' >&2
    exit 1
  fi
  if [ "$c2a_writer_user" = "$POSTGRES_USER" ] \
    || [ "$c2a_writer_user" = "$runtime_user" ] \
    || [ "$c2a_writer_user" = "$admin_writer_user" ] \
    || [ "$c2a_notification_user" = "$POSTGRES_USER" ] \
    || [ "$c2a_notification_user" = "$runtime_user" ] \
    || [ "$c2a_notification_user" = "$admin_writer_user" ] \
    || [ "$c2a_expiration_user" = "$POSTGRES_USER" ] \
    || [ "$c2a_expiration_user" = "$runtime_user" ] \
    || [ "$c2a_expiration_user" = "$admin_writer_user" ] \
    || [ "$c2a_bootstrap_user" = "$POSTGRES_USER" ] \
    || [ "$c2a_bootstrap_user" = "$runtime_user" ] \
    || [ "$c2a_bootstrap_user" = "$admin_writer_user" ]; then
    echo 'PostgreSQL C2a roles must be distinct from owner and C1 identities.' >&2
    exit 1
  fi
  case "$c2a_secret_directory" in
    /*) ;;
    *)
      echo 'PostgreSQL C2a secret directory must be absolute.' >&2
      exit 1
      ;;
  esac

  c2a_secret_files='postgres_admin_c2a_writer_password
postgres_admin_c2a_notification_worker_password
postgres_admin_c2a_expiration_worker_password
postgres_admin_c2a_bootstrap_password'
  for c2a_secret_file in $c2a_secret_files; do
    c2a_secret_path="$c2a_secret_directory/$c2a_secret_file"
    if [ ! -f "$c2a_secret_path" ] \
      || [ "$(tr -d '\r\n' <"$c2a_secret_path" | wc -c | tr -d ' ')" -ne 43 ]; then
      echo 'A PostgreSQL C2a secret has an invalid format.' >&2
      exit 1
    fi
  done

  c2a_writer_password="$(tr -d '\r\n' <"$c2a_secret_directory/postgres_admin_c2a_writer_password")"
  c2a_notification_password="$(tr -d '\r\n' <"$c2a_secret_directory/postgres_admin_c2a_notification_worker_password")"
  c2a_expiration_password="$(tr -d '\r\n' <"$c2a_secret_directory/postgres_admin_c2a_expiration_worker_password")"
  c2a_bootstrap_password="$(tr -d '\r\n' <"$c2a_secret_directory/postgres_admin_c2a_bootstrap_password")"
  runtime_password="$(tr -d '\r\n' </run/secrets/postgres_runtime_password)"
  admin_writer_password="$(tr -d '\r\n' </run/secrets/postgres_admin_writer_password)"
  owner_password="$(tr -d '\r\n' </run/secrets/postgres_password)"

  if [ "$c2a_writer_password" = "$c2a_notification_password" ] \
    || [ "$c2a_writer_password" = "$c2a_expiration_password" ] \
    || [ "$c2a_writer_password" = "$c2a_bootstrap_password" ] \
    || [ "$c2a_notification_password" = "$c2a_expiration_password" ] \
    || [ "$c2a_notification_password" = "$c2a_bootstrap_password" ] \
    || [ "$c2a_expiration_password" = "$c2a_bootstrap_password" ] \
    || [ "$c2a_writer_password" = "$runtime_password" ] \
    || [ "$c2a_writer_password" = "$admin_writer_password" ] \
    || [ "$c2a_writer_password" = "$owner_password" ] \
    || [ "$c2a_notification_password" = "$runtime_password" ] \
    || [ "$c2a_notification_password" = "$admin_writer_password" ] \
    || [ "$c2a_notification_password" = "$owner_password" ] \
    || [ "$c2a_expiration_password" = "$runtime_password" ] \
    || [ "$c2a_expiration_password" = "$admin_writer_password" ] \
    || [ "$c2a_expiration_password" = "$owner_password" ] \
    || [ "$c2a_bootstrap_password" = "$runtime_password" ] \
    || [ "$c2a_bootstrap_password" = "$admin_writer_password" ] \
    || [ "$c2a_bootstrap_password" = "$owner_password" ]; then
    echo 'PostgreSQL C2a secrets must be pairwise distinct from every runtime secret.' >&2
    exit 1
  fi
  unset c2a_writer_password c2a_notification_password c2a_expiration_password
  unset c2a_bootstrap_password runtime_password admin_writer_password owner_password
  export KORA_POSTGRES_C2A_SECRET_DIRECTORY="$c2a_secret_directory"
fi

c2b_enabled="${KORA_POSTGRES_C2B_ENABLED:-false}"
case "$c2b_enabled" in
  true | false) ;;
  *)
    echo 'PostgreSQL C2b enable flag must be true or false.' >&2
    exit 1
    ;;
esac

if [ "$c2b_enabled" = 'true' ]; then
  c2b_audit_api_user="${KORA_POSTGRES_C2B_AUDIT_API_USER:-}"
  c2b_export_worker_user="${KORA_POSTGRES_C2B_EXPORT_WORKER_USER:-}"
  c2b_secret_directory="${KORA_POSTGRES_C2B_SECRET_DIRECTORY:-}"
  if [ "$c2b_audit_api_user" != 'kora_admin_c2b_audit_api' ] \
    || [ "$c2b_export_worker_user" != 'kora_admin_c2b_export_worker' ]; then
    echo 'PostgreSQL C2b role names do not match the authorized identities.' >&2
    exit 1
  fi
  case "$c2b_secret_directory" in
    /*) ;;
    *)
      echo 'PostgreSQL C2b secret directory must be absolute.' >&2
      exit 1
      ;;
  esac
  c2b_forbidden_users="$POSTGRES_USER $runtime_user $admin_writer_user \
kora_admin_c2a_writer kora_admin_c2a_notification_worker \
kora_admin_c2a_expiration_worker kora_admin_c2a_bootstrap"
  for c2b_user in "$c2b_audit_api_user" "$c2b_export_worker_user"; do
    for forbidden_user in $c2b_forbidden_users; do
      if [ "$c2b_user" = "$forbidden_user" ]; then
        echo 'PostgreSQL C2b roles must be distinct from owner, C1 and C2a identities.' >&2
        exit 1
      fi
    done
  done
  c2b_secret_files='postgres_admin_c2b_audit_api_password
postgres_admin_c2b_export_worker_password'
  for c2b_secret_file in $c2b_secret_files; do
    c2b_secret_path="$c2b_secret_directory/$c2b_secret_file"
    if [ ! -f "$c2b_secret_path" ] \
      || [ "$(tr -d '\r\n' <"$c2b_secret_path" | wc -c | tr -d ' ')" -ne 43 ]; then
      echo 'A PostgreSQL C2b secret has an invalid format.' >&2
      exit 1
    fi
  done
  c2b_audit_api_password="$(tr -d '\r\n' <"$c2b_secret_directory/postgres_admin_c2b_audit_api_password")"
  c2b_export_worker_password="$(tr -d '\r\n' <"$c2b_secret_directory/postgres_admin_c2b_export_worker_password")"
  runtime_password="$(tr -d '\r\n' </run/secrets/postgres_runtime_password)"
  admin_writer_password="$(tr -d '\r\n' </run/secrets/postgres_admin_writer_password)"
  owner_password="$(tr -d '\r\n' </run/secrets/postgres_password)"
  if [ "$c2b_audit_api_password" = "$c2b_export_worker_password" ] \
    || [ "$c2b_audit_api_password" = "$runtime_password" ] \
    || [ "$c2b_audit_api_password" = "$admin_writer_password" ] \
    || [ "$c2b_audit_api_password" = "$owner_password" ] \
    || [ "$c2b_export_worker_password" = "$runtime_password" ] \
    || [ "$c2b_export_worker_password" = "$admin_writer_password" ] \
    || [ "$c2b_export_worker_password" = "$owner_password" ]; then
    echo 'PostgreSQL C2b secrets must be pairwise distinct from C1 and owner secrets.' >&2
    exit 1
  fi
  if [ "$c2a_enabled" = 'true' ]; then
    for c2a_secret_file in $c2a_secret_files; do
      c2a_secret_value="$(tr -d '\r\n' <"$c2a_secret_directory/$c2a_secret_file")"
      if [ "$c2b_audit_api_password" = "$c2a_secret_value" ] \
        || [ "$c2b_export_worker_password" = "$c2a_secret_value" ]; then
        echo 'PostgreSQL C2b secrets must be distinct from all C2a secrets.' >&2
        exit 1
      fi
    done
    unset c2a_secret_value
  fi
  unset c2b_audit_api_password c2b_export_worker_password
  unset runtime_password admin_writer_password owner_password
  export KORA_POSTGRES_C2B_SECRET_DIRECTORY="$c2b_secret_directory"
fi

export PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_password)"

# C2a is inspected in a separate transaction that is always rolled back before
# any C1 password, ACL or role mutation. Its temporary expected-ACL tables are
# transaction-local and leave no persistent catalog state. The later
# in-transaction preflight repeats the same exact matrix immediately before
# C2a provisioning (TOCTOU defense).
if [ "$c2a_enabled" = 'true' ]; then
  psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --quiet \
    --set=ON_ERROR_STOP=1 \
    --set=c2a_writer_user="$c2a_writer_user" \
    --set=c2a_notification_user="$c2a_notification_user" \
    --set=c2a_expiration_user="$c2a_expiration_user" \
    --set=c2a_bootstrap_user="$c2a_bootstrap_user" <<'SQL'
BEGIN;

SELECT pg_catalog.set_config('kora.c2a_writer_user', :'c2a_writer_user', true);
SELECT pg_catalog.set_config(
  'kora.c2a_notification_user',
  :'c2a_notification_user',
  true
);
SELECT pg_catalog.set_config(
  'kora.c2a_expiration_user',
  :'c2a_expiration_user',
  true
);
SELECT pg_catalog.set_config('kora.c2a_bootstrap_user', :'c2a_bootstrap_user', true);

CREATE TEMPORARY TABLE expected_c2a_column_acl (
  role_name TEXT NOT NULL,
  relation_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  privilege_type TEXT NOT NULL,
  PRIMARY KEY (role_name, relation_name, column_name, privilege_type)
) ON COMMIT DROP;

CREATE TEMPORARY TABLE expected_c2a_relation_acl (
  role_name TEXT NOT NULL,
  relation_name TEXT NOT NULL,
  privilege_type TEXT NOT NULL,
  PRIMARY KEY (role_name, relation_name, privilege_type)
) ON COMMIT DROP;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminUser', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'email', 'role', 'status', 'authorizationVersion',
  'totpEnabledAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminUser', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'passwordHash', 'role', 'status', 'authorizationVersion',
  'totpSecretEncrypted', 'totpEnabledAt', 'lastAcceptedTotpCounter'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminUser', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'email', 'passwordHash', 'role', 'status', 'authorizationVersion',
  'totpSecretEncrypted', 'totpEnabledAt', 'lastAcceptedTotpCounter'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPreAuthContext', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'purpose', 'authorizationVersion', 'expiresAt',
  'consumedAt', 'revokedAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPreAuthContext', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'tokenHash', 'purpose', 'authorizationVersion', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminSession', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'accessTokenJti', 'authorizationVersion', 'expiresAt',
  'absoluteExpiresAt', 'stepUpPurpose', 'stepUpExpiresAt', 'revokedAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminSession', 'revokedAt', 'UPDATE');
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminTotpEnrollment', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'adminUserId', 'confirmedAt', 'revokedAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminTotpEnrollment', 'revokedAt', 'UPDATE');
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCodeBatch', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'adminUserId', 'revokedAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminRecoveryCodeBatch', 'revokedAt', 'UPDATE');

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetRequest', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'securityEventId', 'replacedRequestId',
  'expiresAt', 'revokedAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetRequest', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'securityEventId', 'replacedRequestId', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminPasswordResetRequest', 'revokedAt', 'UPDATE');

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetContext', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'passwordResetRequestId', 'adminUserId', 'tokenHash',
  'authorizationVersion', 'expiresAt', 'consumedAt', 'revokedAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetContext', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'passwordResetRequestId', 'adminUserId', 'tokenHash',
  'authorizationVersion', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetContext', column_name, 'UPDATE'
FROM unnest(ARRAY['consumedAt', 'revokedAt']) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCase', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'subjectAdminUserId', 'creatorAdminUserId', 'approverAdminUserId',
  'state', 'stateGeneration', 'expiresAt', 'approvedAt', 'cancelledAt',
  'expiredAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCase', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'subjectAdminUserId', 'creatorAdminUserId', 'state',
  'stateGeneration', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCase', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'approverAdminUserId', 'state', 'stateGeneration', 'approvedAt', 'cancelledAt'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminInvitation', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'emailCanonical', 'deliveryEmailEncrypted', 'codeHash', 'proposedRole',
  'creatorAdminUserId', 'createdByAuditLogId', 'acceptedAdminUserId',
  'replacedInvitationId', 'state', 'stateGeneration', 'expiresAt',
  'acceptedAt', 'revokedAt', 'expiredAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminInvitation', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'emailCanonical', 'deliveryEmailEncrypted', 'codeHash', 'proposedRole',
  'creatorAdminUserId', 'createdByAuditLogId', 'replacedInvitationId',
  'state', 'stateGeneration', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminInvitation', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'acceptedAdminUserId', 'state', 'stateGeneration', 'acceptedAt', 'revokedAt'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminNotificationOutbox', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'purpose', 'state', 'generation', 'encryptedPayload', 'encryptionKeyId',
  'encryptionNonce', 'encryptionTag', 'aadHash', 'sourceSecurityEventId',
  'sourceAuditLogId', 'passwordResetRequestId', 'adminInvitationId',
  'replacedOutboxId', 'attemptCount', 'nextAttemptAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminNotificationOutbox', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'purpose', 'state', 'generation', 'encryptedPayload', 'encryptionKeyId',
  'encryptionNonce', 'encryptionTag', 'aadHash', 'sourceSecurityEventId',
  'sourceAuditLogId', 'passwordResetRequestId', 'adminInvitationId',
  'replacedOutboxId', 'attemptCount', 'nextAttemptAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminNotificationOutbox', column_name, 'UPDATE'
FROM unnest(ARRAY['state', 'generation', 'cancelledAt']) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshot', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'principalAdminUserId', 'operation', 'filtersDigest',
  'projectionVersion', 'entryCount', 'utf8Bytes', 'createdAt', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshot', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'principalAdminUserId', 'operation', 'filtersDigest',
  'projectionVersion', 'entryCount', 'utf8Bytes', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshotItem', column_name, 'SELECT'
FROM unnest(ARRAY[
  'snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt',
  'projectionJson', 'utf8Bytes'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshotItem', column_name, 'INSERT'
FROM unnest(ARRAY[
  'snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt',
  'projectionJson', 'utf8Bytes'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminC2IdempotencyRecord', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'operation', 'idempotencyKey', 'requestDigest',
  'responseCode', 'resourceType', 'resourceId', 'expiresAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminC2IdempotencyRecord', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'operation', 'idempotencyKey', 'requestDigest',
  'responseCode', 'resourceType', 'resourceId'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminSecurityEvent', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'eventClass', 'action', 'outcome', 'failureCode',
  'requestId', 'subjectRefHash', 'entityType', 'entityId', 'adminInvitationId'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'adminUserId', 'subjectAdminUserId',
  'delegatedByAdminUserId', 'adminSessionId', 'adminRecoveryContextId',
  'adminPasswordResetContextId', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'causationEventId', 'causationSecurityEventId', 'adminRecoveryCaseId',
  'adminInvitationId', 'systemExecutionRefHash'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_notification_user', 'AdminNotificationOutbox', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'purpose', 'state', 'generation', 'encryptedPayload', 'encryptionKeyId',
  'encryptionNonce', 'encryptionTag', 'aadHash', 'sourceSecurityEventId',
  'sourceAuditLogId', 'passwordResetRequestId', 'adminInvitationId',
  'replacedOutboxId', 'claimOwnerHash', 'leaseExpiresAt', 'attemptCount',
  'nextAttemptAt', 'providerAcknowledgementHash', 'deliveredAt', 'failedAt',
  'uncertainAt', 'cancelledAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_notification_user', 'AdminNotificationOutbox', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'state', 'generation', 'claimOwnerHash', 'leaseExpiresAt', 'attemptCount',
  'nextAttemptAt', 'providerAcknowledgementHash', 'deliveredAt', 'failedAt',
  'uncertainAt', 'cancelledAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_notification_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'systemExecutionRefHash', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'causationEventId', 'causationSecurityEventId', 'delegatedByAdminUserId', 'adminInvitationId',
  'notificationOutboxId'
]) AS column_name;
INSERT INTO expected_c2a_relation_acl VALUES
  (:'c2a_notification_user', 'AdminC2NotificationSecurityEventSource', 'SELECT'),
  (:'c2a_notification_user', 'AdminC2NotificationAuditSource', 'SELECT');

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_expiration_user', 'AdminRecoveryCase', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'state', 'stateGeneration', 'expiresAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_expiration_user', 'AdminRecoveryCase', column_name, 'UPDATE'
FROM unnest(ARRAY['state', 'stateGeneration', 'expiredAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_expiration_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'systemExecutionRefHash', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'adminRecoveryCaseId'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminUser', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'email', 'status']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminUser', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'email', 'passwordHash', 'role', 'status', 'authorizationVersion',
  'totpSecretEncrypted', 'totpEnabledAt', 'lastAcceptedTotpCounter'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminBootstrapGuard', column_name, 'SELECT'
FROM unnest(ARRAY[
  'singletonKey', 'adminUserId', 'bootstrapAuditLogId', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminBootstrapGuard', column_name, 'INSERT'
FROM unnest(ARRAY['singletonKey', 'adminUserId', 'bootstrapAuditLogId']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'systemExecutionRefHash', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'bootstrapGuardId'
]) AS column_name;

DO $c2a_preflight$
DECLARE
  existing_role_count INTEGER;
  expected_role_count CONSTANT INTEGER := 4;
  mismatch_count INTEGER;
BEGIN
  SELECT count(*) INTO existing_role_count
  FROM pg_catalog.pg_roles
  WHERE rolname IN (
    pg_catalog.current_setting('kora.c2a_writer_user'),
    pg_catalog.current_setting('kora.c2a_notification_user'),
    pg_catalog.current_setting('kora.c2a_expiration_user'),
    pg_catalog.current_setting('kora.c2a_bootstrap_user')
  );

  IF existing_role_count NOT IN (0, expected_role_count) THEN
    RAISE EXCEPTION 'C2a provisioning refused a partial identity set';
  END IF;
  IF existing_role_count = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
      AND (
        NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
        OR rolconnlimit <> -1 OR rolvaliduntil IS NOT NULL OR rolconfig IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated role attributes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
       OR granted_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated role membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_shdepend AS dependency
    JOIN pg_catalog.pg_roles AS target_role
      ON target_role.oid = dependency.refobjid
    WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
      AND dependency.deptype = 'o'
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused identity-owned objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_db_role_setting AS role_setting
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = role_setting.setrole
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(routine_entry.proacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS type_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(type_entry.typacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(large_object.lomacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_parameter_acl AS parameter_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused routine, type, large-object, parameter or role-setting contamination';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry
      ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE (
        namespace_entry.nspname <> 'public'
        OR privilege.grantor <> class_entry.relowner
      )
      AND attribute_entry.attnum > 0
      AND NOT attribute_entry.attisdropped
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE (
        namespace_entry.nspname <> 'public'
        OR privilege.grantor <> class_entry.relowner
      )
      AND class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused off-public or non-owner-granted column or relation ACLs';
  END IF;

  WITH target_roles AS (
    SELECT oid, rolname::TEXT AS role_name FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ), actual_column_acl AS (
    SELECT target_role.role_name,
           class_entry.relname::TEXT AS relation_name,
           attribute_entry.attname::TEXT AS column_name,
           privilege.privilege_type::TEXT
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry
      ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND attribute_entry.attnum > 0
      AND NOT attribute_entry.attisdropped
      AND NOT privilege.is_grantable
  ), symmetric_difference AS (
    (SELECT * FROM actual_column_acl
     EXCEPT ALL
     SELECT * FROM expected_c2a_column_acl)
    UNION ALL
    (SELECT * FROM expected_c2a_column_acl
     EXCEPT ALL
     SELECT * FROM actual_column_acl)
  )
  SELECT count(*) INTO mismatch_count FROM symmetric_difference;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated column ACLs';
  END IF;

  WITH target_roles AS (
    SELECT oid, rolname::TEXT AS role_name FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ), actual_relation_acl AS (
    SELECT target_role.role_name,
           class_entry.relname::TEXT AS relation_name,
           privilege.privilege_type::TEXT
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT privilege.is_grantable
  ), symmetric_difference AS (
    (SELECT * FROM actual_relation_acl
     EXCEPT ALL
     SELECT * FROM expected_c2a_relation_acl)
    UNION ALL
    (SELECT * FROM expected_c2a_relation_acl
     EXCEPT ALL
     SELECT * FROM actual_relation_acl)
  )
  SELECT count(*) INTO mismatch_count FROM symmetric_difference;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated relation ACLs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE database_entry.datname = current_database()
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
      AND (
        privilege.privilege_type <> 'CONNECT'
        OR privilege.is_grantable
        OR privilege.grantor <> database_entry.datdba
      )
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE database_entry.datname = current_database()
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated database ACLs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
      AND (
        namespace_entry.nspname <> 'public'
        OR privilege.privilege_type <> 'USAGE'
        OR privilege.is_grantable
        OR privilege.grantor <> namespace_entry.nspowner
      )
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated schema ACLs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl AS default_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated default ACLs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
    ) AS privilege
    WHERE database_entry.datname = current_database()
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = routine_entry.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS type_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = type_entry.typnamespace
    LEFT JOIN pg_catalog.pg_class AS composite_entry
      ON composite_entry.oid = type_entry.typrelid
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND type_entry.typisdefined
      AND type_entry.typelem = 0
      AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(large_object.lomacl, pg_catalog.acldefault('L', large_object.lomowner))
    ) AS privilege
    WHERE privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_parameter_acl AS parameter_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
    WHERE privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS default_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
    WHERE privilege.grantee = 0
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused dangerous PUBLIC or default privileges';
  END IF;
END;
$c2a_preflight$;

ROLLBACK;
SQL
fi

psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --no-psqlrc \
  --quiet \
  --set=ON_ERROR_STOP=1 \
  --set=runtime_user="$runtime_user" \
  --set=admin_writer_user="$admin_writer_user" <<'SQL'
\set runtime_password `tr -d '\r\n' </run/secrets/postgres_runtime_password`
\set admin_writer_password `tr -d '\r\n' </run/secrets/postgres_admin_writer_password`

BEGIN;

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), writer_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'admin_writer_user'
), unsafe_role_membership AS (
  SELECT 1
  FROM pg_catalog.pg_auth_members AS membership
  WHERE membership.roleid = (SELECT oid FROM runtime_role)
     OR membership.member = (SELECT oid FROM runtime_role)
     OR membership.member = (SELECT oid FROM writer_role)
     OR membership.roleid = (SELECT oid FROM writer_role)
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_role_membership) AS role_membership_boundary_safe,
  (SELECT count(*) FROM unsafe_role_membership) AS role_membership_violation_count
\gset

\if :role_membership_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe role membership count=:role_membership_violation_count.
  DO $role_membership_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe reader or admin writer role membership';
  END
  $role_membership_refusal$;
\endif

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_owner_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = current_user
), current_database_entry AS (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), unsafe_session_replication_setting AS (
  SELECT 1
  FROM pg_catalog.pg_db_role_setting AS role_setting
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting_entry(setting)
  WHERE (
      role_setting.setrole = 0
      OR role_setting.setrole = (SELECT oid FROM runtime_role)
      OR role_setting.setrole = (SELECT oid FROM current_owner_role)
    )
    AND role_setting.setdatabase IN (0, current_database_entry.oid)
    AND split_part(setting_entry.setting, '=', 1) = 'session_replication_role'
    AND (
      role_setting.setrole = (SELECT oid FROM current_owner_role)
      OR split_part(setting_entry.setting, '=', 2) <> 'origin'
    )
  UNION ALL
  SELECT 1
  WHERE pg_catalog.current_setting('session_replication_role') <> 'origin'
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_session_replication_setting)
    AS session_replication_boundary_safe,
  (SELECT count(*) FROM unsafe_session_replication_setting)
    AS session_replication_violation_count
\gset

\if :session_replication_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe session replication setting count=:session_replication_violation_count.
  DO $session_replication_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe session replication setting';
  END
  $session_replication_refusal$;
\endif

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_owner_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = current_user
), current_database_entry AS (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), unsafe_large_object_compatibility_setting AS (
  SELECT 1
  FROM pg_catalog.pg_db_role_setting AS role_setting
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting_entry(setting)
  WHERE (
      role_setting.setrole = 0
      OR role_setting.setrole = (SELECT oid FROM runtime_role)
      OR role_setting.setrole = (SELECT oid FROM current_owner_role)
    )
    AND role_setting.setdatabase IN (0, current_database_entry.oid)
    AND split_part(setting_entry.setting, '=', 1) = 'lo_compat_privileges'
    AND (
      role_setting.setrole = (SELECT oid FROM current_owner_role)
      OR split_part(setting_entry.setting, '=', 2) <> 'off'
    )
  UNION ALL
  SELECT 1
  WHERE pg_catalog.current_setting('lo_compat_privileges') <> 'off'
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_large_object_compatibility_setting)
    AS large_object_compatibility_boundary_safe,
  (SELECT count(*) FROM unsafe_large_object_compatibility_setting)
    AS large_object_compatibility_violation_count
\gset

\if :large_object_compatibility_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe large object compatibility setting count=:large_object_compatibility_violation_count.
  DO $large_object_compatibility_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe large object compatibility setting';
  END
  $large_object_compatibility_refusal$;
\endif

WITH RECURSIVE runtime_role AS (
  SELECT oid, rolsuper
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), runtime_effective_roles AS (
  SELECT oid
  FROM runtime_role
  UNION
  SELECT membership.roleid
  FROM pg_catalog.pg_auth_members AS membership
  JOIN runtime_effective_roles AS effective_role
    ON effective_role.oid = membership.member
  JOIN pg_catalog.pg_roles AS member_role
    ON member_role.oid = membership.member
  WHERE member_role.rolinherit
    AND membership.inherit_option
), large_object_catalogs AS (
  SELECT relation_entry.oid, relation_entry.relacl, relation_entry.relname,
         relation_entry.relowner
  FROM pg_catalog.pg_class AS relation_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE namespace_entry.nspname = 'pg_catalog'
    AND relation_entry.relname IN ('pg_largeobject', 'pg_largeobject_metadata')
), unsafe_large_object_catalog_state AS (
  SELECT 1
  FROM large_object_catalogs AS catalog_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      catalog_entry.relacl,
      pg_catalog.acldefault('r', catalog_entry.relowner)
    )
  ) AS privilege
  WHERE privilege.grantee = 0
    AND (
      catalog_entry.relname = 'pg_largeobject'
      OR privilege.privilege_type <> 'SELECT'
      OR privilege.is_grantable
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_attribute AS attribute_entry
  JOIN large_object_catalogs AS catalog_entry
    ON catalog_entry.oid = attribute_entry.attrelid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
  WHERE attribute_entry.attnum > 0
    AND NOT attribute_entry.attisdropped
    AND privilege.grantee = 0
  UNION ALL
  SELECT 1
  FROM large_object_catalogs AS catalog_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      catalog_entry.relacl,
      pg_catalog.acldefault('r', catalog_entry.relowner)
    )
  ) AS privilege
  WHERE privilege.grantee IN (SELECT oid FROM runtime_effective_roles)
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_attribute AS attribute_entry
  JOIN large_object_catalogs AS catalog_entry
    ON catalog_entry.oid = attribute_entry.attrelid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
  WHERE attribute_entry.attnum > 0
    AND NOT attribute_entry.attisdropped
    AND privilege.grantee IN (SELECT oid FROM runtime_effective_roles)
  UNION ALL
  SELECT 1
  FROM large_object_catalogs AS catalog_entry
  CROSS JOIN runtime_role
  WHERE NOT runtime_role.rolsuper
    AND (
    (
      catalog_entry.relname = 'pg_largeobject'
      AND (
        pg_catalog.has_table_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
        )
        OR pg_catalog.has_any_column_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
      )
    )
    OR (
      catalog_entry.relname = 'pg_largeobject_metadata'
      AND (
        pg_catalog.has_table_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
        )
        OR pg_catalog.has_any_column_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'INSERT,UPDATE,REFERENCES'
        )
      )
    )
    OR pg_catalog.has_table_privilege(
      runtime_role.oid,
      catalog_entry.oid,
      'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION,MAINTAIN WITH GRANT OPTION'
    )
    OR pg_catalog.has_any_column_privilege(
      runtime_role.oid,
      catalog_entry.oid,
      'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION'
    )
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_large_object_catalog_state)
    AS large_object_catalog_boundary_safe,
  (SELECT count(*) FROM unsafe_large_object_catalog_state)
    AS large_object_catalog_violation_count
\gset

\if :large_object_catalog_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe large object catalog ACL state count=:large_object_catalog_violation_count.
  DO $large_object_catalog_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe large object catalog ACL state';
  END
  $large_object_catalog_refusal$;
\endif

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_database_entry AS (
  SELECT oid, datdba
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), unsafe_large_object_state AS (
  SELECT 1
  FROM pg_catalog.pg_largeobject_metadata AS large_object
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      large_object.lomacl,
      pg_catalog.acldefault('L', large_object.lomowner)
    )
  ) AS privilege
  WHERE large_object.lomowner = (SELECT oid FROM runtime_role)
    OR privilege.grantee = 0
    OR privilege.grantee = (SELECT oid FROM runtime_role)
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_default_acl AS default_acl
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
  WHERE default_acl.defaclobjtype = 'L'
    AND default_acl.defaclrole <> current_database_entry.datdba
    AND (
      privilege.grantee = 0
      OR privilege.grantee = (SELECT oid FROM runtime_role)
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_proc AS routine_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
  ) AS privilege
  WHERE namespace_entry.nspname = 'pg_catalog'
    AND (
      routine_entry.proname ~ '^lo_'
      OR routine_entry.proname IN ('loread', 'lowrite')
    )
    AND (
      privilege.grantee = (SELECT oid FROM runtime_role)
      OR (
        privilege.grantee = 0
        AND (privilege.privilege_type <> 'EXECUTE' OR privilege.is_grantable)
      )
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_large_object_state) AS large_object_boundary_safe,
  (SELECT count(*) FROM unsafe_large_object_state) AS large_object_violation_count
\gset

\if :large_object_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe large object state count=:large_object_violation_count.
  DO $large_object_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe large object state';
  END
  $large_object_refusal$;
\endif

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), unsafe_parameter_acl AS (
  SELECT 1
  FROM pg_catalog.pg_parameter_acl AS parameter_acl
  CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
  WHERE privilege.privilege_type IN ('SET', 'ALTER SYSTEM')
    AND (
      privilege.grantee = 0
      OR privilege.grantee = (SELECT oid FROM runtime_role)
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_parameter_acl) AS parameter_boundary_safe,
  (SELECT count(*) FROM unsafe_parameter_acl) AS parameter_violation_count
\gset

\if :parameter_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe cluster parameter ACL count=:parameter_violation_count.
  DO $parameter_boundary_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe cluster parameter ACL';
  END
  $parameter_boundary_refusal$;
\endif

WITH writer_role AS (
  SELECT oid, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit,
         rolreplication, rolsuper
  FROM pg_catalog.pg_roles
  WHERE rolname = :'admin_writer_user'
), current_database_entry AS (
  SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()
), non_system_schemas AS (
  SELECT oid, nspname FROM pg_catalog.pg_namespace
  WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
), large_object_routines AS (
  SELECT routine_entry.oid
  FROM pg_catalog.pg_proc AS routine_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  WHERE namespace_entry.nspname = 'pg_catalog'
    AND (routine_entry.proname ~ '^lo_' OR routine_entry.proname IN ('loread', 'lowrite'))
), unsafe_writer_state AS (
  SELECT 1 FROM writer_role
  WHERE rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_auth_members AS membership
  WHERE membership.member = (SELECT oid FROM writer_role)
     OR membership.roleid = (SELECT oid FROM writer_role)
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_shdepend AS dependency
  CROSS JOIN current_database_entry
  WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
    AND dependency.refobjid = (SELECT oid FROM writer_role)
    AND dependency.deptype = 'o'
    AND (dependency.dbid IN (0, current_database_entry.oid))
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_db_role_setting AS role_setting
  CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting_entry(setting)
  WHERE role_setting.setrole = (SELECT oid FROM writer_role)
    AND (
      (split_part(setting_entry.setting, '=', 1) = 'session_replication_role'
       AND split_part(setting_entry.setting, '=', 2) <> 'origin')
      OR (split_part(setting_entry.setting, '=', 1) = 'lo_compat_privileges'
          AND split_part(setting_entry.setting, '=', 2) <> 'off')
    )
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_parameter_acl AS parameter_acl
  WHERE pg_catalog.has_parameter_privilege((SELECT oid FROM writer_role), parameter_acl.parname, 'SET')
     OR pg_catalog.has_parameter_privilege((SELECT oid FROM writer_role), parameter_acl.parname, 'ALTER SYSTEM')
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_largeobject_metadata AS large_object
  WHERE large_object.lomowner = (SELECT oid FROM writer_role)
     OR pg_catalog.has_largeobject_privilege((SELECT oid FROM writer_role), large_object.oid, 'SELECT,UPDATE')
  UNION ALL
  SELECT 1 FROM non_system_schemas AS namespace_entry
  WHERE namespace_entry.nspname <> 'public'
    AND pg_catalog.has_schema_privilege(
      (SELECT oid FROM writer_role), namespace_entry.oid, 'USAGE,CREATE'
    )
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_class AS class_entry
  JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
  WHERE namespace_entry.nspname <> 'public'
    AND (
      (class_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND pg_catalog.has_table_privilege(
         (SELECT oid FROM writer_role), class_entry.oid,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
       ))
      OR (class_entry.relkind = 'S'
          AND pg_catalog.has_sequence_privilege(
            (SELECT oid FROM writer_role), class_entry.oid, 'USAGE,SELECT,UPDATE'
          ))
    )
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_attribute AS attribute_entry
  JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
  JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
  WHERE namespace_entry.nspname = 'public'
    AND attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
    AND privilege.grantee = (SELECT oid FROM writer_role)
    AND privilege.is_grantable
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_proc AS routine_entry
  JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
  ) AS privilege
  WHERE privilege.grantee = (SELECT oid FROM writer_role)
  UNION ALL
  SELECT 1 FROM large_object_routines AS routine_entry
  JOIN pg_catalog.pg_proc AS raw_routine ON raw_routine.oid = routine_entry.oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(raw_routine.proacl, pg_catalog.acldefault('f', raw_routine.proowner))
  ) AS privilege
  WHERE privilege.grantee = (SELECT oid FROM writer_role)
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_type AS type_entry
  JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
  LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
  ) AS privilege
  WHERE type_entry.typisdefined AND type_entry.typelem = 0
    AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
    AND privilege.grantee = (SELECT oid FROM writer_role)
  UNION ALL
  SELECT 1 FROM pg_catalog.pg_default_acl AS default_acl
  CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
  WHERE privilege.grantee = (SELECT oid FROM writer_role)
)
SELECT NOT EXISTS (SELECT 1 FROM unsafe_writer_state) AS writer_boundary_safe,
       (SELECT count(*) FROM unsafe_writer_state) AS writer_boundary_violation_count
\gset

\if :writer_boundary_safe
\else
  \echo PostgreSQL admin writer provisioning refused unsafe pre-existing state count=:writer_boundary_violation_count.
  DO $writer_boundary_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe pre-existing admin writer state';
  END
  $writer_boundary_refusal$;
\endif

SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'runtime_user',
  :'runtime_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'runtime_user'
) \gexec

SELECT format(
  'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1 PASSWORD %L',
  :'runtime_user',
  :'runtime_password'
) \gexec

SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'admin_writer_user',
  :'admin_writer_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'admin_writer_user'
) \gexec

SELECT format(
  'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1 PASSWORD %L',
  :'admin_writer_user',
  :'admin_writer_password'
) \gexec

SELECT format('REVOKE %I FROM %I', granted_role.rolname, :'runtime_user')
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
WHERE member_role.rolname = :'runtime_user' \gexec

SELECT format('REVOKE %I FROM %I', granted_role.rolname, :'admin_writer_user')
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
WHERE member_role.rolname = :'admin_writer_user' \gexec

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_database_entry AS (
  SELECT oid, datdba
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), non_system_schemas AS (
  SELECT oid, nspname, nspowner
  FROM pg_catalog.pg_namespace
  WHERE nspname <> 'information_schema'
    AND nspname !~ '^pg_'
), privilege_bearing_types AS (
  SELECT type_entry.oid, type_entry.typnamespace, type_entry.typowner
  FROM pg_catalog.pg_type AS type_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = type_entry.typnamespace
  LEFT JOIN pg_catalog.pg_class AS composite_entry
    ON composite_entry.oid = type_entry.typrelid
  WHERE type_entry.typisdefined
    AND type_entry.typelem = 0
    AND (
      type_entry.typrelid = 0
      OR composite_entry.relkind = 'c'
    )
), unsafe_boundary_state AS (
  SELECT 1
  FROM pg_catalog.pg_shdepend AS dependency
  CROSS JOIN runtime_role
  CROSS JOIN current_database_entry
  WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
    AND dependency.refobjid = runtime_role.oid
    AND dependency.deptype = 'o'
    AND (
      dependency.dbid = current_database_entry.oid
      OR (
        dependency.dbid = 0
        AND dependency.classid = 'pg_catalog.pg_database'::regclass
        AND dependency.objid = current_database_entry.oid
      )
    )
  UNION ALL
  SELECT 1
  FROM non_system_schemas AS namespace_entry
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      namespace_entry.nspowner = runtime_role.oid
      OR pg_catalog.has_schema_privilege(
        :'runtime_user',
        namespace_entry.oid,
        'USAGE,CREATE'
      )
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_class AS relation_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      relation_entry.relowner = runtime_role.oid
      OR (
        relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND pg_catalog.has_table_privilege(
          :'runtime_user',
          relation_entry.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
        )
      )
      OR (
        relation_entry.relkind = 'S'
        AND pg_catalog.has_sequence_privilege(
          :'runtime_user',
          relation_entry.oid,
          'USAGE,SELECT,UPDATE'
        )
      )
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_attribute AS attribute_entry
  JOIN pg_catalog.pg_class AS relation_entry
    ON relation_entry.oid = attribute_entry.attrelid
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE namespace_entry.nspname <> 'public'
    AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND attribute_entry.attnum > 0
    AND NOT attribute_entry.attisdropped
    AND pg_catalog.has_column_privilege(
      :'runtime_user',
      relation_entry.oid,
      attribute_entry.attnum,
      'SELECT,INSERT,UPDATE,REFERENCES'
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_proc AS routine_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      routine_entry.proowner = runtime_role.oid
      OR pg_catalog.has_function_privilege(
        :'runtime_user',
        routine_entry.oid,
        'EXECUTE'
      )
    )
  UNION ALL
  SELECT 1
  FROM privilege_bearing_types AS type_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = type_entry.typnamespace
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      type_entry.typowner = runtime_role.oid
      OR pg_catalog.has_type_privilege(
        :'runtime_user',
        type_entry.oid,
        'USAGE'
      )
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_default_acl AS default_acl
  LEFT JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = default_acl.defaclnamespace
  CROSS JOIN runtime_role
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
  WHERE privilege.grantee IN (0, runtime_role.oid)
    AND (
      default_acl.defaclnamespace = 0
      OR namespace_entry.oid IS NOT NULL
    )
    AND NOT (
      default_acl.defaclrole = current_database_entry.datdba
      AND (
        (
          default_acl.defaclnamespace = 0
          AND default_acl.defaclobjtype IN ('r', 'S', 'f', 'T', 'L')
        )
        OR (
          namespace_entry.nspname = 'public'
          AND default_acl.defaclobjtype IN ('r', 'S', 'f', 'T')
        )
      )
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_boundary_state) AS database_boundary_safe,
  (SELECT count(*) FROM unsafe_boundary_state) AS boundary_violation_count
\gset

\if :database_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe pre-existing database state count=:boundary_violation_count.
  DO $boundary_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe pre-existing database state';
  END
  $boundary_refusal$;
\endif

SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), :'runtime_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_user') \gexec
SELECT format('ALTER ROLE %I RESET ALL', :'runtime_user') \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I RESET ALL',
  :'runtime_user',
  current_database()
) \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I SET search_path = pg_catalog, public',
  :'runtime_user',
  current_database()
) \gexec
SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), :'admin_writer_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'admin_writer_user') \gexec
SELECT format('ALTER ROLE %I RESET ALL', :'admin_writer_user') \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I RESET ALL',
  :'admin_writer_user',
  current_database()
) \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I SET search_path = pg_catalog, public',
  :'admin_writer_user',
  current_database()
) \gexec

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', :'admin_writer_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'admin_writer_user') \gexec

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM PUBLIC', namespace_entry.nspname, type_entry.typname)
FROM pg_catalog.pg_type AS type_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = type_entry.typnamespace
LEFT JOIN pg_catalog.pg_class AS composite_entry
  ON composite_entry.oid = type_entry.typrelid
WHERE namespace_entry.nspname = 'public'
  AND type_entry.typisdefined
  AND type_entry.typelem = 0
  AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format(
  'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I',
  namespace_entry.nspname,
  type_entry.typname,
  :'runtime_user'
)
FROM pg_catalog.pg_type AS type_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = type_entry.typnamespace
LEFT JOIN pg_catalog.pg_class AS composite_entry
  ON composite_entry.oid = type_entry.typrelid
WHERE namespace_entry.nspname = 'public'
  AND type_entry.typisdefined
  AND type_entry.typelem = 0
  AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'admin_writer_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'admin_writer_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', :'admin_writer_user') \gexec
SELECT format(
  'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I',
  namespace_entry.nspname,
  type_entry.typname,
  :'admin_writer_user'
)
FROM pg_catalog.pg_type AS type_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = type_entry.typnamespace
LEFT JOIN pg_catalog.pg_class AS composite_entry
  ON composite_entry.oid = type_entry.typrelid
WHERE namespace_entry.nspname = 'public'
  AND type_entry.typisdefined
  AND type_entry.typelem = 0
  AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c') \gexec

SELECT format(
  'REVOKE %s (%I) ON TABLE %I.%I FROM PUBLIC',
  column_privilege.privilege_type,
  attribute_entry.attname,
  namespace_entry.nspname,
  relation_entry.relname
)
FROM pg_catalog.pg_attribute AS attribute_entry
JOIN pg_catalog.pg_class AS relation_entry
  ON relation_entry.oid = attribute_entry.attrelid
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = relation_entry.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS column_privilege
WHERE namespace_entry.nspname = 'public'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND attribute_entry.attnum > 0
  AND NOT attribute_entry.attisdropped
  AND column_privilege.grantee = 0 \gexec

SELECT format(
  'REVOKE %s (%I) ON TABLE %I.%I FROM %I',
  column_privilege.privilege_type,
  attribute_entry.attname,
  namespace_entry.nspname,
  relation_entry.relname,
  :'runtime_user'
)
FROM pg_catalog.pg_attribute AS attribute_entry
JOIN pg_catalog.pg_class AS relation_entry
  ON relation_entry.oid = attribute_entry.attrelid
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = relation_entry.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS column_privilege
WHERE namespace_entry.nspname = 'public'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND attribute_entry.attnum > 0
  AND NOT attribute_entry.attisdropped
  AND column_privilege.grantee = (
    SELECT runtime_role.oid
    FROM pg_catalog.pg_roles AS runtime_role
    WHERE runtime_role.rolname = :'runtime_user'
  ) \gexec

SELECT format(
  'REVOKE %s (%I) ON TABLE %I.%I FROM %I',
  column_privilege.privilege_type,
  attribute_entry.attname,
  namespace_entry.nspname,
  relation_entry.relname,
  :'admin_writer_user'
)
FROM pg_catalog.pg_attribute AS attribute_entry
JOIN pg_catalog.pg_class AS relation_entry
  ON relation_entry.oid = attribute_entry.attrelid
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = relation_entry.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS column_privilege
WHERE namespace_entry.nspname = 'public'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND attribute_entry.attnum > 0
  AND NOT attribute_entry.attisdropped
  AND column_privilege.grantee = (
    SELECT writer_role.oid FROM pg_catalog.pg_roles AS writer_role
    WHERE writer_role.rolname = :'admin_writer_user'
  ) \gexec

SELECT format('GRANT SELECT ("id") ON TABLE public."Customer" TO %I', :'runtime_user') \gexec
SELECT format('GRANT SELECT ("id", "role", "status", "authorizationVersion", "totpEnabledAt") ON TABLE public."AdminUser" TO %I', :'runtime_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "authorizationVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt", "absoluteExpiresAt", "revokedAt", "createdAt", "updatedAt", "stepUpPurpose", "stepUpVerifiedAt", "stepUpExpiresAt") ON TABLE public."AdminSession" TO %I', :'runtime_user') \gexec

SELECT format('GRANT SELECT ("id", "email", "passwordHash", "role", "status", "authorizationVersion", "totpSecretEncrypted", "totpEnabledAt", "lastAcceptedTotpCounter", "createdAt"), UPDATE ("status", "authorizationVersion", "totpSecretEncrypted", "totpEnabledAt", "lastAcceptedTotpCounter") ON TABLE public."AdminUser" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash", "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt", "absoluteExpiresAt", "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt", "stepUpExpiresAt", "revokedAt", "createdAt", "updatedAt"), INSERT ("id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash", "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt", "absoluteExpiresAt", "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt", "stepUpExpiresAt", "revokedAt", "createdAt", "updatedAt"), UPDATE ("accessTokenJti", "refreshTokenHash", "refreshTokenVersion", "lastActivityAt", "expiresAt", "revokedAt", "updatedAt", "stepUpPurpose", "stepUpVerifiedAt", "stepUpExpiresAt") ON TABLE public."AdminSession" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "batchId", "selector", "codeHash", "usedAt", "createdAt"), INSERT ("id", "adminUserId", "batchId", "selector", "codeHash", "usedAt", "createdAt"), UPDATE ("usedAt") ON TABLE public."AdminRecoveryCode" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt", "consumedAt", "revokedAt", "createdAt"), INSERT ("id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt", "consumedAt", "revokedAt", "createdAt"), UPDATE ("consumedAt", "revokedAt") ON TABLE public."AdminPreAuthContext" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "adminPreAuthContextId", "adminRecoveryContextId", "secretEncrypted", "authorizationVersion", "expiresAt", "qrDeliveredAt", "confirmedAt", "revokedAt", "createdAt"), INSERT ("id", "adminUserId", "adminPreAuthContextId", "adminRecoveryContextId", "secretEncrypted", "authorizationVersion", "expiresAt", "qrDeliveredAt", "confirmedAt", "revokedAt", "createdAt"), UPDATE ("qrDeliveredAt", "confirmedAt", "revokedAt") ON TABLE public."AdminTotpEnrollment" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "tokenHash", "recoveryCodeId", "authorizationVersion", "expiresAt", "consumedAt", "revokedAt", "createdAt"), INSERT ("id", "adminUserId", "tokenHash", "recoveryCodeId", "authorizationVersion", "expiresAt", "consumedAt", "revokedAt", "createdAt"), UPDATE ("consumedAt", "revokedAt") ON TABLE public."AdminRecoveryContext" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash", "generation", "expiresAt", "consumedAt", "createdAt"), INSERT ("id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash", "generation", "expiresAt", "consumedAt", "createdAt"), UPDATE ("consumedAt") ON TABLE public."AdminRefreshToken" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "revokedAt", "createdAt"), INSERT ("id", "adminUserId", "revokedAt", "createdAt"), UPDATE ("revokedAt") ON TABLE public."AdminRecoveryCodeBatch" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT SELECT ("id", "adminUserId", "operation", "idempotencyKey", "requestHash", "responseCode", "resourceType", "resourceId", "expiresAt", "createdAt"), INSERT ("id", "adminUserId", "operation", "idempotencyKey", "requestHash", "responseCode", "resourceType", "resourceId", "expiresAt", "createdAt") ON TABLE public."AdminIdempotencyRecord" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT INSERT ("id", "adminUserId", "subjectAdminUserId", "adminSessionId", "adminRecoveryContextId", "eventClass", "context", "action", "entityType", "entityId", "maskedBefore", "maskedAfter", "reason", "reasonCode", "operatorReason", "requestId", "createdAt") ON TABLE public."AuditLog" TO %I', :'admin_writer_user') \gexec
SELECT format('GRANT INSERT ("id", "adminUserId", "eventClass", "action", "outcome", "failureCode", "requestId", "subjectRefHash", "createdAt") ON TABLE public."AdminSecurityEvent" TO %I', :'admin_writer_user') \gexec

SELECT format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', routine_entry.oid::regprocedure)
FROM pg_catalog.pg_proc AS routine_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = routine_entry.pronamespace
WHERE namespace_entry.nspname = 'pg_catalog'
  AND (
    routine_entry.proname ~ '^lo_'
    OR routine_entry.proname IN ('loread', 'lowrite')
  ) \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION %s FROM %I',
  routine_entry.oid::regprocedure,
  :'runtime_user'
)
FROM pg_catalog.pg_proc AS routine_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = routine_entry.pronamespace
WHERE namespace_entry.nspname = 'pg_catalog'
  AND (
    routine_entry.proname ~ '^lo_'
    OR routine_entry.proname IN ('loread', 'lowrite')
  ) \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION %s FROM %I',
  routine_entry.oid::regprocedure,
  :'admin_writer_user'
)
FROM pg_catalog.pg_proc AS routine_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = routine_entry.pronamespace
WHERE namespace_entry.nspname = 'pg_catalog'
  AND (
    routine_entry.proname ~ '^lo_'
    OR routine_entry.proname IN ('loread', 'lowrite')
  ) \gexec

ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON LARGE OBJECTS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON LARGE OBJECTS FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TYPES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON LARGE OBJECTS FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
  :'admin_writer_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TYPES FROM %I',
  :'admin_writer_user'
) \gexec

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), writer_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'admin_writer_user'
), incident_role_membership AS (
  SELECT 1
  FROM pg_catalog.pg_auth_members AS membership
  WHERE membership.member IN (
          (SELECT oid FROM runtime_role),
          (SELECT oid FROM writer_role)
        )
     OR membership.roleid IN (
          (SELECT oid FROM runtime_role),
          (SELECT oid FROM writer_role)
        )
)
SELECT NOT EXISTS (SELECT 1 FROM incident_role_membership)
  AS role_membership_postcondition_safe
\gset

\if :role_membership_postcondition_safe
\else
  DO $role_membership_postcondition_refusal$
  BEGIN
    RAISE EXCEPTION 'reader or admin writer role membership postcondition failed';
  END
  $role_membership_postcondition_refusal$;
\endif

COMMIT;
SQL

unset PGPASSWORD
runtime_result="$(
  PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_runtime_password)" psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$runtime_user" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="WITH runtime_role AS (SELECT oid, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), current_database_entry AS (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()), non_system_schemas AS (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'), privilege_bearing_types AS (SELECT type_entry.oid FROM pg_catalog.pg_type AS type_entry JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid WHERE type_entry.typisdefined AND type_entry.typelem = 0 AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')), large_object_routines AS (SELECT routine_entry.oid FROM pg_catalog.pg_proc AS routine_entry JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace WHERE namespace_entry.nspname = 'pg_catalog' AND (routine_entry.proname ~ '^lo_' OR routine_entry.proname IN ('loread', 'lowrite'))) SELECT current_user = session_user AND current_setting('session_replication_role') = 'origin' AND current_setting('lo_compat_privileges') = 'off' AND NOT runtime_role.rolsuper AND NOT runtime_role.rolcreaterole AND NOT runtime_role.rolcreatedb AND NOT runtime_role.rolinherit AND NOT runtime_role.rolreplication AND NOT runtime_role.rolbypassrls AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS membership WHERE membership.member = runtime_role.oid OR membership.roleid = runtime_role.oid) AND has_database_privilege(current_user, current_database(), 'CONNECT') AND NOT has_database_privilege(current_user, current_database(), 'CONNECT WITH GRANT OPTION') AND NOT has_database_privilege(current_user, current_database(), 'CREATE') AND NOT has_database_privilege(current_user, current_database(), 'TEMPORARY') AND has_schema_privilege(current_user, 'public', 'USAGE') AND NOT has_schema_privilege(current_user, 'public', 'USAGE WITH GRANT OPTION') AND NOT has_schema_privilege(current_user, 'public', 'CREATE') AND NOT EXISTS (SELECT 1 FROM privilege_bearing_types AS type_entry WHERE has_type_privilege(current_user, type_entry.oid, 'USAGE')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata AS large_object WHERE large_object.lomowner = runtime_role.oid OR has_largeobject_privilege(current_user, large_object.oid, 'SELECT,UPDATE')) AND NOT EXISTS (SELECT 1 FROM large_object_routines AS routine_entry WHERE has_function_privilege(current_user, routine_entry.oid, 'EXECUTE')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_parameter_acl AS parameter_acl WHERE pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'SET') OR pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'ALTER SYSTEM')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend AS dependency CROSS JOIN current_database_entry WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass AND dependency.refobjid = runtime_role.oid AND dependency.deptype = 'o' AND (dependency.dbid = current_database_entry.oid OR (dependency.dbid = 0 AND dependency.classid = 'pg_catalog.pg_database'::regclass AND dependency.objid = current_database_entry.oid))) FROM runtime_role;"
)"

if [ "$runtime_result" != 't' ]; then
  echo 'PostgreSQL runtime boundary verification failed.' >&2
  exit 1
fi

large_object_catalog_result="$(
  PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_runtime_password)" psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$runtime_user" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="WITH large_object_catalogs AS (SELECT relation_entry.oid, relation_entry.relname FROM pg_catalog.pg_class AS relation_entry JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace WHERE namespace_entry.nspname = 'pg_catalog' AND relation_entry.relname IN ('pg_largeobject', 'pg_largeobject_metadata')) SELECT NOT EXISTS (SELECT 1 FROM large_object_catalogs AS catalog_entry WHERE (catalog_entry.relname = 'pg_largeobject' AND (has_table_privilege(current_user, catalog_entry.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(current_user, catalog_entry.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))) OR (catalog_entry.relname = 'pg_largeobject_metadata' AND (has_table_privilege(current_user, catalog_entry.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(current_user, catalog_entry.oid, 'INSERT,UPDATE,REFERENCES'))) OR has_table_privilege(current_user, catalog_entry.oid, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION,MAINTAIN WITH GRANT OPTION') OR has_any_column_privilege(current_user, catalog_entry.oid, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION'));"
)"

if [ "$large_object_catalog_result" != 't' ]; then
  echo 'PostgreSQL runtime large object catalog boundary verification failed.' >&2
  exit 1
fi

admin_writer_result="$(
  PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_admin_writer_password)" psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$admin_writer_user" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="WITH writer_role AS (
      SELECT oid, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole,
             rolinherit, rolreplication, rolsuper
        FROM pg_catalog.pg_roles WHERE rolname = current_user
    ), current_database_entry AS (
      SELECT oid, datacl, datdba FROM pg_catalog.pg_database
       WHERE datname = current_database()
    ), non_system_schemas AS (
      SELECT oid, nspname, nspacl, nspowner FROM pg_catalog.pg_namespace
       WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
    ), large_object_routines AS (
      SELECT routine_entry.oid
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = routine_entry.pronamespace
       WHERE namespace_entry.nspname = 'pg_catalog'
         AND (routine_entry.proname ~ '^lo_' OR routine_entry.proname IN ('loread', 'lowrite'))
    ), actual_column_privileges AS (
      SELECT attribute_entry.attrelid, attribute_entry.attnum,
             privilege.privilege_type, privilege.is_grantable
        FROM pg_catalog.pg_attribute AS attribute_entry
        JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
        CROSS JOIN writer_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
       WHERE namespace_entry.nspname = 'public'
         AND class_entry.relkind IN ('r', 'p')
         AND attribute_entry.attnum > 0
         AND NOT attribute_entry.attisdropped
         AND privilege.grantee = writer_role.oid
    ), public_grants AS (
      SELECT 1 FROM current_database_entry AS database_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
      ) AS privilege WHERE privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM non_system_schemas AS namespace_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
      ) AS privilege WHERE privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_class AS class_entry
      JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(class_entry.relacl, pg_catalog.acldefault(
          CASE WHEN class_entry.relkind = 'S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,
          class_entry.relowner))
      ) AS privilege
      WHERE class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_attribute AS attribute_entry
      JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
      JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
      WHERE attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
        AND privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_proc AS routine_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
      ) AS privilege
      WHERE privilege.grantee = 0 AND (
        (namespace_entry.nspname <> 'information_schema' AND namespace_entry.nspname !~ '^pg_')
        OR routine_entry.oid IN (SELECT oid FROM large_object_routines))
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_type AS type_entry
      JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
      LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
      ) AS privilege
      WHERE type_entry.typisdefined AND type_entry.typelem = 0
        AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
        AND privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_largeobject_metadata AS large_object
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(large_object.lomacl, pg_catalog.acldefault('L', large_object.lomowner))
      ) AS privilege WHERE privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_parameter_acl AS parameter_acl
      CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
      WHERE privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_default_acl AS default_acl
      CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
      WHERE privilege.grantee = 0
    )
    SELECT current_user = session_user
      AND current_setting('session_replication_role') = 'origin'
      AND current_setting('lo_compat_privileges') = 'off'
      AND writer_role.rolcanlogin AND NOT writer_role.rolsuper
      AND NOT writer_role.rolcreatedb AND NOT writer_role.rolcreaterole
      AND NOT writer_role.rolinherit AND NOT writer_role.rolreplication
      AND NOT writer_role.rolbypassrls
      AND has_database_privilege(current_user, current_database(), 'CONNECT')
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE,TEMPORARY')
      AND has_schema_privilege(current_user, 'public', 'USAGE')
      AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
      AND (SELECT count(*) FROM current_database_entry AS database_entry
           CROSS JOIN writer_role
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
           ) AS privilege
           WHERE privilege.grantee = writer_role.oid
             AND privilege.privilege_type = 'CONNECT' AND NOT privilege.is_grantable) = 1
      AND (SELECT count(*) FROM non_system_schemas AS namespace_entry
           CROSS JOIN writer_role
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
           ) AS privilege
           WHERE namespace_entry.nspname = 'public'
             AND privilege.grantee = writer_role.oid
             AND privilege.privilege_type = 'USAGE' AND NOT privilege.is_grantable) = 1
      AND (SELECT count(*) FROM actual_column_privileges) = 213
      AND NOT EXISTS (SELECT 1 FROM actual_column_privileges WHERE is_grantable)
      AND NOT EXISTS (SELECT 1 FROM public_grants)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
                       WHERE member = writer_role.oid OR roleid = writer_role.oid)
      AND NOT EXISTS (SELECT 1 FROM non_system_schemas AS namespace_entry
                       WHERE namespace_entry.nspname <> 'public'
                         AND has_schema_privilege(current_user, namespace_entry.oid, 'USAGE,CREATE'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS class_entry
                      JOIN non_system_schemas AS namespace_entry
                        ON namespace_entry.oid = class_entry.relnamespace
                      CROSS JOIN LATERAL pg_catalog.aclexplode(
                        COALESCE(class_entry.relacl, pg_catalog.acldefault('r', class_entry.relowner))
                      ) AS privilege
                      WHERE class_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
                        AND privilege.grantee = writer_role.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class AS class_entry
                      JOIN non_system_schemas AS namespace_entry
                        ON namespace_entry.oid = class_entry.relnamespace
                      WHERE class_entry.relkind = 'S'
                        AND has_sequence_privilege(current_user, class_entry.oid, 'USAGE,SELECT,UPDATE'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS routine_entry
                      JOIN non_system_schemas AS namespace_entry
                        ON namespace_entry.oid = routine_entry.pronamespace
                      WHERE has_function_privilege(current_user, routine_entry.oid, 'EXECUTE'))
      AND NOT EXISTS (SELECT 1 FROM large_object_routines AS routine_entry
                      WHERE has_function_privilege(current_user, routine_entry.oid, 'EXECUTE'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type AS type_entry
                      JOIN non_system_schemas AS namespace_entry
                        ON namespace_entry.oid = type_entry.typnamespace
                      LEFT JOIN pg_catalog.pg_class AS composite_entry
                        ON composite_entry.oid = type_entry.typrelid
                      WHERE type_entry.typisdefined AND type_entry.typelem = 0
                        AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
                        AND has_type_privilege(current_user, type_entry.oid, 'USAGE'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata AS large_object
                      WHERE large_object.lomowner = writer_role.oid
                         OR has_largeobject_privilege(current_user, large_object.oid, 'SELECT,UPDATE'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_parameter_acl AS parameter_acl
                      WHERE has_parameter_privilege(current_user, parameter_acl.parname, 'SET')
                         OR has_parameter_privilege(current_user, parameter_acl.parname, 'ALTER SYSTEM'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl AS default_acl
                      CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
                      WHERE privilege.grantee IN (0, writer_role.oid))
    FROM writer_role;"
)"

if [ "$admin_writer_result" != 't' ]; then
  echo 'PostgreSQL admin writer boundary verification failed.' >&2
  exit 1
fi

if [ "$c2a_enabled" = 'true' ]; then
  export PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_password)"
  psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --quiet \
    --set=ON_ERROR_STOP=1 \
    --set=c2a_writer_user="$c2a_writer_user" \
    --set=c2a_notification_user="$c2a_notification_user" \
    --set=c2a_expiration_user="$c2a_expiration_user" \
    --set=c2a_bootstrap_user="$c2a_bootstrap_user" <<'SQL'
\set c2a_writer_password `tr -d '\r\n' <"$KORA_POSTGRES_C2A_SECRET_DIRECTORY/postgres_admin_c2a_writer_password"`
\set c2a_notification_password `tr -d '\r\n' <"$KORA_POSTGRES_C2A_SECRET_DIRECTORY/postgres_admin_c2a_notification_worker_password"`
\set c2a_expiration_password `tr -d '\r\n' <"$KORA_POSTGRES_C2A_SECRET_DIRECTORY/postgres_admin_c2a_expiration_worker_password"`
\set c2a_bootstrap_password `tr -d '\r\n' <"$KORA_POSTGRES_C2A_SECRET_DIRECTORY/postgres_admin_c2a_bootstrap_password"`

BEGIN;

SELECT pg_catalog.set_config('kora.c2a_writer_user', :'c2a_writer_user', true);
SELECT pg_catalog.set_config(
  'kora.c2a_notification_user',
  :'c2a_notification_user',
  true
);
SELECT pg_catalog.set_config(
  'kora.c2a_expiration_user',
  :'c2a_expiration_user',
  true
);
SELECT pg_catalog.set_config('kora.c2a_bootstrap_user', :'c2a_bootstrap_user', true);

CREATE TEMPORARY TABLE expected_c2a_column_acl (
  role_name TEXT NOT NULL,
  relation_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  privilege_type TEXT NOT NULL,
  PRIMARY KEY (role_name, relation_name, column_name, privilege_type)
) ON COMMIT DROP;

CREATE TEMPORARY TABLE expected_c2a_relation_acl (
  role_name TEXT NOT NULL,
  relation_name TEXT NOT NULL,
  privilege_type TEXT NOT NULL,
  PRIMARY KEY (role_name, relation_name, privilege_type)
) ON COMMIT DROP;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminUser', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'email', 'role', 'status', 'authorizationVersion',
  'totpEnabledAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminUser', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'passwordHash', 'role', 'status', 'authorizationVersion',
  'totpSecretEncrypted', 'totpEnabledAt', 'lastAcceptedTotpCounter'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminUser', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'email', 'passwordHash', 'role', 'status', 'authorizationVersion',
  'totpSecretEncrypted', 'totpEnabledAt', 'lastAcceptedTotpCounter'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPreAuthContext', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'purpose', 'authorizationVersion', 'expiresAt',
  'consumedAt', 'revokedAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPreAuthContext', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'tokenHash', 'purpose', 'authorizationVersion', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminSession', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'accessTokenJti', 'authorizationVersion', 'expiresAt',
  'absoluteExpiresAt', 'stepUpPurpose', 'stepUpExpiresAt', 'revokedAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminSession', 'revokedAt', 'UPDATE');
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminTotpEnrollment', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'adminUserId', 'confirmedAt', 'revokedAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminTotpEnrollment', 'revokedAt', 'UPDATE');
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCodeBatch', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'adminUserId', 'revokedAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminRecoveryCodeBatch', 'revokedAt', 'UPDATE');

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetRequest', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'securityEventId', 'replacedRequestId',
  'expiresAt', 'revokedAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetRequest', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'securityEventId', 'replacedRequestId', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
VALUES (:'c2a_writer_user', 'AdminPasswordResetRequest', 'revokedAt', 'UPDATE');

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetContext', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'passwordResetRequestId', 'adminUserId', 'tokenHash',
  'authorizationVersion', 'expiresAt', 'consumedAt', 'revokedAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetContext', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'passwordResetRequestId', 'adminUserId', 'tokenHash',
  'authorizationVersion', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPasswordResetContext', column_name, 'UPDATE'
FROM unnest(ARRAY['consumedAt', 'revokedAt']) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCase', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'subjectAdminUserId', 'creatorAdminUserId', 'approverAdminUserId',
  'state', 'stateGeneration', 'expiresAt', 'approvedAt', 'cancelledAt',
  'expiredAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCase', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'subjectAdminUserId', 'creatorAdminUserId', 'state',
  'stateGeneration', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminRecoveryCase', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'approverAdminUserId', 'state', 'stateGeneration', 'approvedAt', 'cancelledAt'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminInvitation', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'emailCanonical', 'deliveryEmailEncrypted', 'codeHash', 'proposedRole',
  'creatorAdminUserId', 'createdByAuditLogId', 'acceptedAdminUserId',
  'replacedInvitationId', 'state', 'stateGeneration', 'expiresAt',
  'acceptedAt', 'revokedAt', 'expiredAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminInvitation', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'emailCanonical', 'deliveryEmailEncrypted', 'codeHash', 'proposedRole',
  'creatorAdminUserId', 'createdByAuditLogId', 'replacedInvitationId',
  'state', 'stateGeneration', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminInvitation', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'acceptedAdminUserId', 'state', 'stateGeneration', 'acceptedAt', 'revokedAt'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminNotificationOutbox', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'purpose', 'state', 'generation', 'encryptedPayload', 'encryptionKeyId',
  'encryptionNonce', 'encryptionTag', 'aadHash', 'sourceSecurityEventId',
  'sourceAuditLogId', 'passwordResetRequestId', 'adminInvitationId',
  'replacedOutboxId', 'attemptCount', 'nextAttemptAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminNotificationOutbox', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'purpose', 'state', 'generation', 'encryptedPayload', 'encryptionKeyId',
  'encryptionNonce', 'encryptionTag', 'aadHash', 'sourceSecurityEventId',
  'sourceAuditLogId', 'passwordResetRequestId', 'adminInvitationId',
  'replacedOutboxId', 'attemptCount', 'nextAttemptAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminNotificationOutbox', column_name, 'UPDATE'
FROM unnest(ARRAY['state', 'generation', 'cancelledAt']) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshot', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'principalAdminUserId', 'operation', 'filtersDigest',
  'projectionVersion', 'entryCount', 'utf8Bytes', 'createdAt', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshot', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'principalAdminUserId', 'operation', 'filtersDigest',
  'projectionVersion', 'entryCount', 'utf8Bytes', 'expiresAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshotItem', column_name, 'SELECT'
FROM unnest(ARRAY[
  'snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt',
  'projectionJson', 'utf8Bytes'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminPaginationSnapshotItem', column_name, 'INSERT'
FROM unnest(ARRAY[
  'snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt',
  'projectionJson', 'utf8Bytes'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminC2IdempotencyRecord', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'operation', 'idempotencyKey', 'requestDigest',
  'responseCode', 'resourceType', 'resourceId', 'expiresAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminC2IdempotencyRecord', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'operation', 'idempotencyKey', 'requestDigest',
  'responseCode', 'resourceType', 'resourceId'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AdminSecurityEvent', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'adminUserId', 'eventClass', 'action', 'outcome', 'failureCode',
  'requestId', 'subjectRefHash', 'entityType', 'entityId', 'adminInvitationId'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_writer_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'adminUserId', 'subjectAdminUserId',
  'delegatedByAdminUserId', 'adminSessionId', 'adminRecoveryContextId',
  'adminPasswordResetContextId', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'causationEventId', 'causationSecurityEventId', 'adminRecoveryCaseId',
  'adminInvitationId', 'systemExecutionRefHash'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_notification_user', 'AdminNotificationOutbox', column_name, 'SELECT'
FROM unnest(ARRAY[
  'id', 'purpose', 'state', 'generation', 'encryptedPayload', 'encryptionKeyId',
  'encryptionNonce', 'encryptionTag', 'aadHash', 'sourceSecurityEventId',
  'sourceAuditLogId', 'passwordResetRequestId', 'adminInvitationId',
  'replacedOutboxId', 'claimOwnerHash', 'leaseExpiresAt', 'attemptCount',
  'nextAttemptAt', 'providerAcknowledgementHash', 'deliveredAt', 'failedAt',
  'uncertainAt', 'cancelledAt', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_notification_user', 'AdminNotificationOutbox', column_name, 'UPDATE'
FROM unnest(ARRAY[
  'state', 'generation', 'claimOwnerHash', 'leaseExpiresAt', 'attemptCount',
  'nextAttemptAt', 'providerAcknowledgementHash', 'deliveredAt', 'failedAt',
  'uncertainAt', 'cancelledAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_notification_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'systemExecutionRefHash', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'causationEventId', 'causationSecurityEventId', 'delegatedByAdminUserId', 'adminInvitationId',
  'notificationOutboxId'
]) AS column_name;
INSERT INTO expected_c2a_relation_acl VALUES
  (:'c2a_notification_user', 'AdminC2NotificationSecurityEventSource', 'SELECT'),
  (:'c2a_notification_user', 'AdminC2NotificationAuditSource', 'SELECT');

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_expiration_user', 'AdminRecoveryCase', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'state', 'stateGeneration', 'expiresAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_expiration_user', 'AdminRecoveryCase', column_name, 'UPDATE'
FROM unnest(ARRAY['state', 'stateGeneration', 'expiredAt']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_expiration_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'systemExecutionRefHash', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'adminRecoveryCaseId'
]) AS column_name;

INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminUser', column_name, 'SELECT'
FROM unnest(ARRAY['id', 'email', 'status']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminUser', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'email', 'passwordHash', 'role', 'status', 'authorizationVersion',
  'totpSecretEncrypted', 'totpEnabledAt', 'lastAcceptedTotpCounter'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminBootstrapGuard', column_name, 'SELECT'
FROM unnest(ARRAY[
  'singletonKey', 'adminUserId', 'bootstrapAuditLogId', 'createdAt'
]) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AdminBootstrapGuard', column_name, 'INSERT'
FROM unnest(ARRAY['singletonKey', 'adminUserId', 'bootstrapAuditLogId']) AS column_name;
INSERT INTO expected_c2a_column_acl
SELECT :'c2a_bootstrap_user', 'AuditLog', column_name, 'INSERT'
FROM unnest(ARRAY[
  'id', 'version', 'systemExecutionRefHash', 'eventClass', 'context', 'outcome',
  'failureCode', 'action', 'entityType', 'entityId', 'maskedBefore',
  'maskedAfter', 'reason', 'reasonCode', 'operatorReason', 'requestId',
  'bootstrapGuardId'
]) AS column_name;

DO $c2a_preflight$
DECLARE
  existing_role_count INTEGER;
  expected_role_count CONSTANT INTEGER := 4;
  mismatch_count INTEGER;
BEGIN
  SELECT count(*) INTO existing_role_count
  FROM pg_catalog.pg_roles
  WHERE rolname IN (
    pg_catalog.current_setting('kora.c2a_writer_user'),
    pg_catalog.current_setting('kora.c2a_notification_user'),
    pg_catalog.current_setting('kora.c2a_expiration_user'),
    pg_catalog.current_setting('kora.c2a_bootstrap_user')
  );

  IF existing_role_count NOT IN (0, expected_role_count) THEN
    RAISE EXCEPTION 'C2a provisioning refused a partial identity set';
  END IF;
  IF existing_role_count = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
      AND (
        NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolinherit OR rolreplication OR rolbypassrls
        OR rolconnlimit <> -1 OR rolvaliduntil IS NOT NULL OR rolconfig IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated role attributes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
       OR granted_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated role membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_shdepend AS dependency
    JOIN pg_catalog.pg_roles AS target_role
      ON target_role.oid = dependency.refobjid
    WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
      AND dependency.deptype = 'o'
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused identity-owned objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_db_role_setting AS role_setting
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = role_setting.setrole
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(routine_entry.proacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS type_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(type_entry.typacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(large_object.lomacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_parameter_acl AS parameter_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused routine, type, large-object, parameter or role-setting contamination';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry
      ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE (
        namespace_entry.nspname <> 'public'
        OR privilege.grantor <> class_entry.relowner
      )
      AND attribute_entry.attnum > 0
      AND NOT attribute_entry.attisdropped
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE (
        namespace_entry.nspname <> 'public'
        OR privilege.grantor <> class_entry.relowner
      )
      AND class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused off-public or non-owner-granted column or relation ACLs';
  END IF;

  WITH target_roles AS (
    SELECT oid, rolname::TEXT AS role_name FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ), actual_column_acl AS (
    SELECT target_role.role_name,
           class_entry.relname::TEXT AS relation_name,
           attribute_entry.attname::TEXT AS column_name,
           privilege.privilege_type::TEXT
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry
      ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND attribute_entry.attnum > 0
      AND NOT attribute_entry.attisdropped
      AND NOT privilege.is_grantable
  ), symmetric_difference AS (
    (SELECT * FROM actual_column_acl
     EXCEPT ALL
     SELECT * FROM expected_c2a_column_acl)
    UNION ALL
    (SELECT * FROM expected_c2a_column_acl
     EXCEPT ALL
     SELECT * FROM actual_column_acl)
  )
  SELECT count(*) INTO mismatch_count FROM symmetric_difference;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated column ACLs';
  END IF;

  WITH target_roles AS (
    SELECT oid, rolname::TEXT AS role_name FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ), actual_relation_acl AS (
    SELECT target_role.role_name,
           class_entry.relname::TEXT AS relation_name,
           privilege.privilege_type::TEXT
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT privilege.is_grantable
  ), symmetric_difference AS (
    (SELECT * FROM actual_relation_acl
     EXCEPT ALL
     SELECT * FROM expected_c2a_relation_acl)
    UNION ALL
    (SELECT * FROM expected_c2a_relation_acl
     EXCEPT ALL
     SELECT * FROM actual_relation_acl)
  )
  SELECT count(*) INTO mismatch_count FROM symmetric_difference;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated relation ACLs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE database_entry.datname = current_database()
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
      AND (
        privilege.privilege_type <> 'CONNECT'
        OR privilege.is_grantable
        OR privilege.grantor <> database_entry.datdba
      )
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE database_entry.datname = current_database()
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated database ACLs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
      AND (
        namespace_entry.nspname <> 'public'
        OR privilege.privilege_type <> 'USAGE'
        OR privilege.is_grantable
        OR privilege.grantor <> namespace_entry.nspowner
      )
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
    ) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated schema ACLs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl AS default_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused contaminated default ACLs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
    ) AS privilege
    WHERE database_entry.datname = current_database()
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = routine_entry.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS type_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = type_entry.typnamespace
    LEFT JOIN pg_catalog.pg_class AS composite_entry
      ON composite_entry.oid = type_entry.typrelid
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND type_entry.typisdefined
      AND type_entry.typelem = 0
      AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(large_object.lomacl, pg_catalog.acldefault('L', large_object.lomowner))
    ) AS privilege
    WHERE privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_parameter_acl AS parameter_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
    WHERE privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS default_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
    WHERE privilege.grantee = 0
  ) THEN
    RAISE EXCEPTION 'C2a provisioning refused dangerous PUBLIC or default privileges';
  END IF;
END;
$c2a_preflight$;

SELECT format('CREATE ROLE %I', :'c2a_writer_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'c2a_writer_user')
\gexec
SELECT format('CREATE ROLE %I', :'c2a_notification_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'c2a_notification_user')
\gexec
SELECT format('CREATE ROLE %I', :'c2a_expiration_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'c2a_expiration_user')
\gexec
SELECT format('CREATE ROLE %I', :'c2a_bootstrap_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'c2a_bootstrap_user')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2a_writer_user', :'c2a_writer_password'
) \gexec
SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2a_notification_user', :'c2a_notification_password'
) \gexec
SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2a_expiration_user', :'c2a_expiration_password'
) \gexec
SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2a_bootstrap_user', :'c2a_bootstrap_password'
) \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), role_name)
FROM (VALUES
  (:'c2a_writer_user'),
  (:'c2a_notification_user'),
  (:'c2a_expiration_user'),
  (:'c2a_bootstrap_user')
) AS target(role_name)
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', role_name)
FROM (VALUES
  (:'c2a_writer_user'),
  (:'c2a_notification_user'),
  (:'c2a_expiration_user'),
  (:'c2a_bootstrap_user')
) AS target(role_name)
\gexec

SELECT format(
  'GRANT %s (%s) ON TABLE public.%I TO %I',
  privilege_type,
  string_agg(format('%I', column_name), ', ' ORDER BY column_name),
  relation_name,
  role_name
)
FROM expected_c2a_column_acl
GROUP BY role_name, relation_name, privilege_type
ORDER BY role_name, relation_name, privilege_type
\gexec

SELECT format(
  'GRANT %s ON TABLE public.%I TO %I',
  privilege_type,
  relation_name,
  role_name
)
FROM expected_c2a_relation_acl
ORDER BY role_name, relation_name, privilege_type
\gexec

DO $c2a_postcondition$
DECLARE
  mismatch_count INTEGER;
BEGIN
  IF (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolinherit
      AND NOT rolreplication
      AND NOT rolbypassrls
      AND rolconnlimit = -1
      AND rolvaliduntil IS NULL
      AND rolconfig IS NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'C2a role postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry
      ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE (
        namespace_entry.nspname <> 'public'
        OR privilege.grantor <> class_entry.relowner
      )
      AND attribute_entry.attnum > 0
      AND NOT attribute_entry.attisdropped
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE (
        namespace_entry.nspname <> 'public'
        OR privilege.grantor <> class_entry.relowner
      )
      AND class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) THEN
    RAISE EXCEPTION 'C2a off-public or non-owner-granted column or relation ACL postcondition failed';
  END IF;

  WITH target_roles AS (
    SELECT oid, rolname::TEXT AS role_name FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ), actual_column_acl AS (
    SELECT target_role.role_name,
           class_entry.relname::TEXT AS relation_name,
           attribute_entry.attname::TEXT AS column_name,
           privilege.privilege_type::TEXT
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry
      ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND attribute_entry.attnum > 0
      AND NOT attribute_entry.attisdropped
      AND NOT privilege.is_grantable
  ), symmetric_difference AS (
    (SELECT * FROM actual_column_acl
     EXCEPT ALL
     SELECT * FROM expected_c2a_column_acl)
    UNION ALL
    (SELECT * FROM expected_c2a_column_acl
     EXCEPT ALL
     SELECT * FROM actual_column_acl)
  )
  SELECT count(*) INTO mismatch_count FROM symmetric_difference;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'C2a column ACL postcondition failed';
  END IF;

  WITH target_roles AS (
    SELECT oid, rolname::TEXT AS role_name FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ), actual_relation_acl AS (
    SELECT target_role.role_name,
           class_entry.relname::TEXT AS relation_name,
           privilege.privilege_type::TEXT
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE namespace_entry.nspname = 'public'
      AND class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT privilege.is_grantable
  ), symmetric_difference AS (
    (SELECT * FROM actual_relation_acl
     EXCEPT ALL
     SELECT * FROM expected_c2a_relation_acl)
    UNION ALL
    (SELECT * FROM expected_c2a_relation_acl
     EXCEPT ALL
     SELECT * FROM actual_relation_acl)
  )
  SELECT count(*) INTO mismatch_count FROM symmetric_difference;
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'C2a relation ACL postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
       OR granted_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a membership postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_shdepend AS dependency
    JOIN pg_catalog.pg_roles AS target_role
      ON target_role.oid = dependency.refobjid
    WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
      AND dependency.deptype = 'o'
      AND target_role.rolname IN (
        pg_catalog.current_setting('kora.c2a_writer_user'),
        pg_catalog.current_setting('kora.c2a_notification_user'),
        pg_catalog.current_setting('kora.c2a_expiration_user'),
        pg_catalog.current_setting('kora.c2a_bootstrap_user')
      )
  ) THEN
    RAISE EXCEPTION 'C2a ownership postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_db_role_setting AS role_setting
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = role_setting.setrole
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(routine_entry.proacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS type_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(type_entry.typacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(large_object.lomacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_parameter_acl AS parameter_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2a routine, type, large-object, parameter or role-setting postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
      AND privilege.is_grantable
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2a_writer_user'),
      pg_catalog.current_setting('kora.c2a_notification_user'),
      pg_catalog.current_setting('kora.c2a_expiration_user'),
      pg_catalog.current_setting('kora.c2a_bootstrap_user')
    )
      AND privilege.is_grantable
  ) THEN
    RAISE EXCEPTION 'C2a grant-option postcondition failed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_database AS database_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
    ) AS privilege
    WHERE database_entry.datname = current_database()
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS namespace_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = routine_entry.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS type_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = type_entry.typnamespace
    LEFT JOIN pg_catalog.pg_class AS composite_entry
      ON composite_entry.oid = type_entry.typrelid
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
    ) AS privilege
    WHERE namespace_entry.nspname <> 'information_schema'
      AND namespace_entry.nspname !~ '^pg_'
      AND type_entry.typisdefined
      AND type_entry.typelem = 0
      AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
      AND privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_largeobject_metadata AS large_object
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(large_object.lomacl, pg_catalog.acldefault('L', large_object.lomowner))
    ) AS privilege
    WHERE privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_parameter_acl AS parameter_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
    WHERE privilege.grantee = 0
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS default_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
    WHERE privilege.grantee = 0
  ) THEN
    RAISE EXCEPTION 'C2a dangerous PUBLIC or default privilege postcondition failed';
  END IF;
END;
$c2a_postcondition$;

COMMIT;
SQL
  unset PGPASSWORD
fi

if [ "$c2b_enabled" = 'true' ]; then
  export PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_password)"
  psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --quiet \
    --set=ON_ERROR_STOP=1 \
    --set=c2b_audit_api_user="$c2b_audit_api_user" \
    --set=c2b_export_worker_user="$c2b_export_worker_user" <<'SQL'
\set c2b_audit_api_password `tr -d '\r\n' <"$KORA_POSTGRES_C2B_SECRET_DIRECTORY/postgres_admin_c2b_audit_api_password"`
\set c2b_export_worker_password `tr -d '\r\n' <"$KORA_POSTGRES_C2B_SECRET_DIRECTORY/postgres_admin_c2b_export_worker_password"`
BEGIN;

SELECT pg_catalog.set_config('kora.c2b_audit_api_user', :'c2b_audit_api_user', true);
SELECT pg_catalog.set_config('kora.c2b_export_worker_user', :'c2b_export_worker_user', true);

DO $c2b_role_preflight$
BEGIN
  IF pg_catalog.current_setting('kora.c2b_audit_api_user') <> 'kora_admin_c2b_audit_api'
     OR pg_catalog.current_setting('kora.c2b_export_worker_user') <> 'kora_admin_c2b_export_worker'
     OR pg_catalog.current_setting('kora.c2b_audit_api_user') =
        pg_catalog.current_setting('kora.c2b_export_worker_user') THEN
    RAISE EXCEPTION 'C2b role identity preflight failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname IN (
      pg_catalog.current_setting('kora.c2b_audit_api_user'),
      pg_catalog.current_setting('kora.c2b_export_worker_user')
    ) OR granted_role.rolname IN (
      pg_catalog.current_setting('kora.c2b_audit_api_user'),
      pg_catalog.current_setting('kora.c2b_export_worker_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2b role membership preflight failed';
  END IF;
END;
$c2b_role_preflight$;

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2b_audit_api_user', :'c2b_audit_api_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'c2b_audit_api_user'
) \gexec
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2b_export_worker_user', :'c2b_export_worker_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'c2b_export_worker_user'
) \gexec
SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2b_audit_api_user', :'c2b_audit_api_password'
) \gexec
SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'c2b_export_worker_user', :'c2b_export_worker_password'
) \gexec

SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', role_name)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec
SELECT format('REVOKE CREATE ON SCHEMA public FROM %I', role_name)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', role_name)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec
SELECT format('REVOKE CREATE, TEMP ON DATABASE %I FROM %I', current_database(), role_name)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), role_name)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec

SELECT format(
  'GRANT EXECUTE ON FUNCTION public.kora_lock_admin_c2b_principal(TEXT, TEXT) TO %I',
  :'c2b_audit_api_user'
) \gexec

SELECT format(
  'GRANT EXECUTE ON FUNCTION public.kora_lock_admin_c2b_export_idempotency(TEXT, TEXT) TO %I',
  :'c2b_audit_api_user'
) \gexec

SELECT format(
  'GRANT EXECUTE ON FUNCTION public.kora_lock_admin_c2b_export_lifecycle(TEXT) TO %I',
  role_name
)
FROM (VALUES (:'c2b_audit_api_user'), (:'c2b_export_worker_user')) AS roles(role_name) \gexec

SELECT format(
  'GRANT SELECT (%s) ON TABLE public.%I TO %I',
  string_agg(format('%I', column_name), ', ' ORDER BY ordinal), relation_name, role_name
)
FROM (
  SELECT :'c2b_audit_api_user'::text, 'AdminC2bAuditProjectionSource'::text,
         ordinal, column_name
  FROM unnest(ARRAY[
    'version','eventId','action','eventClass','context','actorAdminUserId',
    'subjectAdminUserId','delegatedByAdminUserId','adminSessionId',
    'adminRecoveryContextId','systemExecutionRefHash','entityType','entityId',
    'maskedBefore','maskedAfter','reasonCode','requestId','causationEventId',
    'causationSecurityEventId','createdAt','outcome','failureCode',
    'legacyReasonRedacted','operatorReason','operatorReasonRedacted','outcomeProvenance'
  ]) WITH ORDINALITY AS columns(column_name, ordinal)
) AS acl(role_name, relation_name, ordinal, column_name)
GROUP BY role_name, relation_name \gexec

CREATE TEMPORARY TABLE c2b_column_grants (
  role_name TEXT NOT NULL,
  relation_name TEXT NOT NULL,
  privilege_type TEXT NOT NULL,
  column_name TEXT NOT NULL,
  ordinal INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditPaginationSnapshot', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['id','principalAdminUserId','operation','filtersDigest','projectionVersion','entryCount','utf8Bytes','createdAt','expiresAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditPaginationSnapshot', 'INSERT', column_name, ordinal
FROM unnest(ARRAY['id','principalAdminUserId','operation','filtersDigest','projectionVersion','entryCount','utf8Bytes']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditPaginationSnapshotItem', privilege_type, column_name, ordinal
FROM unnest(ARRAY['SELECT','INSERT']) AS p(privilege_type)
CROSS JOIN unnest(ARRAY['snapshotId','ordinal','resourceId','sourceCreatedAt','projectionJson','utf8Bytes']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditExportIdempotencyRecord', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['id','adminUserId','operation','idempotencyKey','requestDigest','responseCode','exportId','generation','expiresAt','createdAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditExportIdempotencyRecord', 'INSERT', column_name, ordinal
FROM unnest(ARRAY['id','adminUserId','operation','idempotencyKey','requestDigest','responseCode','exportId']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditExport', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['id','creatorAdminUserId','snapshotId','sourceAuditLogId','state','generation','objectKey','contentSha256','signatureKeyId','storageKeyId','plaintextBytes','failureCode','createdAt','readyAt','expiresAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditExport', 'INSERT', column_name, ordinal
FROM unnest(ARRAY['id','creatorAdminUserId','snapshotId','sourceAuditLogId']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditExportReadLease', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['id','exportId','exportGeneration','readerAdminUserId','ownerHash','expiresAt','maximumExpiresAt','lastHeartbeatAt','releasedAt','createdAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditExportReadLease', 'INSERT', column_name, ordinal
FROM unnest(ARRAY['id','exportId','readerAdminUserId','ownerHash']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminAuditExportReadLease', 'UPDATE', column_name, ordinal
FROM unnest(ARRAY['expiresAt','lastHeartbeatAt','releasedAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AdminSecurityEvent', 'INSERT', column_name, ordinal
FROM unnest(ARRAY['id','adminUserId','eventClass','action','outcome','failureCode','requestId','subjectRefHash','entityType','entityId']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_audit_api_user', 'AuditLog', 'INSERT', column_name, ordinal
FROM unnest(ARRAY['id','version','adminUserId','adminSessionId','eventClass','context','outcome','failureCode','action','entityType','entityId','reason','reasonCode','operatorReason','requestId','adminAuditExportId']) WITH ORDINALITY AS c(column_name, ordinal);

INSERT INTO c2b_column_grants
SELECT :'c2b_export_worker_user', 'AdminAuditPaginationSnapshot', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['id','principalAdminUserId','operation','filtersDigest','projectionVersion','entryCount','utf8Bytes','createdAt','expiresAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_export_worker_user', 'AdminAuditPaginationSnapshotItem', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['snapshotId','ordinal','resourceId','sourceCreatedAt','projectionJson','utf8Bytes']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_export_worker_user', 'AdminAuditExport', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['id','creatorAdminUserId','snapshotId','sourceAuditLogId','state','generation','attemptNumber','attemptId','claimOwnerHash','attemptStartedAt','attemptDeadline','leaseExpiresAt','nextAttemptAt','stagingObjectKey','objectKey','contentSha256','signatureKeyId','storageKeyId','plaintextBytes','encryptedBytes','failureCode','createdAt','readyAt','failedAt','expiresAt','expiredAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_export_worker_user', 'AdminAuditExport', 'UPDATE', column_name, ordinal
FROM unnest(ARRAY['state','generation','attemptNumber','attemptId','claimOwnerHash','attemptStartedAt','attemptDeadline','leaseExpiresAt','nextAttemptAt','stagingObjectKey','objectKey','contentSha256','signatureKeyId','storageKeyId','plaintextBytes','encryptedBytes','failureCode','readyAt','failedAt','expiresAt','expiredAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_export_worker_user', 'AdminAuditExportReadLease', 'SELECT', column_name, ordinal
FROM unnest(ARRAY['id','exportId','exportGeneration','readerAdminUserId','ownerHash','expiresAt','maximumExpiresAt','lastHeartbeatAt','releasedAt','createdAt']) WITH ORDINALITY AS c(column_name, ordinal);
INSERT INTO c2b_column_grants
SELECT :'c2b_export_worker_user', 'AuditLog', 'INSERT', column_name, ordinal
FROM unnest(ARRAY['id','version','delegatedByAdminUserId','eventClass','context','outcome','failureCode','action','entityType','entityId','reason','reasonCode','requestId','causationEventId','systemExecutionRefHash','adminAuditExportId']) WITH ORDINALITY AS c(column_name, ordinal);

SELECT format(
  'GRANT %s (%s) ON TABLE public.%I TO %I',
  privilege_type,
  string_agg(format('%I', column_name), ', ' ORDER BY ordinal),
  relation_name,
  role_name
)
FROM c2b_column_grants
GROUP BY role_name, relation_name, privilege_type
ORDER BY role_name, relation_name, privilege_type \gexec

SELECT format('GRANT DELETE ON TABLE public.%I TO %I', relation_name, :'c2b_export_worker_user')
FROM (VALUES ('AdminAuditPaginationSnapshot'), ('AdminAuditExportReadLease')) AS relations(relation_name) \gexec

DO $c2b_postcondition$
BEGIN
  IF (
    SELECT count(*) FROM pg_catalog.pg_roles
    WHERE rolname IN (
      pg_catalog.current_setting('kora.c2b_audit_api_user'),
      pg_catalog.current_setting('kora.c2b_export_worker_user')
    )
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
      AND rolconfig IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'C2b role postcondition failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname IN (
      pg_catalog.current_setting('kora.c2b_audit_api_user'),
      pg_catalog.current_setting('kora.c2b_export_worker_user')
    ) OR granted_role.rolname IN (
      pg_catalog.current_setting('kora.c2b_audit_api_user'),
      pg_catalog.current_setting('kora.c2b_export_worker_user')
    )
  ) THEN
    RAISE EXCEPTION 'C2b membership postcondition failed';
  END IF;
  IF pg_catalog.has_database_privilege(
       pg_catalog.current_setting('kora.c2b_audit_api_user'), current_database(), 'CREATE')
     OR pg_catalog.has_database_privilege(
       pg_catalog.current_setting('kora.c2b_audit_api_user'), current_database(), 'TEMP')
     OR pg_catalog.has_database_privilege(
       pg_catalog.current_setting('kora.c2b_export_worker_user'), current_database(), 'CREATE')
     OR pg_catalog.has_database_privilege(
       pg_catalog.current_setting('kora.c2b_export_worker_user'), current_database(), 'TEMP')
     OR pg_catalog.has_schema_privilege(
       pg_catalog.current_setting('kora.c2b_audit_api_user'), 'public', 'CREATE')
     OR pg_catalog.has_schema_privilege(
       pg_catalog.current_setting('kora.c2b_export_worker_user'), 'public', 'CREATE') THEN
    RAISE EXCEPTION 'C2b database or schema capability postcondition failed';
  END IF;
  IF pg_catalog.has_table_privilege(
       pg_catalog.current_setting('kora.c2b_audit_api_user'), 'public."AuditLog"', 'SELECT')
     OR pg_catalog.has_table_privilege(
       pg_catalog.current_setting('kora.c2b_export_worker_user'), 'public."AuditLog"', 'SELECT')
     OR pg_catalog.has_table_privilege(
       pg_catalog.current_setting('kora.c2b_audit_api_user'), 'public."AdminPaginationSnapshot"', 'SELECT')
     OR pg_catalog.has_table_privilege(
       pg_catalog.current_setting('kora.c2b_export_worker_user'), 'public."AdminC2IdempotencyRecord"', 'SELECT') THEN
    RAISE EXCEPTION 'C2b contamination or raw-audit postcondition failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS attribute_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2b_audit_api_user'),
      pg_catalog.current_setting('kora.c2b_export_worker_user')
    )
      AND privilege.is_grantable
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS class_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
    JOIN pg_catalog.pg_roles AS target_role ON target_role.oid = privilege.grantee
    WHERE target_role.rolname IN (
      pg_catalog.current_setting('kora.c2b_audit_api_user'),
      pg_catalog.current_setting('kora.c2b_export_worker_user')
    )
      AND privilege.is_grantable
  ) THEN
    RAISE EXCEPTION 'C2b grant-option postcondition failed';
  END IF;
END;
$c2b_postcondition$;

COMMIT;
SQL
  unset PGPASSWORD
fi

if [ "$c2a_enabled" = 'true' ] && [ "$c2b_enabled" = 'true' ]; then
  echo 'PostgreSQL reader, C1 writer, four C2a and two C2b boundaries provisioned and verified.'
elif [ "$c2a_enabled" = 'true' ]; then
  echo 'PostgreSQL reader, C1 writer and four C2a boundaries provisioned and verified; C2b remains disabled.'
elif [ "$c2b_enabled" = 'true' ]; then
  echo 'PostgreSQL reader, C1 writer and two C2b boundaries provisioned and verified; C2a remains disabled.'
else
  echo 'PostgreSQL reader and admin writer boundaries provisioned and verified; C2a/C2b remain disabled.'
fi
