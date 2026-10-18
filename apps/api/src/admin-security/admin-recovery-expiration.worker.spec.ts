import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { AdminC2aBoundariesService } from '../database/admin-c2a-boundaries.service';
import { runAdminRecoveryExpirationMain } from './admin-recovery-expiration.main';
import {
  ADMIN_RECOVERY_EXPIRATION_POLICY,
  AdminRecoveryExpirationStopSignal,
  AdminRecoveryExpirationWorker,
  runAdminRecoveryExpirationLoop,
  type AdminRecoveryExpirationScanResult,
} from './admin-recovery-expiration.worker';
import type {
  AdminRecoveryCaseRecord,
  AdminSecurityRepository,
  AdminSecurityTransactionRepository,
} from './admin-security.repository';

function recoveryCase(id: string, generation: number): AdminRecoveryCaseRecord {
  return {
    approverAdminUserId: null,
    cancelledAt: null,
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
    creatorAdminUserId: 'creator',
    expiresAt: new Date('2026-10-16T09:00:00.000Z'),
    id,
    state: 'PENDING',
    stateGeneration: generation,
    subjectAdminUserId: 'subject',
  };
}

describe('AdminRecoveryExpirationWorker', () => {
  it('expires a bounded locked batch and records lost CAS races', async () => {
    const now = new Date('2026-10-16T10:00:00.000Z');
    const due = [recoveryCase('case-1', 4), recoveryCase('case-2', 8)];
    const lockDueRecoveryCases = vi.fn().mockResolvedValue(due);
    const expireRecoveryCase = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const repository = {
      transaction: vi.fn(
        async <T>(
          callback: (value: AdminSecurityTransactionRepository) => Promise<T>,
        ): Promise<T> =>
          callback({
            expireRecoveryCase,
            lockDueRecoveryCases,
            tryAcquireRecoveryExpirationSingleton: vi.fn().mockResolvedValue(true),
          } as unknown as AdminSecurityTransactionRepository),
      ),
    } as unknown as AdminSecurityRepository;
    const worker = new AdminRecoveryExpirationWorker(repository);

    await expect(worker.scanOnce(now)).resolves.toEqual({
      expired: 1,
      inspected: 2,
      lostRaces: 1,
      performed: true,
    });
    expect(lockDueRecoveryCases).toHaveBeenCalledWith(
      now,
      ADMIN_RECOVERY_EXPIRATION_POLICY.batchSize,
    );
    expect(expireRecoveryCase).toHaveBeenNthCalledWith(
      1,
      due[0],
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.any(String),
      now,
    );
    expect(worker.isReady(now)).toBe(true);
    expect(
      worker.isReady(
        new Date(now.getTime() + ADMIN_RECOVERY_EXPIRATION_POLICY.readinessStaleMs + 1),
      ),
    ).toBe(false);
  });

  it('does not scan or become ready when another process owns the PostgreSQL singleton', async () => {
    const lockDueRecoveryCases = vi.fn();
    const repository = {
      transaction: vi.fn(
        async <T>(
          callback: (value: AdminSecurityTransactionRepository) => Promise<T>,
        ): Promise<T> =>
          callback({
            lockDueRecoveryCases,
            tryAcquireRecoveryExpirationSingleton: vi.fn().mockResolvedValue(false),
          } as unknown as AdminSecurityTransactionRepository),
      ),
    } as unknown as AdminSecurityRepository;
    const worker = new AdminRecoveryExpirationWorker(repository);
    await expect(worker.scanOnce()).resolves.toEqual({
      expired: 0,
      inspected: 0,
      lostRaces: 0,
      performed: false,
    });
    expect(lockDueRecoveryCases).not.toHaveBeenCalled();
    expect(worker.isReady()).toBe(false);
  });

  it('serializes scans per process and does not mark a failed scan ready', async () => {
    let rejectScan: ((error: Error) => void) | undefined;
    const pending = new Promise<never>((_resolve, reject) => {
      rejectScan = reject;
    });
    const transaction = vi.fn().mockReturnValue(pending);
    const worker = new AdminRecoveryExpirationWorker({
      transaction,
    } as unknown as AdminSecurityRepository);
    const first = worker.scanOnce();
    const second = worker.scanOnce();
    expect(second).toBe(first);
    const quiescence = worker.awaitQuiescence(30_000);
    rejectScan?.(new Error('database unavailable'));
    await expect(first).rejects.toThrow('database unavailable');
    await expect(quiescence).resolves.toBe('FAILED');
    expect(worker.isReady()).toBe(false);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('leaves a non-settling scan immediately on a process stop and bounds quiescence', async () => {
    const source = {
      listeners: new Map<string, () => void>(),
      once(event: string, listener: () => void): void {
        this.listeners.set(event, listener);
      },
      removeListener(event: string): void {
        this.listeners.delete(event);
      },
    };
    const transaction = vi.fn(() => new Promise(() => undefined));
    const worker = new AdminRecoveryExpirationWorker({
      transaction,
    } as unknown as AdminSecurityRepository);
    const stop = new AdminRecoveryExpirationStopSignal(source);
    const running = runAdminRecoveryExpirationLoop(worker, stop);
    await vi.waitFor(() => expect(transaction).toHaveBeenCalledOnce());
    source.listeners.get('SIGTERM')?.();
    await expect(running).resolves.toBeUndefined();
    await expect(worker.awaitQuiescence(5)).resolves.toBe('TIMEOUT');
    stop.dispose();
    expect(source.listeners.size).toBe(0);
  });

  it('cancels the 60 second interval timer when the process stops between scans', async () => {
    vi.useFakeTimers();
    try {
      const source = {
        listeners: new Map<string, () => void>(),
        once(event: string, listener: () => void): void {
          this.listeners.set(event, listener);
        },
        removeListener(event: string): void {
          this.listeners.delete(event);
        },
      };
      const scanOnce = vi.fn().mockResolvedValue({
        expired: 0,
        inspected: 0,
        lostRaces: 0,
        performed: true,
      });
      const stop = new AdminRecoveryExpirationStopSignal(source);
      const running = runAdminRecoveryExpirationLoop({ scanOnce } as never, stop);
      await vi.advanceTimersByTimeAsync(0);
      expect(scanOnce).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(1);
      source.listeners.get('SIGTERM')?.();
      await expect(running).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
      stop.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears its quiescence timer when an active scan finishes before the deadline', async () => {
    vi.useFakeTimers();
    try {
      let resolveScan: ((value: AdminRecoveryExpirationScanResult) => void) | undefined;
      const worker = new AdminRecoveryExpirationWorker({
        transaction: vi.fn(
          () =>
            new Promise<AdminRecoveryExpirationScanResult>((resolve) => {
              resolveScan = resolve;
            }),
        ),
      } as unknown as AdminSecurityRepository);
      const scan = worker.scanOnce();
      const quiescence = worker.awaitQuiescence(30_000);
      resolveScan?.({ expired: 0, inspected: 0, lostRaces: 0, performed: true });
      await expect(scan).resolves.toEqual({
        expired: 0,
        inspected: 0,
        lostRaces: 0,
        performed: true,
      });
      await expect(quiescence).resolves.toBe('QUIESCED');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs the full lifecycle harness to forced exit within the shared shutdown budget', async () => {
    vi.useFakeTimers();
    try {
      const source = {
        listeners: new Map<string, () => void>(),
        once(event: string, listener: () => void): void {
          this.listeners.set(event, listener);
        },
        removeListener(event: string): void {
          this.listeners.delete(event);
        },
      };
      const transaction = vi.fn(() => new Promise(() => undefined));
      const worker = new AdminRecoveryExpirationWorker({
        transaction,
      } as unknown as AdminSecurityRepository);
      const stopSignal = new AdminRecoveryExpirationStopSignal(source);
      const close = vi.fn().mockResolvedValue(undefined);
      const application = {
        close,
        get<T>(token: unknown): T {
          if (token === ConfigService) {
            return { get: () => ({ enabled: true, profile: 'EXPIRATION' }) } as T;
          }
          if (token === AdminC2aBoundariesService) {
            return { assertIdentity: vi.fn().mockResolvedValue(undefined) } as T;
          }
          if (token === AdminRecoveryExpirationWorker) return worker as T;
          throw new Error('Unexpected lifecycle harness token.');
        },
      };
      const running = runAdminRecoveryExpirationMain({
        createApplicationContext: vi.fn().mockResolvedValue(application),
        shutdownMs: 50,
        stopSignal,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(transaction).toHaveBeenCalledOnce();
      source.listeners.get('SIGTERM')?.();
      await vi.advanceTimersByTimeAsync(50);
      await expect(running).resolves.toEqual({ failed: true, forceExit: true });
      expect(close).toHaveBeenCalledOnce();
      expect(source.listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps cleanup active and returns failure when the in-flight scan rejects after stop', async () => {
    vi.useFakeTimers();
    try {
      const source = {
        listeners: new Map<string, () => void>(),
        once(event: string, listener: () => void): void {
          this.listeners.set(event, listener);
        },
        removeListener(event: string): void {
          this.listeners.delete(event);
        },
      };
      let rejectScan: ((error: Error) => void) | undefined;
      const transaction = vi.fn(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectScan = reject;
          }),
      );
      const worker = new AdminRecoveryExpirationWorker({
        transaction,
      } as unknown as AdminSecurityRepository);
      const stopSignal = new AdminRecoveryExpirationStopSignal(source);
      const close = vi.fn().mockResolvedValue(undefined);
      const application = {
        close,
        get<T>(token: unknown): T {
          if (token === ConfigService) {
            return { get: () => ({ enabled: true, profile: 'EXPIRATION' }) } as T;
          }
          if (token === AdminC2aBoundariesService) {
            return { assertIdentity: vi.fn().mockResolvedValue(undefined) } as T;
          }
          if (token === AdminRecoveryExpirationWorker) return worker as T;
          throw new Error('Unexpected lifecycle harness token.');
        },
      };
      const running = runAdminRecoveryExpirationMain({
        createApplicationContext: vi.fn().mockResolvedValue(application),
        shutdownMs: 50,
        stopSignal,
      });
      await vi.advanceTimersByTimeAsync(0);
      source.listeners.get('SIGTERM')?.();
      rejectScan?.(new Error('controlled post-signal failure'));
      await vi.advanceTimersByTimeAsync(0);
      await expect(running).resolves.toEqual({ failed: true, forceExit: false });
      expect(close).toHaveBeenCalledOnce();
      expect(source.listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops exactly at the 180 second readiness deadline and clears the readiness timer', async () => {
    vi.useFakeTimers();
    try {
      const source = {
        listeners: new Map<string, () => void>(),
        once(event: string, listener: () => void): void {
          this.listeners.set(event, listener);
        },
        removeListener(event: string): void {
          this.listeners.delete(event);
        },
      };
      const stopSignal = new AdminRecoveryExpirationStopSignal(source);
      const worker = {
        awaitQuiescence: vi.fn().mockResolvedValue('QUIESCED'),
        isReady: vi.fn().mockReturnValue(false),
        scanOnce: vi.fn().mockResolvedValue({
          expired: 0,
          inspected: 0,
          lostRaces: 0,
          performed: false,
        }),
      };
      const close = vi.fn(() => new Promise<void>(() => undefined));
      const clearReadinessInterval = vi.fn((timer: ReturnType<typeof setInterval>) => {
        clearInterval(timer);
      });
      const application = {
        close,
        get<T>(token: unknown): T {
          if (token === ConfigService) {
            return { get: () => ({ enabled: true, profile: 'EXPIRATION' }) } as T;
          }
          if (token === AdminC2aBoundariesService) {
            return { assertIdentity: vi.fn().mockResolvedValue(undefined) } as T;
          }
          if (token === AdminRecoveryExpirationWorker) return worker as T;
          throw new Error('Unexpected readiness harness token.');
        },
      };
      const running = runAdminRecoveryExpirationMain({
        clearReadinessInterval,
        createApplicationContext: vi.fn().mockResolvedValue(application),
        now: Date.now,
        shutdownMs: 50,
        stopSignal,
      });

      await vi.advanceTimersByTimeAsync(ADMIN_RECOVERY_EXPIRATION_POLICY.readinessStaleMs - 1);
      expect(stopSignal.stopped).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(stopSignal.stopped).toBe(true);
      expect(close).toHaveBeenCalledOnce();
      expect(clearReadinessInterval).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(ADMIN_RECOVERY_EXPIRATION_POLICY.shutdownMs);
      await expect(running).resolves.toEqual({ failed: true, forceExit: true });
      expect(source.listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
