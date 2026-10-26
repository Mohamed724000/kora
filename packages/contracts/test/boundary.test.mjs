import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the contract boundary exports only the generated contract surface', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

  assert.equal(source.trim(), "export * from './generated/audio-pilot.js';");
});

test('the generated boundary materializes all 27 admin-security operations', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const block = /export const adminSecurityOperations = \[([\s\S]*?)\n\] as const;/.exec(
    source,
  )?.[1];

  assert.ok(block);
  assert.equal((block.match(/operationId:/g) ?? []).length, 27);
  assert.equal((block.match(/deliverySlice: 'S1\.2-03C1'/g) ?? []).length, 12);
  assert.equal((block.match(/deliverySlice: 'S1\.2-03C2'/g) ?? []).length, 15);
  assert.match(block, /operationId: 'deliverAdminTotpEnrollmentQr'/);
  assert.match(block, /authorizationClass: 'PREAUTH'/);
  assert.match(
    block,
    /securityRequirement: \['adminPreAuthCookie', 'adminCsrfCookie', 'adminCsrfHeader'\]/,
  );
  assert.match(block, /stepUpRequired: true/);
  assert.match(block, /stepUpMode: 'INLINE_TOTP_REQUEST_BODY'/);
  assert.match(block, /stepUpPurpose: 'RECOVERY_CODE_ROTATION'/);
  assert.match(block, /priorStepUpPolicy: 'NOT_REQUIRED_AND_DOES_NOT_SUBSTITUTE_FOR_BODY_TOTP'/);
  assert.match(block, /totpCounterPolicy: 'GLOBAL_PER_ADMIN_USER_REJECT_REUSE'/);
  assert.match(block, /mediaType: 'image\/png'/);
  assert.match(block, /schema: 'AdminRoleChangeRequest'/);
  assert.match(block, /auditSink: 'ADMIN_SECURITY_EVENT'/);
  assert.match(block, /auditSink: 'AUDIT_LOG'/);
  assert.match(block, /failureAuditSink: 'ADMIN_SECURITY_EVENT'/);
  assert.match(block, /failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT'/);
  assert.match(
    block,
    /AUDIT_LOG_ADMIN_RECOVERY_IF_SERVER_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT/,
  );
  assert.match(
    block,
    /SERVER_VERIFIED_MFA_RECOVERY_OWNERSHIP_ACTOR_BINDING_STATE_AND_EXPIRY_CLIENT_INPUT_NEVER_SUFFICIENT/,
  );
  assert.match(block, /rateLimitProfile: 'REFRESH'/);
  assert.match(block, /fetchMetadataPolicy: 'REJECT_CROSS_SITE_REQUIRE_SAME_ORIGIN'/);
  assert.match(
    block,
    /publicFailureTiming: 'UNKNOWN_EXPIRED_CONSUMED_REVOKED_OR_ACCOUNT_STATE_COMPARABLE'/,
  );
  assert.match(block, /signatureAlgorithm: 'EdDSA'/);
  assert.match(block, /signaturePath: 'manifest\.sig'/);
  assert.match(block, /payload: 'RFC8785_JCS_CANONICAL_MANIFEST_UTF8_BYTES'/);
  assert.match(block, /profile: 'KORA_ADMIN_AUDIT_EXPORT_MANIFEST_V2'/);
  assert.match(block, /manifestVersion: 2/);
  assert.match(block, /expirationRule: 'READY_PLUS_24_HOURS'/);
  assert.match(block, /createdAtSemantics: 'EXPORT_REQUEST_CREATED_AT'/);
  assert.match(block, /READY_AT_AND_EXPIRES_AT_NOT_INCLUDED_OR_SIGNED/);
  assert.match(
    block,
    /manifestFields: \['createdAt', 'entries', 'expirationRule', 'exportId', 'version'\]/,
  );
  assert.doesNotMatch(block, /CANONICAL_MANIFEST_BINDS_EXPORT_ID_CREATED_AT_EXPIRES_AT/);
  assert.match(block, /protectedHeader: 'EXACTLY_alg_EdDSA_AND_kid_SIGNATURE_KEY_ID'/);
  assert.match(block, /payloadEncoding: 'BASE64URL_NO_PADDING'/);
  assert.match(block, /unencodedPayload: false/);
  assert.equal((block.match(/errorCode: 'SERVICE_UNAVAILABLE'/g) ?? []).length, 27);
  assert.match(
    block,
    /signatureInput:\s*'ASCII\(BASE64URL_NO_PADDING\(PROTECTED_HEADER_UTF8\)\.BASE64URL_NO_PADDING\(PAYLOAD\)\)'/,
  );
  assert.match(
    block,
    /detachedSerialization:\s*'BASE64URL_NO_PADDING\(PROTECTED_HEADER_UTF8\)\.\.BASE64URL_NO_PADDING\(SIGNATURE\)'/,
  );
  assert.doesNotMatch(block, /RFC8785_CANONICAL_UTF8_BYTES_OF_MANIFEST_JSON/);
  assert.match(
    block,
    /payloadEntrySet: 'EXACTLY_ALL_ZIP_ENTRIES_EXCEPT_MANIFEST_JSON_AND_MANIFEST_SIG'/,
  );
  assert.match(block, /rejectUnlistedEntries: true/);
  assert.match(block, /name: 'X-Kora-CSRF'/);
  assert.match(block, /name: 'actorAdminUserId'/);
  assert.doesNotMatch(block, /totpSeed|provisioningUri|encryptionKeyId|signedUrl/i);
});

test('the generated boundary materializes the four C1 CTO arbitration policies', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const policies = /export const adminC1ContractPolicies = \{([\s\S]*?)\n\} as const;/.exec(
    source,
  )?.[1];

  assert.ok(policies);
  assert.match(policies, /provenContextSink: 'AUDIT_LOG_ADMIN_RECOVERY'/);
  assert.match(policies, /clientEvidenceNeverSufficient:/);
  assert.match(policies, /'COOKIE'/);
  assert.match(policies, /'SELECTOR'/);
  assert.match(policies, /'IDENTIFIER'/);
  assert.match(policies, /stepUpMode: 'INLINE_TOTP_REQUEST_BODY'/);
  assert.match(policies, /secondOtpRequired: false/);
  assert.match(policies, /overflowPolicy: 'ATOMIC_LRU_EVICTION'/);
  assert.match(policies, /maximumActiveFamilies: 3/);
  assert.match(policies, /refreshCreatesFamily: false/);
  assert.match(policies, /httpStatus: 503/);
  assert.match(policies, /errorCode: 'SERVICE_UNAVAILABLE'/);
  assert.match(policies, /dependencyDisclosure: 'FORBIDDEN'/);
  assert.match(policies, /NO_SUCCESS_OR_SECRET_NO_BLIND_AUTOMATIC_RETRY/);
});

test('the generated boundary materializes the complete C2-P0 policy', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const policies = /export const adminC2ContractPolicies = \{([\s\S]*?)\n\} as const;/.exec(
    source,
  )?.[1];

  assert.ok(policies);
  assert.equal((policies.match(/stepUpApplicability:/g) ?? []).length, 15);
  assert.match(policies, /proofPurpose: 'PASSWORD_RESET'/);
  assert.match(policies, /forbiddenProofPurpose: 'MFA_RECOVERY'/);
  assert.match(policies, /stepUpPurpose: 'RECOVERY_APPROVAL'/);
  assert.match(policies, /stepUpPurpose: 'AUDIT_EXPORT'/);
  assert.match(policies, /defaultLimit: 25/);
  assert.match(policies, /maximumEntries: 10000/);
  assert.match(policies, /maximumUncompressedUtf8Bytes: 26214400/);
  assert.match(policies, /truncation: 'FORBIDDEN'/);
  assert.match(policies, /entrySchema: 'AdminAuditLogEntry'/);
  assert.match(policies, /v1WithAnyTypedFilter: 'NEVER_MATCH'/);
  assert.match(policies, /exclusiveVersions: \[1, 2, 3\]/);
  assert.match(policies, /newC2Values: \['SUCCESS', 'REJECTED'\]/);
  assert.match(policies, /outcome: 'UNKNOWN'/);
  assert.match(policies, /provenance: 'HISTORICAL_UNKNOWN'/);
  assert.match(policies, /listAndExport: 'ALWAYS_NULL_WITH_OPERATOR_REASON_REDACTED_TRUE'/);
  assert.match(
    policies,
    /STATE_PROCESSING_OWNER_CURRENT_NEXT_ATTEMPT_AT_NULL_LEASE_EXPIRED_ATTEMPTS_REMAIN_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE/,
  );
  assert.match(
    policies,
    /IF_NEXT_ATTEMPT_AT_NOT_NULL_FOLLOW_SCHEDULE_ELSE_IF_NOW_GTE_IMMUTABLE_ATTEMPT_DEADLINE_USE_ATTEMPT_DEADLINE_WATCHDOG/,
  );
  assert.match(policies, /INCREMENT_GENERATION_AND_ATTEMPT_NUMBER_REPLACE_ATTEMPT_ID/);
  assert.match(policies, /IMMUTABLE_ATTEMPT_DEADLINE_NOW_PLUS_600_SECONDS/);
  assert.match(policies, /NEXT_ATTEMPT_AT_NULL_AND_NOW_BEFORE_IMMUTABLE_ATTEMPT_DEADLINE/);
  assert.doesNotMatch(policies, /serverProof:/);
  assert.doesNotMatch(policies, /failureBeforeProof:|failureAfterProof:/);
  assert.match(policies, /POST_PROOF_BUSINESS_CHECKS/);
  assert.match(policies, /ADMIN_SECURITY_EVENT_FAILED_IF_DURABILITY_CONFIRMED/);
  assert.match(policies, /AUDIT_LOG_REJECTED_IF_DURABILITY_CONFIRMED/);
  assert.match(policies, /failureCodeByTrigger:/);
  assert.match(policies, /PASSWORD_RESET_PURPOSE_OR_SUBJECT_NOT_AUTHORIZED: 'FORBIDDEN'/);
  assert.match(
    policies,
    /ADMIN_SECURITY_EVENT_AND_NONE_SINK_OPERATIONS_MUST_NOT_CREATE_AUDIT_LOG_V3/,
  );
  assert.match(policies, /transactionalSystemTransitions:/);
  assert.match(policies, /SAME_POSTGRESQL_TRANSACTION_BEFORE_RESPONSE/);
  assert.match(policies, /DISTINCT_SUPERSEDING_AND_CANCELLED_CASE_IDS/);
  assert.match(policies, /fencingToken:/);
  assert.match(policies, /distributedTransaction: false/);
  assert.match(policies, /READY_MATCHING_GENERATION/);
  assert.match(policies, /FAILED_MATCHING_GENERATION/);
  assert.match(policies, /PROCESSING_SAME_FENCE/);
  assert.match(policies, /STALE_FENCE_OR_DIFFERENT_GENERATION/);
  assert.match(policies, /STOP_NO_MUTATION_PUBLICATION_OR_AUDIT_NEVER_TOUCH_CURRENT_OBJECT/);
  assert.match(policies, /AUDIT_DOWNLOAD_COMMIT/);
  assert.match(policies, /BEGIN_STREAM/);
  assert.match(policies, /CREATE_FIRST_TOTP_ENROLLMENT_PREAUTH_10_MINUTES/);
  assert.match(policies, /runtimeSymbol: 'AdminAuthService\.login'/);
  assert.match(policies, /cookieDelivery: 'UNKNOWN'/);
  assert.match(policies, /usablePreauthCookie: 'UNKNOWN'/);
  assert.match(policies, /rawLegacyReason:/);
  assert.match(policies, /OMITTED_AT_POSTGRESQL_COLUMN_ALLOWLIST_NEVER_READ_NEVER_DELIVERED/);
  assert.match(policies, /source: 'SERVER_FIXED_REJECTION'/);
  assert.match(policies, /reasonCode: 'SECURITY_RESPONSE'/);
  assert.match(policies, /systemOrigin: 'PUBLIC_PASSWORD_RESET'/);
  assert.match(policies, /systemOrigin: 'ADMIN_DELEGATION'/);
  assert.match(policies, /systemOrigin: 'AUTONOMOUS'/);
  assert.match(policies, /input: 'EXACT_FINAL_ZIP_ARTIFACT_BYTES'/);
  assert.match(policies, /EXACT_DOWNLOAD_RESPONSE_BODY_BYTES/);
  assert.match(policies, /contentSha256_FORBIDDEN_INSIDE_ZIP_AND_MANIFEST/);
  assert.match(policies, /typedSecurityEventField: 'causationSecurityEventId'/);
  assert.match(policies, /sourceRecordType: 'AdminSecurityEvent'/);
  assert.match(policies, /workerAuditOrigin: 'PUBLIC_PASSWORD_RESET'/);
  assert.match(policies, /autonomousReclassification: 'FORBIDDEN'/);
  assert.match(policies, /operationErrors:/);
  assert.match(policies, /requestAdminPasswordReset: \[/);
  assert.match(policies, /ADMIN_RECOVERY_INVALID/);
  assert.match(policies, /LAST_SUPER_ADMIN_PROTECTED/);
  assert.match(policies, /errorStatuses:/);
  assert.match(policies, /SERVICE_UNAVAILABLE: 503/);
  assert.match(policies, /rollbackBeforeReuse: 'REQUIRED_CONFIRMATION_AND_IDLE_USABLE_CLIENT'/);
  assert.match(policies, /transactionClientDisposal:/);
  assert.match(policies, /appliesTo: 'ALL_FUTURE_C2_WRITERS'/);
  assert.match(policies, /callbackAllowedWhen: 'BEGIN_CONFIRMED'/);
  assert.match(policies, /unboundedAcquisitionOrCallback: 'FORBIDDEN'/);
  assert.match(policies, /deadlineMilliseconds: 2000/);
  assert.match(policies, /acknowledgementDeadlineMilliseconds: 2000/);
  assert.match(policies, /POST_COMMAND_READY_FOR_QUERY_IDLE_SAME_CLIENT/);
  assert.match(policies, /reusableReadyForQueryStates: \['I'\]/);
  assert.match(policies, /discardReadyForQueryStates: \['T', 'E', 'UNKNOWN'\]/);
  assert.match(policies, /totalCardinality: 'EXACTLY_ONCE'/);
  assert.match(policies, /PUBLIC_POOL_CLIENT_DESTROY_OR_EQUIVALENT_PHYSICAL_CONNECTION_DISCARD/);
  assert.match(policies, /postCommitAttemptConnectionLoss: 'COMMIT_UNKNOWN_EXCLUSIVELY'/);
  assert.match(policies, /NO_RECLASSIFICATION_NO_RESPONSE_NO_RELEASE_NO_REPLAY/);
  assert.match(policies, /ANY_FAILURE_OR_ABORT_AFTER_BEGIN_CONFIRMED_BEFORE_COMMIT_ATTEMPT/);
  assert.match(policies, /SUCCESS_NOT_RECLASSIFIED_BY_CLIENT_DISPOSITION/);
  assert.match(policies, /CONFIRMED_NOT_COMMITTED_NEUTRAL_503/);
  assert.match(policies, /defaultForAcquiredClientNotMeetingReusablePredicate/);
  assert.match(policies, /name: 'CALLBACK_FAILED_ROLLBACK_CONFIRMED'/);
  assert.match(policies, /name: 'ROLLBACK_REJECTED'/);
  assert.match(policies, /name: 'ROLLBACK_SUSPENDED'/);
  assert.match(policies, /name: 'CONNECTION_LOST'/);
  assert.match(policies, /name: 'COMMIT_CONFIRMED'/);
  assert.match(policies, /name: 'COMMIT_UNKNOWN'/);
  assert.match(policies, /FORBIDDEN_NO_MUTATION_REPLAY/);
  assert.match(policies, /notificationProvider: 'NOT_QUALIFIED'/);
  assert.match(policies, /runtimeImplemented: false/);
  assert.doesNotMatch(policies, /signedUrl: true|passwordSent: true|fullHashSent: true/i);
});

test('audit evidence is generated as a strict discriminated execution-context union', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const audit = /export type AdminAuditLogEntry =([\s\S]*?)export type AdminAuditLogPage/.exec(
    source,
  )?.[1];
  const auditV3 =
    /export type AdminAuditLogEntryV3 =([\s\S]*?)export type AdminInvitationAcceptedPreAuthEnvelope/.exec(
      source,
    )?.[1];

  assert.ok(audit);
  assert.ok(auditV3);
  assert.match(audit, /AdminAuditLogEntryV1 \| AdminAuditLogEntryV2 \| AdminAuditLogEntryV3/);
  assert.match(audit, /export type AdminAuditLogEntryV1/);
  assert.match(audit, /readonly version: 1;/);
  assert.match(audit, /readonly legacyReasonRedacted: true;/);
  assert.match(audit, /export type AdminAuditLogEntryV2/);
  assert.match(audit, /readonly version: 2;/);
  assert.match(auditV3, /readonly version: 3;/);
  assert.match(audit, /readonly outcome: 'UNKNOWN';/);
  assert.match(auditV3, /readonly outcome: 'SUCCESS';/);
  assert.match(auditV3, /readonly outcome: 'REJECTED';/);
  assert.match(auditV3, /readonly failureCode: null;/);
  assert.match(auditV3, /readonly outcomeProvenance: 'EXPLICIT_C2';/);
  assert.match(audit, /readonly operatorReason: null;/);
  assert.match(audit, /readonly operatorReasonRedacted: true;/);
  assert.match(audit, /readonly context: 'ADMIN_SESSION';/);
  assert.match(audit, /readonly context: 'ADMIN_RECOVERY';/);
  assert.match(audit, /readonly context: 'SYSTEM';/);
  assert.match(audit, /readonly actorAdminUserId: string;/);
  assert.match(audit, /readonly actorAdminUserId: null;/);
  assert.match(audit, /readonly adminSessionId: string;/);
  assert.match(audit, /readonly adminRecoveryContextId: string;/);
  assert.match(audit, /readonly systemExecutionRefHash: string;/);
  assert.match(audit, /readonly causationEventId: null;/);
  assert.match(audit, /readonly causationEventId: string;/);
  assert.match(audit, /readonly causationSecurityEventId: null;/);
  assert.match(audit, /readonly causationSecurityEventId: string;/);
  assert.match(audit, /readonly delegatedByAdminUserId: null;/);
  assert.match(audit, /readonly delegatedByAdminUserId: string;/);
  assert.match(audit, /readonly entityType: string;/);
  assert.match(audit, /readonly maskedBefore:/);
  assert.match(audit, /readonly requestId: string;/);
  assert.doesNotMatch(audit, /readonly legacyReason:/);
});

test('audit export types distinguish entry filters from the creation reason', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const request = /export type AdminAuditExportRequest = \{([\s\S]*?)\n\};/.exec(source)?.[1];

  assert.ok(request);
  assert.match(request, /readonly auditVersion\?: 1 \| 2 \| 3;/);
  assert.match(request, /readonly auditEventClass\?:/);
  assert.match(request, /readonly auditContext\?: AdminAuditContext;/);
  assert.match(request, /readonly auditReasonCode\?: AdminReasonCode;/);
  assert.match(request, /readonly reasonCode: AdminReasonCode;/);
});

test('generated export and invitation boundaries preserve R4 failure-state and pre-auth causality', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const auditExport =
    /export type AdminAuditExport =([\s\S]*?)export type AdminAuditExportEnvelope/.exec(
      source,
    )?.[1];
  const invitation = /export type AdminInvitationAcceptedPreAuthEnvelope = \{([\s\S]*?)\n\};/.exec(
    source,
  )?.[1];

  assert.ok(auditExport);
  assert.ok(invitation);
  assert.match(auditExport, /readonly state: 'FAILED';/);
  assert.match(auditExport, /'PROJECTION_BUDGET_EXCEEDED'/);
  assert.match(auditExport, /readonly state: 'PENDING' \| 'PROCESSING';/);
  assert.match(auditExport, /readonly state: 'READY' \| 'EXPIRED';/);
  assert.match(invitation, /readonly nextStep: 'FIRST_TOTP_ENROLLMENT';/);
  assert.doesNotMatch(invitation, /MFA_RECOVERY|AdminSession/);
});

test('admin recovery-code types expose selector and verifier but no stored hash', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const request = /export type AdminRecoveryCodeVerificationRequest = \{([\s\S]*?)\n\};/.exec(
    source,
  )?.[1];
  const delivery = /export type AdminRecoveryCodes = \{([\s\S]*?)\n\};/.exec(source)?.[1];

  assert.ok(request);
  assert.ok(delivery);
  assert.match(request, /selector: string/);
  assert.match(request, /verifier: string/);
  assert.match(delivery, /codes: ReadonlyArray<AdminRecoveryCode>/);
  assert.doesNotMatch(`${request}${delivery}`, /hash|salt|argon/i);
});

test('the generated boundary exposes readiness metadata without private media locations', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const publicSurface = source.replace(
    /export const adminC2ContractPolicies = \{[\s\S]*?\n\} as const;/,
    '',
  );

  assert.match(source, /PaymentProvider = 'SANDBOX_NEUTRAL'/);
  assert.match(source, /readonly descriptor: string/);
  assert.match(source, /readonly cover: PublicCoverImage/);
  assert.match(source, /readonly settledSalesCount: number/);
  assert.match(source, /readonly representation: 'CONTROLLED_API'/);
  assert.match(source, /readonly createdByAdminId: Identifier/);
  assert.match(source, /export type MuxMediaWebhookRequest/);
  assert.doesNotMatch(
    publicSurface,
    /\b\w*(?:Url|Uri)\b|\b(?:r2|storageObjectKey|sourceObjectKey|originKey|mediaLocator|privateProviderAssetRef|providerAssetId|muxAssetId|muxPlaybackId)\b/i,
  );
});

test('catalog provenance is response-only in the generated boundary', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const artistRequest = /export type UpsertArtistRequest = \{([\s\S]*?)\n\};/.exec(source)?.[1];
  const audioRequest = /export type UpsertAudioContentRequest = \{([\s\S]*?)\n\};/.exec(
    source,
  )?.[1];

  assert.ok(artistRequest);
  assert.ok(audioRequest);
  assert.doesNotMatch(artistRequest, /createdByAdminId/);
  assert.doesNotMatch(audioRequest, /createdByAdminId/);
});
