import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ADMIN_KEY_PROVIDER, type AdminKeyProvider } from '../admin-auth/admin-key-provider';
import type { RuntimeConfig } from '../config/runtime-config';
import { QueueInfrastructureModule } from '../infrastructure/queue-infrastructure.module';
import { AdminAuditAuthorizationService } from './admin-audit.authorization.service';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditFailureService } from './admin-audit.failure.service';
import { AdminAuditQueryService } from './admin-audit.query.service';
import { AdminAuditRepository } from './admin-audit.repository';
import {
  ADMIN_AUDIT_EXPORT_KEYRING,
  type AdminAuditExportStorageKeyring,
  UnavailableAdminAuditExportStorageKeyring,
} from './admin-audit-export-keyring';
import {
  ADMIN_AUDIT_EXPORT_SIGNING,
  type AdminAuditExportSigningPort,
  UnavailableAdminAuditExportSigningPort,
} from './admin-audit-export-signing.port';
import {
  ADMIN_AUDIT_EXPORT_STORAGE,
  type AdminAuditExportStoragePort,
  UnavailableAdminAuditExportStorage,
} from './admin-audit-export-storage.port';
import { ADMIN_AUDIT_EXPORT_WAKEUP, AdminAuditExportService } from './admin-audit-export.service';
import {
  ADMIN_AUDIT_EXPORT_WAKEUP_QUEUE,
  BullAdminAuditExportWakeup,
} from './admin-audit-export.worker';
import { AdminAuditExportCodec } from './admin-audit-export-codec';
import { AdminSecurityPagination } from './admin-security.pagination';

export interface AdminAuditModuleOptions {
  readonly adminKeyProvider?: AdminKeyProvider;
  readonly keyring?: AdminAuditExportStorageKeyring;
  readonly signing?: AdminAuditExportSigningPort;
  readonly storage?: AdminAuditExportStoragePort;
}

function testOnlyProvider<T>(
  token: symbol,
  selected: T | undefined,
  fallback: T,
  label: string,
): Provider {
  return {
    inject: [ConfigService],
    provide: token,
    useFactory: (config: ConfigService<RuntimeConfig, true>) => {
      if (selected !== undefined && config.get('environment', { infer: true }) !== 'test') {
        throw new Error(`${label} injection is restricted to test harnesses.`);
      }
      return selected ?? fallback;
    },
  };
}

@Module({})
export class AdminAuditModule {
  static register(options: AdminAuditModuleOptions = {}): DynamicModule {
    return {
      controllers: [AdminAuditController],
      exports: [AdminAuditFailureService],
      imports: [
        QueueInfrastructureModule,
        BullModule.registerQueue({ name: ADMIN_AUDIT_EXPORT_WAKEUP_QUEUE }),
        AdminAuthModule.register({
          ...(options.adminKeyProvider === undefined
            ? {}
            : { keyProvider: options.adminKeyProvider }),
        }),
      ],
      module: AdminAuditModule,
      providers: [
        testOnlyProvider(
          ADMIN_AUDIT_EXPORT_STORAGE,
          options.storage,
          new UnavailableAdminAuditExportStorage(),
          'C2b storage adapter',
        ),
        testOnlyProvider(
          ADMIN_AUDIT_EXPORT_KEYRING,
          options.keyring,
          new UnavailableAdminAuditExportStorageKeyring(),
          'C2b storage keyring',
        ),
        testOnlyProvider(
          ADMIN_AUDIT_EXPORT_SIGNING,
          options.signing,
          new UnavailableAdminAuditExportSigningPort(),
          'C2b signing adapter',
        ),
        BullAdminAuditExportWakeup,
        { provide: ADMIN_AUDIT_EXPORT_WAKEUP, useExisting: BullAdminAuditExportWakeup },
        {
          inject: [ADMIN_AUDIT_EXPORT_SIGNING],
          provide: AdminAuditExportCodec,
          useFactory: (signing: AdminAuditExportSigningPort) => new AdminAuditExportCodec(signing),
        },
        {
          inject: [ADMIN_KEY_PROVIDER],
          provide: AdminSecurityPagination,
          useFactory: (keyProvider: AdminKeyProvider) => new AdminSecurityPagination(keyProvider),
        },
        AdminAuditRepository,
        AdminAuditAuthorizationService,
        AdminAuditFailureService,
        AdminAuditQueryService,
        AdminAuditExportService,
      ],
    };
  }
}
