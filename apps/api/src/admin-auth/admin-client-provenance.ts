import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import type { PeerCertificate, TLSSocket } from 'node:tls';
import type { AdminClientProvenanceConfig } from '../config/runtime-config';
import { AdminRequestPolicyError } from './admin-request-policy';

export const ADMIN_CLIENT_PROVENANCE_HEADER = 'x-kora-admin-client-ip';
export const ADMIN_BFF_CLIENT_IDENTITY = 'spiffe://kora.local/c3/admin-bff';

type Next = () => void;

const resolvedAddresses = new WeakMap<IncomingMessage, string>();

function parseIpv4(value: string): readonly number[] | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    octets.push(octet);
  }
  return octets;
}

function expandIpv6(value: string): readonly number[] | undefined {
  let candidate = value;
  const dottedIndex = candidate.lastIndexOf(':');
  if (candidate.includes('.') && dottedIndex >= 0) {
    const ipv4 = parseIpv4(candidate.slice(dottedIndex + 1));
    if (ipv4 === undefined) return undefined;
    const high = ((ipv4[0] as number) << 8) | (ipv4[1] as number);
    const low = ((ipv4[2] as number) << 8) | (ipv4[3] as number);
    candidate = `${candidate.slice(0, dottedIndex)}:${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = candidate.split('::');
  if (halves.length > 2) return undefined;
  const parseHalf = (half: string): number[] | undefined => {
    if (half.length === 0) return [];
    const groups = half.split(':');
    const parsed: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/iu.test(group)) return undefined;
      parsed.push(Number.parseInt(group, 16));
    }
    return parsed;
  };
  const left = parseHalf(halves[0] as string);
  const right = parseHalf(halves[1] ?? '');
  if (left === undefined || right === undefined) return undefined;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return undefined;
  }
  const groups = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  if (groups.length !== 8) return undefined;
  const bytes: number[] = [];
  for (const group of groups) bytes.push(group >>> 8, group & 0xff);
  return bytes;
}

function canonicalIpv6(value: string): string | undefined {
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    if (!hostname.startsWith('[') || !hostname.endsWith(']')) return undefined;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return undefined;
  }
}

export function canonicalizeAdminClientIp(value: string): string {
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
    throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  }

  const family = isIP(value);
  if (family === 4) {
    const octets = parseIpv4(value);
    if (octets === undefined) throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
    return octets.join('.');
  }
  if (family !== 6) throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');

  const bytes = expandIpv6(value);
  if (bytes === undefined) throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  const mapped =
    bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (mapped) return bytes.slice(12).join('.');

  const canonical = canonicalIpv6(value);
  if (canonical === undefined || isIP(canonical) !== 6) {
    throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  }
  const stable = canonicalIpv6(canonical);
  if (stable !== canonical) throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  return canonical;
}

function rawHeaderValues(request: IncomingMessage, target: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === target) {
      values.push(request.rawHeaders[index + 1] ?? '');
    }
  }
  return values;
}

function hasPublicProvenanceHeader(request: IncomingMessage): boolean {
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index]?.toLowerCase() ?? '';
    if (name === 'forwarded' || name === 'x-real-ip' || name.startsWith('x-forwarded-')) {
      return true;
    }
  }
  return false;
}

function equalDigest(actual: Buffer, expectedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function assertExactBffPeer(
  socket: TLSSocket,
  config: Extract<AdminClientProvenanceConfig, { mode: 'MTLS_BFF' }>,
): void {
  if (socket.encrypted !== true || socket.authorized !== true) {
    throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  }
  const peer = socket.getPeerCertificate(true) as PeerCertificate;
  if (
    !Buffer.isBuffer(peer.raw) ||
    peer.raw.byteLength === 0 ||
    peer.subjectaltname !== `URI:${ADMIN_BFF_CLIENT_IDENTITY}` ||
    !peer.ext_key_usage?.includes('1.3.6.1.5.5.7.3.2')
  ) {
    throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  }
  const digest = createHash('sha256').update(peer.raw).digest();
  if (!equalDigest(digest, config.clientCertificateSha256)) {
    throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  }
}

export function resolveAdminClientProvenance(
  request: IncomingMessage,
  config: AdminClientProvenanceConfig,
): string {
  const internalValues = rawHeaderValues(request, ADMIN_CLIENT_PROVENANCE_HEADER);
  if (config.mode === 'DIRECT') {
    if (
      internalValues.length > 0 ||
      request.headers[ADMIN_CLIENT_PROVENANCE_HEADER] !== undefined
    ) {
      throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
    }
    const address = request.socket.remoteAddress ?? 'unavailable';
    resolvedAddresses.set(request, address);
    return address;
  }

  assertExactBffPeer(request.socket as TLSSocket, config);
  if (hasPublicProvenanceHeader(request) || internalValues.length !== 1) {
    throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  }
  const address = canonicalizeAdminClientIp(internalValues[0] as string);
  resolvedAddresses.set(request, address);
  return address;
}

export function getResolvedAdminClientAddress(request: IncomingMessage): string {
  const address = resolvedAddresses.get(request);
  if (address === undefined) throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
  return address;
}

function reject(response: ServerResponse): void {
  response.statusCode = 403;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', '0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end();
}

export function createAdminClientProvenanceMiddleware(
  config: AdminClientProvenanceConfig,
): (request: IncomingMessage, response: ServerResponse, next: Next) => void {
  return (request, response, next) => {
    try {
      resolveAdminClientProvenance(request, config);
      next();
    } catch {
      reject(response);
    }
  };
}
