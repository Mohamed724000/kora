import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { runAdminAuditExportMain } from './admin-audit-export.main';

describe('C2b export process runner', () => {
  it('closes cleanly on SIGTERM after the dedicated profile and identity are proven', async () => {
    const signals = new EventEmitter();
    const close = vi.fn(async () => undefined);
    const assertIdentity = vi.fn(async () => undefined);
    const worker = {
      awaitQuiescence: vi.fn(async () => 'QUIESCED' as const),
      processOne: vi.fn(async () => 'IDLE' as const),
    };
    const outcome = await runAdminAuditExportMain({
      createApplicationContext: async () => ({
        close,
        get: <T>(token: unknown): T => {
          const name = typeof token === 'function' ? token.name : '';
          if (name === 'ConfigService') {
            return { get: () => ({ enabled: true, profile: 'EXPORT_WORKER' }) } as T;
          }
          if (name === 'AdminC2bBoundariesService') return { assertIdentity } as T;
          return worker as T;
        },
      }),
      onReady: () => signals.emit('SIGTERM'),
      signalSource: signals,
      shutdownMs: 100,
    });
    expect(outcome).toEqual({ failed: false, forceExit: false });
    expect(assertIdentity).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails closed for a foreign process profile', async () => {
    const signals = new EventEmitter();
    const close = vi.fn(async () => undefined);
    const outcome = await runAdminAuditExportMain({
      createApplicationContext: async () => ({
        close,
        get: <T>(): T => ({ get: () => ({ enabled: true, profile: 'HTTP' }) }) as T,
      }),
      signalSource: signals,
      shutdownMs: 100,
    });
    expect(outcome.failed).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('accepts an explicit harness stop only through the injected control', async () => {
    const signals = new EventEmitter();
    let stop: (() => void) | undefined;
    const unregister = vi.fn();
    const outcome = await runAdminAuditExportMain({
      createApplicationContext: async () => ({
        close: vi.fn(async () => undefined),
        get: <T>(token: unknown): T => {
          const name = typeof token === 'function' ? token.name : '';
          if (name === 'ConfigService') {
            return { get: () => ({ enabled: true, profile: 'EXPORT_WORKER' }) } as T;
          }
          if (name === 'AdminC2bBoundariesService') {
            return { assertIdentity: vi.fn(async () => undefined) } as T;
          }
          return {
            awaitQuiescence: vi.fn(async () => 'QUIESCED' as const),
            processOne: vi.fn(async () => 'IDLE' as const),
          } as T;
        },
      }),
      onReady: () => stop?.(),
      registerStop: (registered) => {
        stop = registered;
        return unregister;
      },
      signalSource: signals,
      shutdownMs: 100,
    });
    expect(outcome).toEqual({ failed: false, forceExit: false });
    expect(unregister).toHaveBeenCalledOnce();
  });
});
