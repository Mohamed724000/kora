const SAFE_DESTINATIONS = new Set(['/', '/compte/securite']);

export type SafeAdminDestination = '/' | '/compte/securite';

export function safeAdminReturnTo(value: string | null | undefined): SafeAdminDestination {
  if (
    value === undefined ||
    value === null ||
    value.includes('\\') ||
    value.includes('%') ||
    /[\p{Cc}]/u.test(value) ||
    value.startsWith('//') ||
    value.startsWith('/api/') ||
    !SAFE_DESTINATIONS.has(value)
  ) {
    return '/';
  }
  return value as SafeAdminDestination;
}
