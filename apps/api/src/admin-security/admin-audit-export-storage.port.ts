import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

export const ADMIN_AUDIT_EXPORT_STORAGE = Symbol('ADMIN_AUDIT_EXPORT_STORAGE');

const TEST_OBJECT_KEY =
  /^c2b\/(?:exports|staging)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.zip\.enc$/iu;
const TEST_STAGING_OBJECT_KEY =
  /^c2b\/staging\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.zip\.enc$/iu;

export interface AdminAuditExportStoredObject {
  readonly lastModifiedAt: Date;
  readonly objectKey: string;
}

export class AdminAuditExportStorageUnavailableError extends Error {
  constructor() {
    super('Admin audit export storage is unavailable.');
    this.name = 'AdminAuditExportStorageUnavailableError';
  }
}

export interface AdminAuditExportStoragePort {
  delete(objectKey: string, signal?: AbortSignal): Promise<void>;
  get(objectKey: string, signal?: AbortSignal): Promise<Uint8Array>;
  listStagingBefore(
    cutoff: Date,
    signal?: AbortSignal,
  ): Promise<readonly AdminAuditExportStoredObject[]>;
  putIfAbsent(objectKey: string, bytes: Uint8Array, signal?: AbortSignal): Promise<void>;
}

export class UnavailableAdminAuditExportStorage implements AdminAuditExportStoragePort {
  async delete(): Promise<void> {
    throw new AdminAuditExportStorageUnavailableError();
  }

  async get(): Promise<Uint8Array> {
    throw new AdminAuditExportStorageUnavailableError();
  }

  async listStagingBefore(
    _cutoff: Date,
    signal?: AbortSignal,
  ): Promise<readonly AdminAuditExportStoredObject[]> {
    signal?.throwIfAborted();
    throw new AdminAuditExportStorageUnavailableError();
  }

  async putIfAbsent(): Promise<void> {
    throw new AdminAuditExportStorageUnavailableError();
  }
}

export class TestMemoryAdminAuditExportStorage implements AdminAuditExportStoragePort {
  private readonly objects = new Map<string, { bytes: Buffer; lastModifiedAt: Date }>();

  async delete(objectKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.objects.delete(objectKey);
  }

  async get(objectKey: string, signal?: AbortSignal): Promise<Uint8Array> {
    signal?.throwIfAborted();
    const value = this.objects.get(objectKey);
    if (value === undefined) throw new AdminAuditExportStorageUnavailableError();
    return Buffer.from(value.bytes);
  }

  async listStagingBefore(
    cutoff: Date,
    signal?: AbortSignal,
  ): Promise<readonly AdminAuditExportStoredObject[]> {
    signal?.throwIfAborted();
    return [...this.objects.entries()]
      .filter(
        ([objectKey, value]) =>
          TEST_STAGING_OBJECT_KEY.test(objectKey) && value.lastModifiedAt < cutoff,
      )
      .map(([objectKey, value]) => ({ objectKey, lastModifiedAt: new Date(value.lastModifiedAt) }))
      .sort((left, right) =>
        left.lastModifiedAt.getTime() === right.lastModifiedAt.getTime()
          ? left.objectKey.localeCompare(right.objectKey)
          : left.lastModifiedAt.getTime() - right.lastModifiedAt.getTime(),
      );
  }

  async putIfAbsent(objectKey: string, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.objects.has(objectKey)) throw new AdminAuditExportStorageUnavailableError();
    this.objects.set(objectKey, { bytes: Buffer.from(bytes), lastModifiedAt: new Date() });
  }
}

export class TestFileAdminAuditExportStorage implements AdminAuditExportStoragePort {
  private readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) throw new TypeError('C2b test storage root must be absolute.');
    this.root = resolve(root);
  }

  private path(objectKey: string): string {
    if (!TEST_OBJECT_KEY.test(objectKey)) {
      throw new AdminAuditExportStorageUnavailableError();
    }
    const path = resolve(this.root, ...objectKey.split('/'));
    if (!path.startsWith(`${this.root}${sep}`)) {
      throw new AdminAuditExportStorageUnavailableError();
    }
    return path;
  }

  async delete(objectKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    try {
      await unlink(this.path(objectKey));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new AdminAuditExportStorageUnavailableError();
      }
    }
  }

  async get(objectKey: string, signal?: AbortSignal): Promise<Uint8Array> {
    try {
      return await readFile(this.path(objectKey), { signal });
    } catch {
      throw new AdminAuditExportStorageUnavailableError();
    }
  }

  async listStagingBefore(
    cutoff: Date,
    signal?: AbortSignal,
  ): Promise<readonly AdminAuditExportStoredObject[]> {
    signal?.throwIfAborted();
    const stagingRoot = resolve(this.root, 'c2b', 'staging');
    const objects: AdminAuditExportStoredObject[] = [];
    try {
      for (const exportEntry of await readdir(stagingRoot, { withFileTypes: true })) {
        signal?.throwIfAborted();
        if (!exportEntry.isDirectory()) continue;
        const exportPath = resolve(stagingRoot, exportEntry.name);
        for (const generationEntry of await readdir(exportPath, { withFileTypes: true })) {
          signal?.throwIfAborted();
          if (!generationEntry.isDirectory()) continue;
          const generationPath = resolve(exportPath, generationEntry.name);
          for (const objectEntry of await readdir(generationPath, { withFileTypes: true })) {
            signal?.throwIfAborted();
            if (!objectEntry.isFile()) continue;
            const objectKey = `c2b/staging/${exportEntry.name}/${generationEntry.name}/${objectEntry.name}`;
            if (!TEST_STAGING_OBJECT_KEY.test(objectKey)) continue;
            const metadata = await stat(this.path(objectKey));
            signal?.throwIfAborted();
            if (metadata.mtime < cutoff) {
              objects.push({ objectKey, lastModifiedAt: metadata.mtime });
            }
          }
        }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new AdminAuditExportStorageUnavailableError();
    }
    return objects.sort((left, right) =>
      left.lastModifiedAt.getTime() === right.lastModifiedAt.getTime()
        ? left.objectKey.localeCompare(right.objectKey)
        : left.lastModifiedAt.getTime() - right.lastModifiedAt.getTime(),
    );
  }

  async putIfAbsent(objectKey: string, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
    const path = this.path(objectKey);
    try {
      await mkdir(resolve(path, '..'), { recursive: true });
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600, signal });
    } catch {
      throw new AdminAuditExportStorageUnavailableError();
    }
  }
}
