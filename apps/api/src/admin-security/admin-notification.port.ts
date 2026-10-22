export const ADMIN_NOTIFICATION_PORT = Symbol('ADMIN_NOTIFICATION_PORT');

export type AdminNotificationPurpose = 'PASSWORD_RESET' | 'INVITATION';

export interface AdminNotificationDelivery {
  readonly logicalDeliveryId: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly purpose: AdminNotificationPurpose;
  readonly signal: AbortSignal;
}

export type AdminNotificationDeliveryResult =
  | { readonly kind: 'ACCEPTED'; readonly acknowledgement: string }
  | { readonly kind: 'NOT_ACCEPTED'; readonly retryable: boolean }
  | { readonly kind: 'ACKNOWLEDGEMENT_UNUSABLE' };

export interface AdminNotificationPort {
  assertConfigured(): Promise<void>;
  deliver(delivery: AdminNotificationDelivery): Promise<AdminNotificationDeliveryResult>;
  reconcile(
    logicalDeliveryId: string,
    signal: AbortSignal,
  ): Promise<'ACCEPTED' | 'NOT_FOUND' | 'UNKNOWN'>;
}

export class AdminNotificationUnavailableError extends Error {
  constructor() {
    super('Admin notification capability is unavailable.');
    this.name = 'AdminNotificationUnavailableError';
  }
}

export class UnavailableAdminNotificationPort implements AdminNotificationPort {
  async assertConfigured(): Promise<never> {
    throw new AdminNotificationUnavailableError();
  }

  async deliver(): Promise<never> {
    throw new AdminNotificationUnavailableError();
  }

  async reconcile(): Promise<'UNKNOWN'> {
    return 'UNKNOWN';
  }
}
