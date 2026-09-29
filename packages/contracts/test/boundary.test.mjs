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
  assert.match(block, /mediaType: 'image\/png'/);
  assert.match(block, /schema: 'AdminRoleChangeRequest'/);
  assert.match(block, /auditSink: 'ADMIN_SECURITY_EVENT'/);
  assert.match(block, /auditSink: 'AUDIT_LOG'/);
  assert.match(block, /failureAuditSink: 'ADMIN_SECURITY_EVENT'/);
  assert.match(block, /failureAuditSink: 'AUDIT_LOG_IF_CONTEXT_PROVEN_ELSE_ADMIN_SECURITY_EVENT'/);
  assert.match(block, /rateLimitProfile: 'REFRESH'/);
  assert.match(block, /fetchMetadataPolicy: 'REJECT_CROSS_SITE_REQUIRE_SAME_ORIGIN'/);
  assert.match(
    block,
    /publicFailureTiming: 'UNKNOWN_EXPIRED_CONSUMED_REVOKED_OR_ACCOUNT_STATE_COMPARABLE'/,
  );
  assert.match(block, /signatureAlgorithm: 'EdDSA'/);
  assert.match(block, /signaturePath: 'manifest\.sig'/);
  assert.match(
    block,
    /payloadEntrySet: 'EXACTLY_ALL_ZIP_ENTRIES_EXCEPT_MANIFEST_JSON_AND_MANIFEST_SIG'/,
  );
  assert.match(block, /rejectUnlistedEntries: true/);
  assert.match(block, /name: 'X-Kora-CSRF'/);
  assert.match(block, /name: 'actorAdminUserId'/);
  assert.doesNotMatch(block, /totpSeed|provisioningUri|encryptionKeyId|signedUrl/i);
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

  assert.match(source, /PaymentProvider = 'SANDBOX_NEUTRAL'/);
  assert.match(source, /readonly descriptor: string/);
  assert.match(source, /readonly cover: PublicCoverImage/);
  assert.match(source, /readonly settledSalesCount: number/);
  assert.match(source, /readonly representation: 'CONTROLLED_API'/);
  assert.match(source, /readonly createdByAdminId: Identifier/);
  assert.match(source, /export type MuxMediaWebhookRequest/);
  assert.doesNotMatch(
    source,
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
