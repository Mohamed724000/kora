import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';

export const ADMIN_CLIENT_PROVENANCE_HEADER = 'x-kora-admin-client-ip';
export const ADMIN_API_SERVER_NAME = 'api.c3.internal';

export class AdminClientProvenanceError extends Error {
  constructor() {
    super('Admin client provenance rejected.');
    this.name = 'AdminClientProvenanceError';
  }
}

function ipv4(value: string): readonly number[] | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) return undefined;
    const byte = Number(part);
    if (byte > 255) return undefined;
    bytes.push(byte);
  }
  return bytes;
}

function ipv6Bytes(value: string): readonly number[] | undefined {
  let candidate = value;
  const dottedIndex = candidate.lastIndexOf(':');
  if (candidate.includes('.') && dottedIndex >= 0) {
    const bytes = ipv4(candidate.slice(dottedIndex + 1));
    if (bytes === undefined) return undefined;
    candidate = `${candidate.slice(0, dottedIndex)}:${(((bytes[0] as number) << 8) | (bytes[1] as number)).toString(16)}:${(((bytes[2] as number) << 8) | (bytes[3] as number)).toString(16)}`;
  }
  const halves = candidate.split('::');
  if (halves.length > 2) return undefined;
  const parse = (part: string): number[] | undefined => {
    if (part === '') return [];
    const groups = part.split(':');
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/iu.test(group))) return undefined;
    return groups.map((group) => Number.parseInt(group, 16));
  };
  const left = parse(halves[0] as string);
  const right = parse(halves[1] ?? '');
  if (left === undefined || right === undefined) return undefined;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return undefined;
  }
  return [...left, ...Array.from({ length: missing }, () => 0), ...right].flatMap((group) => [
    group >>> 8,
    group & 0xff,
  ]);
}

function canonicalIpv6(value: string): string | undefined {
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1).toLowerCase()
      : undefined;
  } catch {
    return undefined;
  }
}

export function canonicalizeNginxClientIp(value: string): string {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value ||
    value.includes(',') ||
    /[\p{Cc}\s]/u.test(value) ||
    value.includes('%') ||
    value.startsWith('[') ||
    value.endsWith(']')
  ) {
    throw new AdminClientProvenanceError();
  }
  const family = isIP(value);
  if (family === 4) {
    const bytes = ipv4(value);
    if (bytes === undefined) throw new AdminClientProvenanceError();
    return bytes.join('.');
  }
  if (family !== 6) throw new AdminClientProvenanceError();
  const bytes = ipv6Bytes(value);
  if (bytes === undefined) throw new AdminClientProvenanceError();
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return bytes.slice(12).join('.');
  }
  const canonical = canonicalIpv6(value);
  if (canonical === undefined || canonicalIpv6(canonical) !== canonical) {
    throw new AdminClientProvenanceError();
  }
  return canonical;
}

export function resolveNginxClientProvenance(headers: Headers): string {
  const value = headers.get(ADMIN_CLIENT_PROVENANCE_HEADER);
  if (value === null) throw new AdminClientProvenanceError();
  return canonicalizeNginxClientIp(value);
}

function equalFingerprint(raw: Buffer, expectedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(expectedHex)) return false;
  const actual = createHash('sha256').update(raw).digest();
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export function exactAdminApiServerIdentity(
  hostname: string,
  certificate: PeerCertificate,
  expectedFingerprintSha256: string,
): Error | undefined {
  const standardError = checkServerIdentity(hostname, certificate);
  if (standardError !== undefined) return standardError;
  if (
    hostname !== ADMIN_API_SERVER_NAME ||
    certificate.subjectaltname !== `DNS:${ADMIN_API_SERVER_NAME}` ||
    !certificate.ext_key_usage?.includes('1.3.6.1.5.5.7.3.1') ||
    !Buffer.isBuffer(certificate.raw) ||
    !equalFingerprint(certificate.raw, expectedFingerprintSha256)
  ) {
    return new AdminClientProvenanceError();
  }
  return undefined;
}
