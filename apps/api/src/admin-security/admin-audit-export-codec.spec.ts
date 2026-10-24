import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';
import {
  decryptAdminAuditExport,
  encryptAdminAuditExport,
  TestAdminAuditExportStorageKeyring,
} from './admin-audit-export-keyring';
import {
  ADMIN_AUDIT_EXPORT_MAX_PAYLOAD_BYTES,
  adminAuditExportNdjsonByteLength,
  AdminAuditExportCodec,
} from './admin-audit-export-codec';
import { TestEd25519AdminAuditExportSigningPort } from './admin-audit-export-signing.port';
import type { AdminAuditLogEntry } from './admin-audit.types';

const canonicalBytes = (value: unknown): Buffer => {
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new TypeError('fixture is not canonicalizable');
  return Buffer.from(serialized, 'utf8');
};

async function buildSignedFixture(manifest: Record<string, unknown>): Promise<{
  bytes: Buffer;
  contentSha256: string;
  signatureKeyId: string;
}> {
  const signing = new TestEd25519AdminAuditExportSigningPort();
  const signatureKeyId = await signing.activeKeyId();
  const payload = Buffer.from(`${canonicalize(entry)}\n`, 'utf8');
  const manifestBytes = canonicalBytes(manifest);
  const protectedPart = canonicalBytes({ alg: 'EdDSA', kid: signatureKeyId }).toString('base64url');
  const signingInput = Buffer.from(
    `${protectedPart}.${manifestBytes.toString('base64url')}`,
    'ascii',
  );
  const signature = await signing.sign(signatureKeyId, signingInput);
  const detachedJws = Buffer.from(
    `${protectedPart}..${Buffer.from(signature).toString('base64url')}`,
  );
  const zip = new ZipFile();
  const options = { compress: false, mode: 0o100644, mtime: new Date('1980-01-01T00:00:00.000Z') };
  zip.addBuffer(payload, 'audit-log.ndjson', options);
  zip.addBuffer(manifestBytes, 'manifest.json', options);
  zip.addBuffer(detachedJws, 'manifest.sig', options);
  const chunks: Buffer[] = [];
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    zip.outputStream.once('error', reject);
    zip.outputStream.once('end', () => resolve(Buffer.concat(chunks)));
    zip.end({ comment: '', forceZip64Format: false });
  });
  return {
    bytes,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
    signatureKeyId,
  };
}

const entry: AdminAuditLogEntry = {
  action: 'changeAdminUserRole',
  actorAdminUserId: '00000000-0000-4000-8000-000000000001',
  adminRecoveryContextId: null,
  adminSessionId: '00000000-0000-4000-8000-000000000002',
  causationEventId: null,
  causationSecurityEventId: null,
  context: 'ADMIN_SESSION',
  createdAt: '2026-10-23T00:00:00.000Z',
  delegatedByAdminUserId: null,
  entityId: '00000000-0000-4000-8000-000000000003',
  entityType: 'ADMIN_USER',
  eventClass: 'BUSINESS',
  eventId: '00000000-0000-4000-8000-000000000004',
  failureCode: null,
  maskedAfter: { role: 'SUPPORT' },
  maskedBefore: { role: 'CONTENT_EDITOR' },
  operatorReason: null,
  operatorReasonRedacted: true,
  outcome: 'SUCCESS',
  outcomeProvenance: 'EXPLICIT_C2',
  reasonCode: 'ROLE_ADMINISTRATION',
  requestId: 'request-0001',
  subjectAdminUserId: '00000000-0000-4000-8000-000000000003',
  systemExecutionRefHash: null,
  version: 3,
};

describe('AdminAuditExportCodec', () => {
  it('utilise RFC 8785 plutôt que JSON.stringify', () => {
    expect(canonicalize({ b: 1, a: '€', n: 1e30 })).toBe('{"a":"€","b":1,"n":1e+30}');
    expect(() => canonicalize({ value: Number.NaN })).toThrow('NaN is not allowed');
  });

  it('compte les octets NDJSON canoniques avec chaque LF à la borne exacte', () => {
    const withPayload = (payload: string): AdminAuditLogEntry => ({
      ...entry,
      maskedAfter: { payload },
      maskedBefore: null,
    });
    const emptyPayloadBytes = adminAuditExportNdjsonByteLength([withPayload('')]);
    const exactPayload = 'x'.repeat(ADMIN_AUDIT_EXPORT_MAX_PAYLOAD_BYTES - emptyPayloadBytes);
    expect(adminAuditExportNdjsonByteLength([withPayload(exactPayload)])).toBe(
      ADMIN_AUDIT_EXPORT_MAX_PAYLOAD_BYTES,
    );
    expect(adminAuditExportNdjsonByteLength([withPayload(`${exactPayload}x`)])).toBe(
      ADMIN_AUDIT_EXPORT_MAX_PAYLOAD_BYTES + 1,
    );
  });

  it('produit un ZIP STORE déterministe avec les trois entrées ordonnées', async () => {
    const signing = new TestEd25519AdminAuditExportSigningPort();
    let signedInput: Buffer | undefined;
    const codec = new AdminAuditExportCodec({
      activeKeyId: (signal) => signing.activeKeyId(signal),
      sign: async (keyId, value, signal) => {
        signedInput = Buffer.from(value);
        return signing.sign(keyId, value, signal);
      },
      verify: (keyId, value, signature, signal) => signing.verify(keyId, value, signature, signal),
    });
    const input = {
      createdAt: '2026-10-23T00:00:00.000Z',
      entries: [entry],
      exportId: '00000000-0000-4000-8000-000000000005',
    } as const;
    const first = await codec.build(input);
    const second = await codec.build(input);

    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.contentSha256).toBe(createHash('sha256').update(first.bytes).digest('hex'));
    const binary = first.bytes.toString('latin1');
    const names = ['audit-log.ndjson', 'manifest.json', 'manifest.sig'];
    expect(names.map((name) => binary.indexOf(name))).toEqual(
      expect.arrayContaining(names.map(() => expect.any(Number))),
    );
    expect(binary.indexOf(names[0]!)).toBeLessThan(binary.indexOf(names[1]!));
    expect(binary.indexOf(names[1]!)).toBeLessThan(binary.indexOf(names[2]!));
    expect(binary).not.toContain('contentSha256');
    expect(binary).toContain('"expirationRule":"READY_PLUS_24_HOURS"');
    expect(binary).toContain('"version":2');
    expect(binary).not.toContain('"readyAt"');
    expect(binary).not.toContain('"expiresAt"');
    const encodedManifest = signedInput?.toString('ascii').split('.')[1];
    expect(encodedManifest).toBeDefined();
    expect(JSON.parse(Buffer.from(encodedManifest!, 'base64url').toString('utf8'))).toEqual({
      createdAt: input.createdAt,
      entries: [
        {
          path: 'audit-log.ndjson',
          sha256: createHash('sha256')
            .update(Buffer.from(`${canonicalize(entry)}\n`, 'utf8'))
            .digest('hex'),
          size: Buffer.byteLength(`${canonicalize(entry)}\n`, 'utf8'),
        },
      ],
      expirationRule: 'READY_PLUS_24_HOURS',
      exportId: input.exportId,
      version: 2,
    });
    await expect(
      codec.verify(first.bytes, {
        contentSha256: first.contentSha256,
        exportId: input.exportId,
        signatureKeyId: first.signatureKeyId,
      }),
    ).resolves.toBeUndefined();

    const tampered = Buffer.from(first.bytes);
    tampered[48] = tampered[48]! ^ 1;
    await expect(
      codec.verify(tampered, {
        contentSha256: createHash('sha256').update(tampered).digest('hex'),
        exportId: input.exportId,
        signatureKeyId: first.signatureKeyId,
      }),
    ).rejects.toThrow();

    await expect(
      new AdminAuditExportCodec(new TestEd25519AdminAuditExportSigningPort()).verify(first.bytes, {
        contentSha256: first.contentSha256,
        exportId: input.exportId,
        signatureKeyId: first.signatureKeyId,
      }),
    ).resolves.toBeUndefined();

    const foreignVerifier = new AdminAuditExportCodec({
      activeKeyId: async () => first.signatureKeyId,
      sign: async () => Buffer.alloc(64),
      verify: async () => false,
    });
    await expect(
      foreignVerifier.verify(first.bytes, {
        contentSha256: first.contentSha256,
        exportId: input.exportId,
        signatureKeyId: first.signatureKeyId,
      }),
    ).rejects.toThrow('signature verification failed');
  });

  it('refuse une date de demande non canonique sans calculer de date READY côté Node', async () => {
    const codec = new AdminAuditExportCodec(new TestEd25519AdminAuditExportSigningPort());
    await expect(
      codec.build({
        createdAt: '2026-10-23T00:00:00Z',
        entries: [entry],
        exportId: '00000000-0000-4000-8000-000000000005',
      }),
    ).rejects.toThrow('canonical ISO timestamp');
  });

  it('refuse v1, une règle altérée et toute date opérationnelle injectée même avec un JWS valide', async () => {
    const payload = Buffer.from(`${canonicalize(entry)}\n`, 'utf8');
    const common = {
      createdAt: '2026-10-23T00:00:00.000Z',
      entries: [
        {
          path: 'audit-log.ndjson',
          sha256: createHash('sha256').update(payload).digest('hex'),
          size: payload.byteLength,
        },
      ],
      exportId: '00000000-0000-4000-8000-000000000005',
    };
    const invalidManifests = [
      { ...common, version: 1 },
      { ...common, expirationRule: 'CREATED_PLUS_24_HOURS', version: 2 },
      {
        ...common,
        expirationRule: 'READY_PLUS_24_HOURS',
        readyAt: '2026-10-23T01:00:00.000Z',
        version: 2,
      },
      {
        ...common,
        expirationRule: 'READY_PLUS_24_HOURS',
        expiresAt: '2026-10-24T01:00:00.000Z',
        version: 2,
      },
    ];
    const codec = new AdminAuditExportCodec(new TestEd25519AdminAuditExportSigningPort());
    for (const manifest of invalidManifests) {
      const fixture = await buildSignedFixture(manifest);
      await expect(
        codec.verify(fixture.bytes, {
          contentSha256: fixture.contentSha256,
          exportId: common.exportId,
          signatureKeyId: fixture.signatureKeyId,
        }),
      ).rejects.toThrow('outside the closed profile');
    }
  });

  it('lie AES-256-GCM à toutes les métadonnées et rejette une altération', async () => {
    const keyring = new TestAdminAuditExportStorageKeyring();
    const plaintext = Buffer.from('exact zip bytes', 'utf8');
    const metadata = {
      attemptId: 'attempt-0001',
      contentSha256: createHash('sha256').update(plaintext).digest('hex'),
      exportId: '00000000-0000-4000-8000-000000000005',
      generation: '2',
      plaintextBytes: plaintext.byteLength,
      signatureKeyId: 'test-ed25519-key-v1',
    } as const;
    const encrypted = await encryptAdminAuditExport(keyring, plaintext, metadata);
    const decrypted = await decryptAdminAuditExport(keyring, encrypted.bytes, metadata);
    expect(Buffer.from(decrypted).equals(plaintext)).toBe(true);

    const tampered = Buffer.from(encrypted.bytes);
    tampered[tampered.length - 3] = tampered[tampered.length - 3]! ^ 1;
    await expect(decryptAdminAuditExport(keyring, tampered, metadata)).rejects.toThrow();
    await expect(
      decryptAdminAuditExport(keyring, encrypted.bytes, { ...metadata, generation: '3' }),
    ).rejects.toThrow();
  });
});
