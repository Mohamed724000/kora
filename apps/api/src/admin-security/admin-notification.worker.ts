import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import {
  ADMIN_NOTIFICATION_PORT,
  type AdminNotificationDeliveryResult,
  type AdminNotificationPort,
} from './admin-notification.port';
import {
  ADMIN_SECURITY_CRYPTO,
  AdminSecurityCryptoError,
  AdminSecurityOutboxKeyringUnavailableError,
} from './admin-security.crypto';
import type { AdminSecurityCrypto } from './admin-security.crypto';
import {
  AdminSecurityRepository,
  type AdminNotificationOutboxRecord,
} from './admin-security.repository';

export const ADMIN_NOTIFICATION_POLICY = Object.freeze({
  backoffMs: [30_000, 120_000, 600_000, 1_800_000] as const,
  leaseMs: 60_000,
  maximumAttempts: 5,
  providerDeadlineMs: 10_000,
  wakeupDeadlineMs: 1_000,
});

export const ADMIN_NOTIFICATION_WAKEUP_QUEUE = 'admin-c2a-notification-wakeup';
export const ADMIN_NOTIFICATION_WAKEUP = Symbol('ADMIN_NOTIFICATION_WAKEUP');

export interface AdminNotificationWakeupPort {
  notify(opaqueSignalId: string): Promise<boolean>;
}

@Injectable()
export class AdminNotificationActivationGate {
  private active = false;

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}

interface AdminNotificationWakeupJob {
  readonly opaqueSignalId: string;
}

function isOpaqueIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

@Injectable()
export class BullAdminNotificationWakeup implements AdminNotificationWakeupPort {
  constructor(
    @InjectQueue(ADMIN_NOTIFICATION_WAKEUP_QUEUE)
    private readonly queue: Queue<AdminNotificationWakeupJob>,
  ) {}

  async notify(opaqueSignalId: string): Promise<boolean> {
    if (!isOpaqueIdentifier(opaqueSignalId)) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const addition = this.queue
        .add(
          'wake',
          { opaqueSignalId },
          {
            jobId: hash(`KORA_ADMIN_NOTIFICATION_WAKEUP_V1\0${opaqueSignalId}`),
            removeOnComplete: true,
            removeOnFail: true,
          },
        )
        .then(
          () => true,
          () => false,
        );
      const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), ADMIN_NOTIFICATION_POLICY.wakeupDeadlineMs);
      });
      return await Promise.race([addition, timeout]);
    } catch {
      return false;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

export type AdminNotificationProcessingResult =
  'IDLE' | 'DELIVERED' | 'RETRY_SCHEDULED' | 'FAILED' | 'DELIVERY_UNCERTAIN' | 'STALE_FENCE';

export type AdminRunnerQuiescence = 'QUIESCED' | 'FAILED' | 'TIMEOUT';

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

@Injectable()
export class AdminNotificationWorker {
  private active: Promise<AdminNotificationProcessingResult> | undefined;
  private lastActiveFailed = false;

  constructor(
    @Inject(AdminSecurityRepository) private readonly repository: AdminSecurityRepository,
    @Inject(ADMIN_SECURITY_CRYPTO) private readonly crypto: AdminSecurityCrypto,
    @Inject(ADMIN_NOTIFICATION_PORT) private readonly port: AdminNotificationPort,
  ) {}

  async assertReady(): Promise<void> {
    await Promise.all([this.port.assertConfigured(), this.crypto.assertOutboxAvailable()]);
  }

  processOne(now = new Date()): Promise<AdminNotificationProcessingResult> {
    if (this.active === undefined) {
      this.lastActiveFailed = false;
      this.active = this.performOne(now)
        .catch((error: unknown) => {
          this.lastActiveFailed = true;
          throw error;
        })
        .finally(() => {
          this.active = undefined;
        });
    }
    return this.active;
  }

  async awaitQuiescence(timeoutMs = 30_000): Promise<AdminRunnerQuiescence> {
    const active = this.active;
    if (active === undefined) {
      if (this.lastActiveFailed) {
        this.lastActiveFailed = false;
        return 'FAILED';
      }
      return 'QUIESCED';
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'TIMEOUT'>((resolve) => {
      timer = setTimeout(() => resolve('TIMEOUT'), timeoutMs);
    });
    try {
      const outcome = await Promise.race([
        active.then(
          () => 'QUIESCED' as const,
          () => 'FAILED' as const,
        ),
        timeout,
      ]);
      if (outcome === 'FAILED') this.lastActiveFailed = false;
      return outcome;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async performOne(now: Date): Promise<AdminNotificationProcessingResult> {
    const ownerHash = hash(`KORA_ADMIN_NOTIFICATION_WORKER_V1\0${randomUUID()}`);
    const claimed = await this.repository.transaction(async (transaction) => {
      await transaction.terminalizeExpiredNotificationClaims(now);
      return transaction.claimNextNotification(
        ownerHash,
        now,
        new Date(now.getTime() + ADMIN_NOTIFICATION_POLICY.leaseMs),
      );
    });
    if (claimed === undefined) return 'IDLE';

    let payload: Readonly<Record<string, string>>;
    try {
      payload = await this.crypto.decryptOutboxPayloadRecord(
        {
          generation: 1,
          logicalDeliveryId: claimed.id,
          outboxId: claimed.id,
          purpose: claimed.purpose,
          sourceId:
            claimed.purpose === 'PASSWORD_RESET'
              ? claimed.sourceSecurityEventId!
              : claimed.sourceAuditLogId!,
        },
        {
          aadHash: claimed.aadHash,
          encryptedPayload: claimed.encryptedPayload,
          encryptionKeyId: claimed.encryptionKeyId,
          encryptionNonce: claimed.encryptionNonce,
          encryptionTag: claimed.encryptionTag,
        },
      );
    } catch (error: unknown) {
      if (
        error instanceof AdminSecurityCryptoError ||
        error instanceof AdminSecurityOutboxKeyringUnavailableError
      ) {
        return this.retryOrFail(claimed, ownerHash);
      }
      throw error;
    }

    let result: AdminNotificationDeliveryResult;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('notification deadline'));
        }, ADMIN_NOTIFICATION_POLICY.providerDeadlineMs);
      });
      result = await Promise.race([
        this.port.deliver({
          logicalDeliveryId: claimed.id,
          payload,
          purpose: claimed.purpose,
          signal: controller.signal,
        }),
        deadline,
      ]);
    } catch {
      return this.finish(claimed, ownerHash, new Date(), 'DELIVERY_UNCERTAIN');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    if (result.kind === 'ACCEPTED') {
      if (result.acknowledgement.length < 1 || result.acknowledgement.length > 4096) {
        return this.finish(claimed, ownerHash, new Date(), 'DELIVERY_UNCERTAIN');
      }
      return this.finish(
        claimed,
        ownerHash,
        new Date(),
        'DELIVERED',
        hash(`KORA_ADMIN_NOTIFICATION_ACK_V1\0${claimed.id}\0${result.acknowledgement}`),
      );
    }
    if (result.kind === 'ACKNOWLEDGEMENT_UNUSABLE') {
      return this.finish(claimed, ownerHash, new Date(), 'DELIVERY_UNCERTAIN');
    }
    if (!result.retryable) return this.finish(claimed, ownerHash, new Date(), 'FAILED');
    return this.retryOrFail(claimed, ownerHash);
  }

  private async retryOrFail(
    claimed: AdminNotificationOutboxRecord,
    ownerHash: string,
  ): Promise<AdminNotificationProcessingResult> {
    const completedAt = new Date();
    if (claimed.attemptCount >= ADMIN_NOTIFICATION_POLICY.maximumAttempts) {
      return this.finish(claimed, ownerHash, completedAt, 'FAILED');
    }
    const delay = ADMIN_NOTIFICATION_POLICY.backoffMs[claimed.attemptCount - 1];
    if (delay === undefined) return this.finish(claimed, ownerHash, completedAt, 'FAILED');
    return this.finish(
      claimed,
      ownerHash,
      completedAt,
      'PENDING',
      undefined,
      new Date(completedAt.getTime() + delay),
    );
  }

  private async finish(
    claimed: AdminNotificationOutboxRecord,
    ownerHash: string,
    now: Date,
    state: 'DELIVERED' | 'FAILED' | 'DELIVERY_UNCERTAIN' | 'PENDING',
    acknowledgementHash?: string,
    nextAttemptAt?: Date,
  ): Promise<AdminNotificationProcessingResult> {
    const changed = await this.repository.transaction((transaction) =>
      transaction.finishNotification({
        ...(acknowledgementHash === undefined ? {} : { acknowledgementHash }),
        ...(claimed.delegatedByAdminUserId === null
          ? {}
          : { delegatedByAdminUserId: claimed.delegatedByAdminUserId }),
        generation: claimed.generation,
        id: claimed.id,
        ...(nextAttemptAt === undefined ? {} : { nextAttemptAt }),
        now,
        ownerHash,
        state,
      }),
    );
    if (!changed) return 'STALE_FENCE';
    if (state === 'PENDING') return 'RETRY_SCHEDULED';
    return state;
  }
}

@Processor(ADMIN_NOTIFICATION_WAKEUP_QUEUE, { concurrency: 1 })
export class AdminNotificationWakeupProcessor extends WorkerHost {
  private processedSignals = 0;

  constructor(
    @Inject(AdminNotificationWorker) private readonly notifications: AdminNotificationWorker,
    @Inject(ADMIN_NOTIFICATION_WAKEUP)
    private readonly wakeup: AdminNotificationWakeupPort,
    @Inject(AdminNotificationActivationGate)
    private readonly activation: AdminNotificationActivationGate,
  ) {
    super();
  }

  async process(job: Job<AdminNotificationWakeupJob>): Promise<void> {
    if (
      job.name !== 'wake' ||
      job.data === null ||
      typeof job.data !== 'object' ||
      JSON.stringify(Object.keys(job.data).sort()) !== '["opaqueSignalId"]' ||
      !isOpaqueIdentifier(job.data.opaqueSignalId)
    ) {
      throw new Error('Invalid C2a notification wake-up job.');
    }
    if (!this.activation.isActive()) return;
    this.processedSignals += 1;
    const result = await this.notifications.processOne();
    if (result !== 'IDLE') {
      await this.wakeup.notify(randomUUID());
    }
  }

  processedSignalCount(): number {
    return this.processedSignals;
  }
}
