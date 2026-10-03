import { AdminC1HttpError } from './admin-session.service';
import { parseReason } from './admin-auth.controller';
import {
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
});
