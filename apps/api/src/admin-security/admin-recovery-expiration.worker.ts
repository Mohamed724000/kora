import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AdminRunnerQuiescence } from './admin-notification.worker';
import { AdminSecurityRepository } from './admin-security.repository';

export const ADMIN_RECOVERY_EXPIRATION_POLICY = Object.freeze({
  batchSize: 100,
  intervalMs: 60_000,
  readinessStaleMs: 180_000,
  shutdownMs: 30_000,
});

export interface AdminRecoveryExpirationScanResult {
  readonly expired: number;
  readonly inspected: number;
  readonly lostRaces: number;
  readonly performed: boolean;
}

interface ProcessSignalSource {
  once(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  removeListener(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

export class AdminRecoveryExpirationStopSignal {
  private readonly completion: Promise<void>;
  private resolveCompletion: (() => void) | undefined;
  private stoppedValue = false;
  private readonly source: ProcessSignalSource;

  constructor(source: ProcessSignalSource = process) {
    this.source = source;
    this.completion = new Promise<void>((resolve) => {
      this.resolveCompletion = resolve;
    });
    source.once('SIGINT', this.stop);
    source.once('SIGTERM', this.stop);
  }

  readonly stop = (): void => {
    if (this.stoppedValue) return;
    this.stoppedValue = true;
    this.resolveCompletion?.();
  };

  get stopped(): boolean {
    return this.stoppedValue;
  }

  wait(): Promise<void> {
    return this.completion;
  }

  dispose(): void {
    this.source.removeListener('SIGINT', this.stop);
    this.source.removeListener('SIGTERM', this.stop);
  }
}

export async function runAdminRecoveryExpirationLoop(
  worker: AdminRecoveryExpirationWorker,
  stopSignal: AdminRecoveryExpirationStopSignal,
): Promise<void> {
  while (!stopSignal.stopped) {
    const outcome = await Promise.race([
      worker.scanOnce().then(() => 'SCAN_COMPLETED' as const),
      stopSignal.wait().then(() => 'STOPPED' as const),
    ]);
    if (outcome === 'STOPPED' || stopSignal.stopped) return;
    let intervalTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = new Promise<void>((resolve) => {
      intervalTimer = setTimeout(resolve, ADMIN_RECOVERY_EXPIRATION_POLICY.intervalMs);
    });
    try {
      await Promise.race([interval, stopSignal.wait()]);
    } finally {
      if (intervalTimer !== undefined) clearTimeout(intervalTimer);
    }
  }
}

function executionHash(caseId: string, generation: number): string {
  return createHash('sha256')
    .update(`KORA_ADMIN_RECOVERY_EXPIRATION_V1\0${caseId}\0${generation}`, 'utf8')
    .digest('hex');
}

@Injectable()
export class AdminRecoveryExpirationWorker {
  private activeScan: Promise<AdminRecoveryExpirationScanResult> | undefined;
  private lastActiveScanFailed = false;
  private lastSuccessfulFullScanAt: Date | undefined;

  constructor(
    @Inject(AdminSecurityRepository) private readonly repository: AdminSecurityRepository,
  ) {}

  scanOnce(now = new Date()): Promise<AdminRecoveryExpirationScanResult> {
    if (this.activeScan === undefined) {
      this.lastActiveScanFailed = false;
      this.activeScan = this.performScan(now)
        .catch((error: unknown) => {
          this.lastActiveScanFailed = true;
          throw error;
        })
        .finally(() => {
          this.activeScan = undefined;
        });
    }
    return this.activeScan;
  }

  isReady(now = new Date()): boolean {
    return (
      this.lastSuccessfulFullScanAt !== undefined &&
      now.getTime() - this.lastSuccessfulFullScanAt.getTime() <=
        ADMIN_RECOVERY_EXPIRATION_POLICY.readinessStaleMs
    );
  }

  async awaitQuiescence(
    timeoutMs: number = ADMIN_RECOVERY_EXPIRATION_POLICY.shutdownMs,
  ): Promise<AdminRunnerQuiescence> {
    const active = this.activeScan;
    if (active === undefined) {
      if (this.lastActiveScanFailed) {
        this.lastActiveScanFailed = false;
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
      if (outcome === 'FAILED') this.lastActiveScanFailed = false;
      return outcome;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async performScan(now: Date): Promise<AdminRecoveryExpirationScanResult> {
    const result = await this.repository.transaction(async (transaction) => {
      if (!(await transaction.tryAcquireRecoveryExpirationSingleton())) {
        return { expired: 0, inspected: 0, lostRaces: 0, performed: false };
      }
      const due = await transaction.lockDueRecoveryCases(
        now,
        ADMIN_RECOVERY_EXPIRATION_POLICY.batchSize,
      );
      let expired = 0;
      for (const recoveryCase of due) {
        const changed = await transaction.expireRecoveryCase(
          recoveryCase,
          executionHash(recoveryCase.id, recoveryCase.stateGeneration + 1),
          randomUUID(),
          now,
        );
        if (changed) expired += 1;
      }
      return {
        expired,
        inspected: due.length,
        lostRaces: due.length - expired,
        performed: true,
      };
    });
    if (result.performed) this.lastSuccessfulFullScanAt = now;
    return result;
  }
}
