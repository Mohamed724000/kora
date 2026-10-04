import { AdminC1HttpError } from './admin-session.service';
import { parseReason } from './admin-auth.controller';
import {
  AdminAuthService,
  assertAdminUuid,
  assertIdempotencyKey,
  parseAdminLogin,
  parseAdminRecovery,
  parseAdminStepUp,
  parseAdminTotp,
} from './admin-auth.service';

describe('AdminAuthService contract validation', () => {
  it('accepts only closed login and TOTP bodies', () => {
    expect(
      parseAdminLogin({ email: 'Admin@example.test', password: 'a-secure-passphrase' }),
    ).toEqual({ email: 'admin@example.test', password: 'a-secure-passphrase' });
    expect(parseAdminTotp({ code: '123456' })).toEqual({ code: '123456' });
    expect(() =>
      parseAdminLogin({ email: 'a@example.test', password: 'a-secure-passphrase', x: 1 }),
    ).toThrow(AdminC1HttpError);
    expect(() => parseAdminTotp({ code: '12345' })).toThrow(AdminC1HttpError);
  });

  it('validates recovery material, generic step-up purposes and identifiers', () => {
    expect(
      parseAdminRecovery({ selector: 'ABCDEFGH2345', verifier: 'ABCDEFGHJKLMNPQRSTUVWXYZ2345' }),
    ).toMatchObject({ selector: 'ABCDEFGH2345' });
    expect(parseAdminStepUp({ purpose: 'SESSION_REVOCATION', totpCode: '654321' })).toEqual({
      purpose: 'SESSION_REVOCATION',
      totpCode: '654321',
    });
    expect(() =>
      parseAdminStepUp({ purpose: 'RECOVERY_CODE_ROTATION', totpCode: '654321' }),
    ).toThrow(AdminC1HttpError);
    expect(assertAdminUuid('00000000-0000-4000-8000-000000000020')).toBe(
      '00000000-0000-4000-8000-000000000020',
    );
    expect(assertIdempotencyKey('idempotency-key-0001')).toBe('idempotency-key-0001');
  });

  it('accepte les six motifs contractuels et expose operatorReason manquant', () => {
    for (const reasonCode of [
      'SECURITY_RESPONSE',
      'ACCOUNT_RECOVERY',
      'ROLE_ADMINISTRATION',
      'STATUS_ADMINISTRATION',
      'AUDIT_EXPORT',
      'INVITATION_ADMINISTRATION',
    ] as const) {
      expect(parseReason({ operatorReason: 'Motif explicite', reasonCode })).toEqual({
        operatorReason: 'Motif explicite',
        reasonCode,
      });
    }
    try {
      parseReason({ reasonCode: 'SECURITY_RESPONSE' });
      throw new Error('parseReason should reject a missing operatorReason.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AdminC1HttpError);
      expect((error as AdminC1HttpError).details).toEqual({
        field: 'operatorReason',
        reason: 'REQUIRED',
      });
    }
  });

  it('préserve toutes les métadonnées d erreur lors de l enrichissement session', () => {
    const service = Object.create(AdminAuthService.prototype) as AdminAuthService;
    const original = new AdminC1HttpError(429, 'RATE_LIMITED', {
      auditAction: 'ORIGINAL_ACTION',
      auditRecorded: true,
      details: { reason: 'RATE_LIMITED', retryAfterSeconds: 17 },
      retryAfterSeconds: 17,
    });
    const enrich = service as unknown as {
      withSessionAudit(
        error: AdminC1HttpError,
        principal: {
          adminUserId: string;
          authorizationVersion: number;
          role: 'SUPER_ADMIN';
          sessionId: string;
        },
        action: string,
      ): AdminC1HttpError;
    };
    const enriched = enrich.withSessionAudit(
      original,
      {
        adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authorizationVersion: 1,
        role: 'SUPER_ADMIN',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      'ADMIN_SESSION_STEP_UP_REJECTED',
    );

    expect(enriched).toMatchObject({
      auditAction: 'ORIGINAL_ACTION',
      auditRecorded: true,
      code: 'RATE_LIMITED',
      details: { reason: 'RATE_LIMITED', retryAfterSeconds: 17 },
      retryAfterSeconds: 17,
      status: 429,
    });
    expect(enriched.auditContext).toMatchObject({
      action: 'ADMIN_SESSION_STEP_UP_REJECTED',
      actorAdminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      adminSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      subjectAdminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });
});
