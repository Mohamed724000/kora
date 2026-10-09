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
  assert.match(policies, /notificationProvider: 'NOT_QUALIFIED'/);
  assert.match(policies, /runtimeImplemented: false/);
  assert.doesNotMatch(policies, /signedUrl: true|passwordSent: true|fullHashSent: true/i);
});

test('audit evidence is generated as a strict discriminated execution-context union', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const audit = /export type AdminAuditLogEntry =([\s\S]*?)export type AdminAuditLogPage/.exec(
    source,
  )?.[1];

  assert.ok(audit);
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
  assert.match(audit, /readonly delegatedByAdminUserId: null;/);
  assert.match(audit, /readonly delegatedByAdminUserId: string;/);
  assert.match(audit, /readonly entityType: string;/);
  assert.match(audit, /readonly maskedBefore:/);
  assert.match(audit, /readonly requestId: string;/);
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
