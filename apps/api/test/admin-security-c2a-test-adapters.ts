import { TestEphemeralAdminKeyProvider } from '../src/admin-auth/admin-key-provider';
import {
  AdminNotificationUnavailableError,
  type AdminNotificationDelivery,
  type AdminNotificationDeliveryResult,
  type AdminNotificationPort,
  type AdminNotificationPurpose,
} from '../src/admin-security/admin-notification.port';
import {
  AdminPasswordCompromiseUnavailableError,
  type AdminPasswordCompromisePort,
  type AdminPasswordCompromiseResult,
} from '../src/admin-security/admin-password-compromise.port';
import { TestAdminSecurityOutboxKeyring } from '../src/admin-security/admin-security.crypto';

export interface TestAdminNotificationAcceptance {
  readonly acknowledgement: string;
  readonly logicalDeliveryId: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly purpose: AdminNotificationPurpose;
  readonly simulatedEvent: 'PROVIDER_ACCEPTED_FOR_TEST';
}

export class DeterministicAdminNotificationPort implements AdminNotificationPort {
  private readonly accepted = new Map<string, TestAdminNotificationAcceptance>();
  private available = true;

  async assertConfigured(): Promise<void> {
    if (!this.available) throw new AdminNotificationUnavailableError();
  }

  async deliver(delivery: AdminNotificationDelivery): Promise<AdminNotificationDeliveryResult> {
    await this.assertConfigured();
    if (delivery.signal.aborted) return { kind: 'NOT_ACCEPTED', retryable: false };
    const existing = this.accepted.get(delivery.logicalDeliveryId);
    if (existing !== undefined) {
      return { acknowledgement: existing.acknowledgement, kind: 'ACCEPTED' };
    }
    const acknowledgement = `test-accepted-${delivery.logicalDeliveryId}`;
    this.accepted.set(delivery.logicalDeliveryId, {
      acknowledgement,
      logicalDeliveryId: delivery.logicalDeliveryId,
      payload: { ...delivery.payload },
      purpose: delivery.purpose,
      simulatedEvent: 'PROVIDER_ACCEPTED_FOR_TEST',
    });
    return { acknowledgement, kind: 'ACCEPTED' };
  }

  async reconcile(logicalDeliveryId: string): Promise<'ACCEPTED' | 'NOT_FOUND'> {
    return this.accepted.has(logicalDeliveryId) ? 'ACCEPTED' : 'NOT_FOUND';
  }

  acceptedDeliveries(): readonly TestAdminNotificationAcceptance[] {
    return [...this.accepted.values()].map((delivery) => ({
      ...delivery,
      payload: { ...delivery.payload },
    }));
  }

  reset(): void {
    this.accepted.clear();
    this.available = true;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }
}

export class DeterministicAdminPasswordCompromisePort implements AdminPasswordCompromisePort {
  private available = true;
  private readonly compromised = new Set<string>();

  async checkPassword(
    passwordUtf8: string,
    options: Readonly<{ signal: AbortSignal; timeoutMs: 3000 }>,
  ): Promise<AdminPasswordCompromiseResult> {
    if (!this.available || options.signal.aborted) {
      throw new AdminPasswordCompromiseUnavailableError();
    }
    return this.compromised.has(passwordUtf8) ? 'COMPROMISED' : 'SAFE';
  }

  markCompromised(passwordUtf8: string): void {
    this.compromised.add(passwordUtf8);
  }

  reset(): void {
    this.available = true;
    this.compromised.clear();
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }
}

export interface AdminSecurityC2aTestAdapters {
  readonly adminKeyProvider: TestEphemeralAdminKeyProvider;
  readonly notificationPort: DeterministicAdminNotificationPort;
  readonly outboxKeyring: TestAdminSecurityOutboxKeyring;
  readonly passwordCompromisePort: DeterministicAdminPasswordCompromisePort;
}

export function createAdminSecurityC2aTestAdapters(): AdminSecurityC2aTestAdapters {
  return {
    adminKeyProvider: new TestEphemeralAdminKeyProvider(),
    notificationPort: new DeterministicAdminNotificationPort(),
    outboxKeyring: new TestAdminSecurityOutboxKeyring(),
    passwordCompromisePort: new DeterministicAdminPasswordCompromisePort(),
  };
}
