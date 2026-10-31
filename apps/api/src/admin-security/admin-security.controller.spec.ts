import type { ServerResponse } from 'node:http';
import { resolveAdminClientProvenance } from '../admin-auth/admin-client-provenance';
import {
  AdminRequestPolicyError,
  type AdminRequestPolicy,
} from '../admin-auth/admin-request-policy';
import type { RequestWithId } from '../observability/http-logger';
import type { AdminC2HttpError } from './admin-security.errors';
import { AdminSecurityController } from './admin-security.controller';
import type { AdminSecurityService } from './admin-security.service';

function request(id = 'request-c2a-unit'): RequestWithId {
  const candidate = {
    id,
    headers: {},
    rawHeaders: [],
    socket: { remoteAddress: '192.0.2.10' },
  } as unknown as RequestWithId;
  resolveAdminClientProvenance(candidate, { mode: 'DIRECT' });
  return candidate;
}

describe('AdminSecurityController', () => {
  it('applique la policy publique avant de déléguer une demande de reset canonique', async () => {
    const order: string[] = [];
    const service = {
      requestPasswordReset: vi.fn(async () => {
        order.push('service');
      }),
    } as unknown as AdminSecurityService;
    const policy = {
      assertLoginRequest: vi.fn(() => {
        order.push('policy');
      }),
    } as unknown as AdminRequestPolicy;
    const controller = new AdminSecurityController(service, policy);

    await expect(
      controller.requestPasswordReset(
        { email: 'ADMIN@EXAMPLE.INVALID' },
        { origin: 'https://admin.kora.invalid' },
        request(),
      ),
    ).resolves.toEqual({
      data: { accepted: true },
      meta: { requestId: 'request-c2a-unit' },
    });
    expect(order).toEqual(['policy', 'service']);
    expect(service.requestPasswordReset).toHaveBeenCalledExactlyOnceWith(
      {
        deliveryEmail: 'ADMIN@EXAMPLE.INVALID',
        emailCanonical: 'admin@example.invalid',
      },
      { ipAddress: '192.0.2.10', requestId: 'request-c2a-unit' },
    );
  });

  it('transmet exactement idempotence, bearer et projection pour une invitation', async () => {
    const result = {
      email: 'invitee@example.invalid',
      expiresAt: '2026-10-17T10:00:00.000Z',
      invitationId: '11111111-1111-4111-8111-111111111111',
      role: 'SUPPORT' as const,
      status: 'PENDING' as const,
    };
    const service = {
      createInvitation: vi.fn().mockResolvedValue(result),
    } as unknown as AdminSecurityService;
    const policy = {
      assertMutationRequest: vi.fn(),
    } as unknown as AdminRequestPolicy;
    const response = {
      setHeader: vi.fn(),
      statusCode: 0,
    } as unknown as ServerResponse;
    const controller = new AdminSecurityController(service, policy);

    await expect(
      controller.createInvitation(
        {
          email: 'INVITEE@EXAMPLE.INVALID',
          operatorReason: 'approved onboarding',
          reasonCode: 'INVITATION_ADMINISTRATION',
          role: 'SUPPORT',
        },
        {
          authorization: `Bearer ${'a'.repeat(32)}`,
          'idempotency-key': 'invite-idempotency-0001',
        },
        request('request-invitation'),
        response,
      ),
    ).resolves.toEqual({ data: result, meta: { requestId: 'request-invitation' } });
    expect(policy.assertMutationRequest).toHaveBeenCalledTimes(1);
    expect(service.createInvitation).toHaveBeenCalledExactlyOnceWith(
      `Bearer ${'a'.repeat(32)}`,
      'invite-idempotency-0001',
      {
        deliveryEmail: 'INVITEE@EXAMPLE.INVALID',
        emailCanonical: 'invitee@example.invalid',
        operatorReason: 'approved onboarding',
        reasonCode: 'INVITATION_ADMINISTRATION',
        role: 'SUPPORT',
      },
      { requestId: 'request-invitation' },
    );
    expect(response.statusCode).toBe(201);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      `/api/v1/admin/invitations/${result.invitationId}`,
    );
  });

  it('mappe un refus de policy sur l’opération C2a exacte avant tout appel service', async () => {
    const service = {
      approveRecoveryCase: vi.fn(),
    } as unknown as AdminSecurityService;
    const policy = {
      assertMutationRequest: vi.fn(() => {
        throw new AdminRequestPolicyError('FORBIDDEN');
      }),
    } as unknown as AdminRequestPolicy;
    const controller = new AdminSecurityController(service, policy);

    await expect(
      controller.approveRecoveryCase(
        '11111111-1111-4111-8111-111111111111',
        { operatorReason: 'security response', reasonCode: 'SECURITY_RESPONSE' },
        {},
        request(),
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      disposition: 'RECORD_SECURITY_EVENT',
      operationId: 'approveAdminRecoveryCase',
    } satisfies Partial<AdminC2HttpError>);
    expect(service.approveRecoveryCase).not.toHaveBeenCalled();
  });

  it('applique pagination bornée et bearer à la liste des utilisateurs', async () => {
    const page = { data: [], meta: { hasMore: false, nextCursor: null } };
    const service = {
      listUsers: vi.fn().mockResolvedValue(page),
    } as unknown as AdminSecurityService;
    const controller = new AdminSecurityController(service, {} as AdminRequestPolicy);

    await expect(
      controller.listUsers(
        { authorization: `Bearer ${'b'.repeat(32)}` },
        undefined,
        '50',
        request('request-list'),
      ),
    ).resolves.toEqual({
      data: [],
      meta: { hasMore: false, nextCursor: null, requestId: 'request-list' },
    });
    expect(service.listUsers).toHaveBeenCalledExactlyOnceWith(`Bearer ${'b'.repeat(32)}`, {
      limit: 50,
    });
  });
});
