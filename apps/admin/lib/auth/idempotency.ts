const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function createIdempotencyKey(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('La génération sécurisée de clé d’idempotence est indisponible.');
  }
  const key = crypto.randomUUID();
  if (!IDEMPOTENCY_KEY.test(key)) throw new Error('Clé d’idempotence invalide.');
  return key;
}

export class IdempotentIntent<TPayload> {
  readonly key = createIdempotencyKey();

  constructor(readonly payload: TPayload) {}
}
