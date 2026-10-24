import { TestEphemeralAdminKeyProvider } from '../src/admin-auth/admin-key-provider';
import { TestAdminAuditExportStorageKeyring } from '../src/admin-security/admin-audit-export-keyring';
import { TestEd25519AdminAuditExportSigningPort } from '../src/admin-security/admin-audit-export-signing.port';
import { TestFileAdminAuditExportStorage } from '../src/admin-security/admin-audit-export-storage.port';

export interface AdminSecurityC2bTestAdapters {
  readonly adminKeyProvider: TestEphemeralAdminKeyProvider;
  readonly keyring: TestAdminAuditExportStorageKeyring;
  readonly signing: TestEd25519AdminAuditExportSigningPort;
  readonly storage: TestFileAdminAuditExportStorage;
}

export function createAdminSecurityC2bTestAdapters(
  storageDirectory: string,
): AdminSecurityC2bTestAdapters {
  return {
    adminKeyProvider: new TestEphemeralAdminKeyProvider(),
    keyring: new TestAdminAuditExportStorageKeyring(),
    signing: new TestEd25519AdminAuditExportSigningPort(),
    storage: new TestFileAdminAuditExportStorage(storageDirectory),
  };
}
