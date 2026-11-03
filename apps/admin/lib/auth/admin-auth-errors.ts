export type AdminAuthErrorCode =
  | 'ADMIN_INVITATION_INVALID'
  | 'ADMIN_RECOVERY_CODE_INVALID'
  | 'ADMIN_RECOVERY_INVALID'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REFRESH_INVALID'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'IDEMPOTENCY_CONFLICT'
  | 'OTP_EXPIRED'
  | 'OTP_INVALID'
  | 'RATE_LIMITED'
  | 'SENSITIVE_RESPONSE_ALREADY_DELIVERED'
  | 'SERVICE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export type AdminAuthOutcome = 'REJECTED' | 'UNKNOWN';
export type AdminAuthWireErrorCode = Exclude<AdminAuthErrorCode, 'UNKNOWN'>;

const PUBLIC_MESSAGES: Readonly<Record<AdminAuthErrorCode, string>> = {
  ADMIN_INVITATION_INVALID: 'Ce code ne peut pas être utilisé.',
  ADMIN_RECOVERY_CODE_INVALID: 'Ce code de récupération ne peut pas être utilisé.',
  ADMIN_RECOVERY_INVALID: 'Ce code ne peut pas être utilisé.',
  AUTH_INVALID_CREDENTIALS: 'Identifiants invalides.',
  AUTH_REFRESH_INVALID: 'Votre session a expiré. Reconnectez-vous.',
  AUTH_REQUIRED: 'Authentification requise.',
  FORBIDDEN: 'Vous ne disposez pas de l’autorisation nécessaire.',
  IDEMPOTENCY_CONFLICT: 'Cette action entre en conflit avec une tentative antérieure.',
  OTP_EXPIRED: 'Ce code a expiré. Recommencez le parcours.',
  OTP_INVALID: 'Le code saisi est invalide.',
  RATE_LIMITED: 'Trop de tentatives. Patientez avant de recommencer.',
  SENSITIVE_RESPONSE_ALREADY_DELIVERED:
    'Ce secret a déjà été présenté et ne peut pas être affiché de nouveau.',
  SERVICE_UNAVAILABLE: 'Le service est temporairement indisponible.',
  UNKNOWN: 'Le résultat de cette action est inconnu. Ne la répétez pas automatiquement.',
  VALIDATION_ERROR: 'Vérifiez les informations saisies.',
};

const KNOWN_WIRE_CODES = new Set<AdminAuthWireErrorCode>(
  (Object.keys(PUBLIC_MESSAGES) as AdminAuthErrorCode[]).filter(
    (code): code is AdminAuthWireErrorCode => code !== 'UNKNOWN',
  ),
);

export class AdminAuthRequestError extends Error {
  readonly code: AdminAuthErrorCode;
  readonly outcome: AdminAuthOutcome;
  readonly retryAfterSeconds?: number;
  readonly status: number;
  readonly wireCode?: AdminAuthWireErrorCode;

  constructor(options: {
    code: AdminAuthErrorCode;
    outcome?: AdminAuthOutcome;
    retryAfterSeconds?: number;
    status: number;
    wireCode?: AdminAuthWireErrorCode;
  }) {
    super(PUBLIC_MESSAGES[options.code]);
    this.name = 'AdminAuthRequestError';
    this.code = options.code;
    this.outcome = options.outcome ?? 'REJECTED';
    this.status = options.status;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
    if (options.wireCode !== undefined) this.wireCode = options.wireCode;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null || !/^[1-9][0-9]{0,4}$/u.test(value)) return undefined;
  const seconds = Number(value);
  return seconds <= 86_400 ? seconds : undefined;
}

function errorDetails(value: unknown): value is Record<string, unknown> {
  if (!object(value)) return false;
  const allowed = new Set(['field', 'operatorReason', 'reason', 'retryAfterSeconds']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (
    value.field !== undefined &&
    (typeof value.field !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(value.field))
  ) {
    return false;
  }
  if (
    value.operatorReason !== undefined &&
    (typeof value.operatorReason !== 'string' ||
      value.operatorReason.length < 3 ||
      value.operatorReason.length > 500)
  ) {
    return false;
  }
  if (
    value.reason !== undefined &&
    ![
      'CONFLICT',
      'EXPIRED',
      'INVALID_FORMAT',
      'INVALID_STATE',
      'NOT_AVAILABLE',
      'OUT_OF_RANGE',
      'RATE_LIMITED',
      'REQUIRED',
    ].includes(String(value.reason))
  ) {
    return false;
  }
  return (
    value.retryAfterSeconds === undefined ||
    (Number.isSafeInteger(value.retryAfterSeconds) &&
      Number(value.retryAfterSeconds) >= 0 &&
      Number(value.retryAfterSeconds) <= 86_400)
  );
}

function wireError(response: Response, value: unknown): AdminAuthWireErrorCode | undefined {
  if (!object(value) || JSON.stringify(Object.keys(value).sort()) !== '["error","requestId"]') {
    return undefined;
  }
  if (
    typeof value.requestId !== 'string' ||
    value.requestId.length < 8 ||
    value.requestId.length > 128 ||
    !object(value.error)
  ) {
    return undefined;
  }
  const errorKeys = Object.keys(value.error).sort();
  if (
    JSON.stringify(errorKeys) !== '["code","details","message"]' &&
    JSON.stringify(errorKeys) !== '["code","details","message","retryable"]'
  ) {
    return undefined;
  }
  const code = value.error.code;
  if (
    typeof code !== 'string' ||
    !KNOWN_WIRE_CODES.has(code as AdminAuthWireErrorCode) ||
    typeof value.error.message !== 'string' ||
    value.error.message.length < 1 ||
    value.error.message.length > 160 ||
    !errorDetails(value.error.details) ||
    (value.error.retryable !== undefined && typeof value.error.retryable !== 'boolean')
  ) {
    return undefined;
  }
  if (
    response.status === 503 &&
    (code !== 'SERVICE_UNAVAILABLE' ||
      value.error.message !== 'Service temporairement indisponible.' ||
      value.error.retryable !== false ||
      Object.keys(value.error.details).length !== 0)
  ) {
    return undefined;
  }
  return code as AdminAuthWireErrorCode;
}

export async function adminAuthErrorFromResponse(
  response: Response,
  uncertainMutation: boolean,
): Promise<AdminAuthRequestError> {
  const malformedResponseError = (): AdminAuthRequestError =>
    uncertainMutation && response.status >= 500
      ? unknownAdminAuthMutationError()
      : new AdminAuthRequestError({ code: 'SERVICE_UNAVAILABLE', status: 503 });
  let parsed: unknown;
  try {
    parsed = await response.clone().json();
  } catch {
    return malformedResponseError();
  }
  const wireCode = wireError(response, parsed);
  if (wireCode === undefined) {
    return malformedResponseError();
  }
  const delay = response.status === 429 ? retryAfter(response) : undefined;
  if (
    (response.status === 429 && delay === undefined) ||
    (response.status !== 429 && retryAfter(response) !== undefined)
  ) {
    return malformedResponseError();
  }
  const outcome = uncertainMutation && response.status >= 500 ? 'UNKNOWN' : 'REJECTED';
  const options: ConstructorParameters<typeof AdminAuthRequestError>[0] = {
    code: outcome === 'UNKNOWN' ? 'UNKNOWN' : wireCode,
    outcome,
    status: response.status,
    wireCode,
  };
  if (delay !== undefined) options.retryAfterSeconds = delay;
  return new AdminAuthRequestError(options);
}

export function unknownAdminAuthMutationError(): AdminAuthRequestError {
  return new AdminAuthRequestError({ code: 'UNKNOWN', outcome: 'UNKNOWN', status: 503 });
}
