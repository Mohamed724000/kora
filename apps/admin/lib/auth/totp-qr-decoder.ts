import jsQR from 'jsqr';

export type ParsedTotpEnrollment = {
  accountLabel: string;
  issuer: string;
  secret: string;
};

const BASE32 = /^[A-Z2-7]{52}$/u;
const EXPECTED_PARAMETERS = ['algorithm', 'digits', 'issuer', 'period', 'secret'] as const;
const MAX_PNG_BYTES = 2 * 1024 * 1024;
const MAX_QR_DIMENSION = 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export function parseTotpEnrollmentUri(value: string): ParsedTotpEnrollment {
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw new Error('QR TOTP invalide.');
  }
  const keys = [...uri.searchParams.keys()].sort();
  if (
    uri.protocol !== 'otpauth:' ||
    uri.hostname !== 'totp' ||
    uri.username !== '' ||
    uri.password !== '' ||
    uri.port !== '' ||
    uri.hash !== '' ||
    JSON.stringify(keys) !== JSON.stringify([...EXPECTED_PARAMETERS].sort())
  ) {
    throw new Error('QR TOTP invalide.');
  }
  let accountLabel: string;
  try {
    accountLabel = decodeURIComponent(uri.pathname.replace(/^\//u, ''));
  } catch {
    throw new Error('QR TOTP invalide.');
  }
  const algorithm = uri.searchParams.get('algorithm');
  const digits = uri.searchParams.get('digits');
  const issuer = uri.searchParams.get('issuer');
  const period = uri.searchParams.get('period');
  const secret = uri.searchParams.get('secret');
  if (
    !accountLabel.startsWith('KORA+:') ||
    accountLabel.length <= 'KORA+:'.length ||
    accountLabel.length > 254 ||
    issuer !== 'KORA+' ||
    algorithm !== 'SHA256' ||
    digits !== '6' ||
    period !== '30' ||
    secret === null ||
    !BASE32.test(secret)
  ) {
    throw new Error('QR TOTP invalide.');
  }
  return { accountLabel, issuer, secret };
}

export async function decodeTotpEnrollmentPng(blob: Blob): Promise<ParsedTotpEnrollment> {
  if (
    blob.type.toLowerCase() !== 'image/png' ||
    blob.size < 24 ||
    blob.size > MAX_PNG_BYTES ||
    typeof createImageBitmap !== 'function'
  ) {
    throw new Error('QR TOTP indisponible.');
  }
  const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  if (
    !PNG_SIGNATURE.every((byte, index) => header[index] === byte) ||
    String.fromCharCode(...header.slice(12, 16)) !== 'IHDR'
  ) {
    throw new Error('QR TOTP indisponible.');
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const declaredWidth = view.getUint32(16);
  const declaredHeight = view.getUint32(20);
  if (
    declaredWidth < 1 ||
    declaredHeight < 1 ||
    declaredWidth > MAX_QR_DIMENSION ||
    declaredHeight > MAX_QR_DIMENSION ||
    declaredWidth * declaredHeight > MAX_QR_DIMENSION * MAX_QR_DIMENSION
  ) {
    throw new Error('QR TOTP indisponible.');
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  try {
    if (
      context === null ||
      bitmap.width !== declaredWidth ||
      bitmap.height !== declaredHeight ||
      bitmap.width < 1 ||
      bitmap.height < 1
    ) {
      throw new Error('QR TOTP indisponible.');
    }
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const decoded = jsQR(pixels.data, bitmap.width, bitmap.height, {
      inversionAttempts: 'dontInvert',
    });
    if (decoded === null || decoded.data.length > 2048) throw new Error('QR TOTP invalide.');
    return parseTotpEnrollmentUri(decoded.data);
  } finally {
    context?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    bitmap.close();
  }
}
