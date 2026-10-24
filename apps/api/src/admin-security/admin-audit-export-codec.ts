import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import type { AdminAuditLogEntry } from './admin-audit.types';
import type { AdminAuditExportSigningPort } from './admin-audit-export-signing.port';

const DOS_EPOCH = new Date('1980-01-01T00:00:00.000Z');
const PAYLOAD_PATH = 'audit-log.ndjson';
const MANIFEST_PATH = 'manifest.json';
const SIGNATURE_PATH = 'manifest.sig';
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_DOS_EPOCH_DATE = 0x0021;
const ZIP_STORED_METHOD = 0;
const ZIP_FILE_MODE = 0o100644;
const ZIP_PATHS = [PAYLOAD_PATH, MANIFEST_PATH, SIGNATURE_PATH] as const;
const MANIFEST_VERSION = 2;
const MANIFEST_EXPIRATION_RULE = 'READY_PLUS_24_HOURS';
const NDJSON_LINE_FEED = Buffer.from('\n', 'utf8');

export const ADMIN_AUDIT_EXPORT_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

export interface AdminAuditExportArtifact {
  readonly bytes: Buffer;
  readonly contentSha256: string;
  readonly signatureKeyId: string;
}

interface ManifestV2 {
  readonly createdAt: string;
  readonly entries: readonly Readonly<{ path: string; sha256: string; size: number }>[];
  readonly expirationRule: typeof MANIFEST_EXPIRATION_RULE;
  readonly exportId: string;
  readonly version: typeof MANIFEST_VERSION;
}

interface StoredZipEntry {
  readonly bytes: Buffer;
  readonly path: string;
}

function canonical(value: unknown): Buffer {
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new TypeError('Value is not RFC 8785 canonicalizable.');
  return Buffer.from(serialized, 'utf8');
}

export function adminAuditExportNdjsonByteLength(entries: readonly AdminAuditLogEntry[]): number {
  return entries.reduce(
    (total, entry) => total + canonical(entry).byteLength + NDJSON_LINE_FEED.byteLength,
    0,
  );
}

function encodeAdminAuditExportNdjson(entries: readonly AdminAuditLogEntry[]): Buffer {
  if (entries.length === 0) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for (const entry of entries) chunks.push(canonical(entry), NDJSON_LINE_FEED);
  return Buffer.concat(chunks);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertCanonicalIsoTimestamp(createdAt: string): void {
  const created = new Date(createdAt);
  if (created.toISOString() !== createdAt) {
    throw new TypeError('C2b manifest createdAt must be a canonical ISO timestamp.');
  }
}

function base64url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new TypeError('Invalid base64url value.');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value)
    throw new TypeError('Non-canonical base64url value.');
  return decoded;
}

function crc32(value: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertRange(bytes: Buffer, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    throw new TypeError('Invalid ZIP range.');
  }
  if (offset + length > bytes.byteLength) throw new TypeError('Truncated ZIP structure.');
}

function safeZipPath(path: string): boolean {
  return (
    path.normalize('NFC') === path &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !/^[A-Za-z]:/u.test(path) &&
    !path.includes('\\') &&
    !path.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  );
}

function readStoredZip(bytes: Buffer): readonly StoredZipEntry[] {
  if (bytes.byteLength < 22) throw new TypeError('ZIP end record is missing.');
  const searchStart = Math.max(0, bytes.byteLength - 22 - 65_535);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END_SIGNATURE) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new TypeError('ZIP end record is missing.');
  assertRange(bytes, endOffset, 22);
  const diskNumber = bytes.readUInt16LE(endOffset + 4);
  const centralDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const totalEntries = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  const commentLength = bytes.readUInt16LE(endOffset + 20);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== ZIP_PATHS.length ||
    totalEntries !== ZIP_PATHS.length ||
    commentLength !== 0 ||
    endOffset + 22 !== bytes.byteLength ||
    centralOffset + centralSize !== endOffset
  ) {
    throw new TypeError('ZIP envelope is not the closed C2b profile.');
  }
  assertRange(bytes, centralOffset, centralSize);
  const entries: StoredZipEntry[] = [];
  let centralCursor = centralOffset;
  let previousLocalEnd = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    assertRange(bytes, centralCursor, 46);
    if (bytes.readUInt32LE(centralCursor) !== ZIP_CENTRAL_SIGNATURE) {
      throw new TypeError('Invalid ZIP central directory entry.');
    }
    const flags = bytes.readUInt16LE(centralCursor + 8);
    const method = bytes.readUInt16LE(centralCursor + 10);
    const modifiedTime = bytes.readUInt16LE(centralCursor + 12);
    const modifiedDate = bytes.readUInt16LE(centralCursor + 14);
    const checksum = bytes.readUInt32LE(centralCursor + 16);
    const compressedSize = bytes.readUInt32LE(centralCursor + 20);
    const uncompressedSize = bytes.readUInt32LE(centralCursor + 24);
    const pathLength = bytes.readUInt16LE(centralCursor + 28);
    const extraLength = bytes.readUInt16LE(centralCursor + 30);
    const entryCommentLength = bytes.readUInt16LE(centralCursor + 32);
    const diskStart = bytes.readUInt16LE(centralCursor + 34);
    const externalAttributes = bytes.readUInt32LE(centralCursor + 38);
    const localOffset = bytes.readUInt32LE(centralCursor + 42);
    const centralEntryLength = 46 + pathLength + extraLength + entryCommentLength;
    assertRange(bytes, centralCursor, centralEntryLength);
    const path = bytes
      .subarray(centralCursor + 46, centralCursor + 46 + pathLength)
      .toString('utf8');
    if (
      flags !== ZIP_UTF8_FLAG ||
      method !== ZIP_STORED_METHOD ||
      modifiedTime !== 0 ||
      modifiedDate !== ZIP_DOS_EPOCH_DATE ||
      compressedSize !== uncompressedSize ||
      path !== ZIP_PATHS[index] ||
      !safeZipPath(path) ||
      entryCommentLength !== 0 ||
      diskStart !== 0 ||
      ((externalAttributes >>> 16) & 0xffff) !== ZIP_FILE_MODE
    ) {
      throw new TypeError('ZIP entry is outside the deterministic C2b profile.');
    }
    assertRange(bytes, localOffset, 30);
    if (bytes.readUInt32LE(localOffset) !== ZIP_LOCAL_SIGNATURE) {
      throw new TypeError('Invalid ZIP local entry.');
    }
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localPathLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localHeaderLength = 30 + localPathLength + localExtraLength;
    assertRange(bytes, localOffset, localHeaderLength + compressedSize);
    const localPath = bytes
      .subarray(localOffset + 30, localOffset + 30 + localPathLength)
      .toString('utf8');
    const dataOffset = localOffset + localHeaderLength;
    const dataEnd = dataOffset + compressedSize;
    if (
      localOffset !== previousLocalEnd ||
      localFlags !== flags ||
      localMethod !== method ||
      localPath !== path ||
      dataEnd > centralOffset
    ) {
      throw new TypeError('ZIP local and central entries diverge.');
    }
    const entryBytes = Buffer.from(bytes.subarray(dataOffset, dataEnd));
    if (crc32(entryBytes) !== checksum) throw new TypeError('ZIP entry checksum mismatch.');
    entries.push({ bytes: entryBytes, path });
    previousLocalEnd = dataEnd;
    centralCursor += centralEntryLength;
  }
  if (centralCursor !== endOffset || previousLocalEnd !== centralOffset) {
    throw new TypeError('ZIP contains unaccounted bytes or entries.');
  }
  return entries;
}

function addStored(zip: ZipFile, path: string, bytes: Buffer): void {
  zip.addBuffer(bytes, path, {
    compress: false,
    mtime: DOS_EPOCH,
    mode: 0o100644,
  });
}

async function finalizeZip(zip: ZipFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    zip.outputStream.once('error', reject);
    zip.outputStream.once('end', () => resolve(Buffer.concat(chunks)));
    zip.end({ comment: '', forceZip64Format: false });
  });
}

export class AdminAuditExportCodec {
  constructor(private readonly signing: AdminAuditExportSigningPort) {}

  async build(
    input: Readonly<{
      createdAt: string;
      entries: readonly AdminAuditLogEntry[];
      exportId: string;
    }>,
    signal?: AbortSignal,
  ): Promise<AdminAuditExportArtifact> {
    assertCanonicalIsoTimestamp(input.createdAt);
    const ndjson = encodeAdminAuditExportNdjson(input.entries);
    const manifest: ManifestV2 = {
      createdAt: input.createdAt,
      entries: [{ path: PAYLOAD_PATH, sha256: sha256(ndjson), size: ndjson.byteLength }],
      expirationRule: MANIFEST_EXPIRATION_RULE,
      exportId: input.exportId,
      version: MANIFEST_VERSION,
    };
    const manifestBytes = canonical(manifest);
    signal?.throwIfAborted();
    const signatureKeyId = await this.signing.activeKeyId(signal);
    const protectedHeader = canonical({ alg: 'EdDSA', kid: signatureKeyId });
    const signingInput = Buffer.from(
      `${base64url(protectedHeader)}.${base64url(manifestBytes)}`,
      'ascii',
    );
    const signature = await this.signing.sign(signatureKeyId, signingInput, signal);
    const detachedJws = Buffer.from(
      `${base64url(protectedHeader)}..${base64url(signature)}`,
      'ascii',
    );
    if (!(await this.signing.verify(signatureKeyId, signingInput, signature, signal))) {
      throw new TypeError('Detached Ed25519 signature self-verification failed.');
    }
    const zip = new ZipFile();
    addStored(zip, PAYLOAD_PATH, ndjson);
    addStored(zip, MANIFEST_PATH, manifestBytes);
    addStored(zip, SIGNATURE_PATH, detachedJws);
    const bytes = await finalizeZip(zip);
    signal?.throwIfAborted();
    return { bytes, contentSha256: sha256(bytes), signatureKeyId };
  }

  async verify(
    bytes: Buffer,
    expected: Readonly<{
      contentSha256: string;
      exportId: string;
      signatureKeyId: string;
    }>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (sha256(bytes) !== expected.contentSha256) {
      throw new TypeError('C2b ZIP content hash mismatch.');
    }
    const entries = readStoredZip(bytes);
    const payload = entries[0]!.bytes;
    const manifestBytes = entries[1]!.bytes;
    const signatureBytes = entries[2]!.bytes;
    if (payload.byteLength > 0) {
      if (payload[payload.byteLength - 1] !== 0x0a) {
        throw new TypeError('C2b NDJSON must end with LF.');
      }
      for (const line of payload.toString('utf8').slice(0, -1).split('\n')) {
        if (line.length === 0 || canonical(JSON.parse(line)).toString('utf8') !== line) {
          throw new TypeError('C2b NDJSON line is not canonical JSON.');
        }
      }
    }
    const parsedManifest = JSON.parse(manifestBytes.toString('utf8')) as ManifestV2;
    if (
      canonical(parsedManifest).equals(manifestBytes) === false ||
      parsedManifest === null ||
      typeof parsedManifest !== 'object' ||
      JSON.stringify(Object.keys(parsedManifest).sort()) !==
        JSON.stringify(['createdAt', 'entries', 'expirationRule', 'exportId', 'version']) ||
      parsedManifest.version !== MANIFEST_VERSION ||
      parsedManifest.expirationRule !== MANIFEST_EXPIRATION_RULE ||
      parsedManifest.exportId !== expected.exportId ||
      !Array.isArray(parsedManifest.entries) ||
      parsedManifest.entries.length !== 1 ||
      JSON.stringify(Object.keys(parsedManifest.entries[0] ?? {}).sort()) !==
        JSON.stringify(['path', 'sha256', 'size']) ||
      parsedManifest.entries[0]?.path !== PAYLOAD_PATH ||
      parsedManifest.entries[0]?.size !== payload.byteLength ||
      parsedManifest.entries[0]?.sha256 !== sha256(payload) ||
      (() => {
        try {
          assertCanonicalIsoTimestamp(parsedManifest.createdAt);
          return false;
        } catch {
          return true;
        }
      })()
    ) {
      throw new TypeError('C2b manifest is outside the closed profile.');
    }
    const jws = signatureBytes.toString('ascii');
    if (!/^[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]+$/u.test(jws)) {
      throw new TypeError('C2b manifest signature is not a detached compact JWS.');
    }
    const [protectedPart, detachedPart, signaturePart] = jws.split('.');
    if (protectedPart === undefined || detachedPart !== '' || signaturePart === undefined) {
      throw new TypeError('C2b manifest signature is malformed.');
    }
    const protectedBytes = decodeBase64url(protectedPart);
    const protectedHeader = JSON.parse(protectedBytes.toString('utf8')) as Record<string, unknown>;
    if (
      canonical(protectedHeader).equals(protectedBytes) === false ||
      JSON.stringify(Object.keys(protectedHeader).sort()) !== JSON.stringify(['alg', 'kid']) ||
      protectedHeader.alg !== 'EdDSA' ||
      protectedHeader.kid !== expected.signatureKeyId
    ) {
      throw new TypeError('C2b manifest signature header is outside the closed profile.');
    }
    const signature = decodeBase64url(signaturePart);
    const signingInput = Buffer.from(`${protectedPart}.${base64url(manifestBytes)}`, 'ascii');
    if (!(await this.signing.verify(expected.signatureKeyId, signingInput, signature, signal))) {
      throw new TypeError('C2b manifest signature verification failed.');
    }
  }
}
