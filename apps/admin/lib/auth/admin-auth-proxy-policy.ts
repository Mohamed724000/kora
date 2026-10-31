export type AdminAuthProxyMethod = 'DELETE' | 'GET' | 'POST';

export type AdminAuthOperationId =
  | 'acceptAdminInvitation'
  | 'confirmAdminTotpEnrollment'
  | 'createAdminTotpEnrollment'
  | 'deliverAdminTotpEnrollmentQr'
  | 'listAdminSessions'
  | 'loginAdmin'
  | 'refreshAdminSession'
  | 'requestAdminPasswordReset'
  | 'resetAdminPassword'
  | 'revokeCurrentAdminSession'
  | 'rotateAdminRecoveryCodes'
  | 'verifyAdminRecoveryCode'
  | 'verifyAdminTotp';

export interface AdminAuthProxyOperation {
  body: 'FORBIDDEN' | 'JSON';
  method: AdminAuthProxyMethod;
  operationId: AdminAuthOperationId;
  path: RegExp;
}

const UUID =
  '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}';

export const ADMIN_AUTH_PROXY_OPERATIONS: readonly AdminAuthProxyOperation[] = Object.freeze([
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'loginAdmin',
    path: /^\/api\/v1\/admin\/auth\/login$/u,
  },
  {
    body: 'FORBIDDEN',
    method: 'POST',
    operationId: 'createAdminTotpEnrollment',
    path: /^\/api\/v1\/admin\/auth\/totp\/enrollments$/u,
  },
  {
    body: 'FORBIDDEN',
    method: 'POST',
    operationId: 'deliverAdminTotpEnrollmentQr',
    path: new RegExp(`^/api/v1/admin/auth/totp/enrollments/${UUID}/qr$`, 'u'),
  },
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'confirmAdminTotpEnrollment',
    path: new RegExp(`^/api/v1/admin/auth/totp/enrollments/${UUID}/confirm$`, 'u'),
  },
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'verifyAdminTotp',
    path: /^\/api\/v1\/admin\/auth\/totp\/verify$/u,
  },
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'verifyAdminRecoveryCode',
    path: /^\/api\/v1\/admin\/auth\/recovery-codes\/verify$/u,
  },
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'rotateAdminRecoveryCodes',
    path: /^\/api\/v1\/admin\/auth\/recovery-codes\/rotate$/u,
  },
  {
    body: 'FORBIDDEN',
    method: 'POST',
    operationId: 'refreshAdminSession',
    path: /^\/api\/v1\/admin\/auth\/sessions\/refresh$/u,
  },
  {
    body: 'FORBIDDEN',
    method: 'DELETE',
    operationId: 'revokeCurrentAdminSession',
    path: /^\/api\/v1\/admin\/auth\/sessions\/current$/u,
  },
  {
    body: 'FORBIDDEN',
    method: 'GET',
    operationId: 'listAdminSessions',
    path: /^\/api\/v1\/admin\/auth\/sessions$/u,
  },
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'requestAdminPasswordReset',
    path: /^\/api\/v1\/admin\/auth\/password\/reset-requests$/u,
  },
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'resetAdminPassword',
    path: /^\/api\/v1\/admin\/auth\/password\/reset$/u,
  },
  {
    body: 'JSON',
    method: 'POST',
    operationId: 'acceptAdminInvitation',
    path: /^\/api\/v1\/admin\/auth\/invitations\/accept$/u,
  },
]);

function safeRawPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/v1/admin/auth/') &&
    !pathname.includes('//') &&
    !pathname.includes('\\') &&
    !pathname.includes('%') &&
    !pathname.split('/').some((segment) => segment === '.' || segment === '..')
  );
}

export function resolveAdminAuthProxyOperation(
  method: string,
  pathname: string,
  search: string,
): AdminAuthProxyOperation | undefined {
  if (search !== '' || !safeRawPath(pathname)) return undefined;
  if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') return undefined;
  return ADMIN_AUTH_PROXY_OPERATIONS.find(
    (operation) => operation.method === method && operation.path.test(pathname),
  );
}
