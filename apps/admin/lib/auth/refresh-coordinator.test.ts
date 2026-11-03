import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdminRefreshCoordinator,
  openAdminSessionChannel,
  RefreshCoordinationUnavailableError,
} from './refresh-coordinator';

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
const originalBroadcastChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel');

afterEach(() => {
  if (originalLocks === undefined) Reflect.deleteProperty(navigator, 'locks');
  else Object.defineProperty(navigator, 'locks', originalLocks);
  if (originalBroadcastChannel === undefined)
    Reflect.deleteProperty(globalThis, 'BroadcastChannel');
  else Object.defineProperty(globalThis, 'BroadcastChannel', originalBroadcastChannel);
});

describe('AdminRefreshCoordinator', () => {
  it('échoue fermé lorsque Web Locks manque', async () => {
    Reflect.deleteProperty(navigator, 'locks');
    const coordinator = new AdminRefreshCoordinator();

    await expect(coordinator.run(async () => 'unused')).rejects.toBeInstanceOf(
      RefreshCoordinationUnavailableError,
    );
  });

  it('partage une seule rotation dans un onglet et demande un verrou exclusif', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const task = vi.fn(() => pending);
    const request = vi.fn(
      async <T>(_name: string, options: LockOptions, callback: () => Promise<T>): Promise<T> => {
        expect(options.mode).toBe('exclusive');
        return callback();
      },
    );
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });
    const coordinator = new AdminRefreshCoordinator();

    const first = coordinator.run(task);
    const second = coordinator.run(task);
    expect(task).toHaveBeenCalledOnce();
    release('rotated');

    await expect(first).resolves.toBe('rotated');
    await expect(second).resolves.toBe('rotated');
    expect(request).toHaveBeenCalledOnce();
  });

  it('libère le single-flight après l’échec du propriétaire et autorise un nouvel owner', async () => {
    const request = vi.fn(
      async <T>(_name: string, _options: LockOptions, callback: () => Promise<T>): Promise<T> =>
        callback(),
    );
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    const coordinator = new AdminRefreshCoordinator();

    await expect(
      coordinator.run(async () => {
        throw new Error('owner terminated');
      }),
    ).rejects.toThrow('owner terminated');
    await expect(coordinator.run(async () => 'replacement-owner')).resolves.toBe(
      'replacement-owner',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('ne conserve pas un verrou local après timeout du courtier Web Locks', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('lock timeout', 'AbortError'))
      .mockImplementationOnce(
        async <T>(_name: string, _options: LockOptions, callback: () => Promise<T>): Promise<T> =>
          callback(),
      );
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    const coordinator = new AdminRefreshCoordinator();

    await expect(coordinator.run(async () => 'unreachable')).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(coordinator.run(async () => 'after-timeout')).resolves.toBe('after-timeout');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('ignore une génération distante négative et accepte une rotation bornée', () => {
    class FakeBroadcastChannel {
      static latest: FakeBroadcastChannel | undefined;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

      constructor(name: string) {
        expect(name).toBe('kora-admin-session-v1');
        FakeBroadcastChannel.latest = this;
      }

      close(): void {}
      postMessage(message: unknown): void {
        expect(message).toBeDefined();
      }
      emit(data: unknown): void {
        this.onmessage?.({ data } as MessageEvent<unknown>);
      }
    }
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: FakeBroadcastChannel,
    });
    const listener = vi.fn();
    const channel = openAdminSessionChannel(listener);

    FakeBroadcastChannel.latest?.emit({ generation: -1, type: 'SESSION_ROTATED' });
    FakeBroadcastChannel.latest?.emit({ generation: 7, type: 'SESSION_ROTATED' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ generation: 7, type: 'SESSION_ROTATED' });
    channel.close();
  });
});
