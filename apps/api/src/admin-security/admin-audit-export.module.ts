import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from '../config/runtime-config';
import { loadRuntimeConfig } from '../config/runtime-config';
import { DatabaseModule } from '../database/database.module';
import { QueueInfrastructureModule } from '../infrastructure/queue-infrastructure.module';
import { AdminAuditExportCodec } from './admin-audit-export-codec';
import {
  ADMIN_AUDIT_EXPORT_KEYRING,
  type AdminAuditExportStorageKeyring,
  UnavailableAdminAuditExportStorageKeyring,
} from './admin-audit-export-keyring';
import { AdminAuditExportRepository } from './admin-audit-export.repository';
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
import {
  ADMIN_AUDIT_EXPORT_WAKEUP,
  type AdminAuditExportWakeupPort,
} from './admin-audit-export.service';
import {
  ADMIN_AUDIT_EXPORT_WAKEUP_QUEUE,
  AdminAuditExportWakeupProcessor,
  AdminAuditExportWorker,
  BullAdminAuditExportWakeup,
} from './admin-audit-export.worker';

export interface AdminAuditExportModuleOptions {
  readonly keyring?: AdminAuditExportStorageKeyring;
  readonly signing?: AdminAuditExportSigningPort;
  readonly storage?: AdminAuditExportStoragePort;
}

function selected<T>(token: symbol, value: T | undefined, fallback: T, label: string): Provider {
  return {
    inject: [ConfigService],
    provide: token,
    useFactory: (config: ConfigService<RuntimeConfig, true>) => {
      if (value !== undefined && config.get('environment', { infer: true }) !== 'test') {
        throw new Error(`${label} injection is restricted to test harnesses.`);
      }
      return value ?? fallback;
    },
  };
}

@Module({})
export class AdminAuditExportModule {
  static register(options: AdminAuditExportModuleOptions = {}): DynamicModule {
    return {
      exports: [AdminAuditExportWorker],
      imports: [
        ConfigModule.forRoot({ cache: true, isGlobal: true, validate: loadRuntimeConfig }),
        DatabaseModule.register(),
        QueueInfrastructureModule,
        BullModule.registerQueue({ name: ADMIN_AUDIT_EXPORT_WAKEUP_QUEUE }),
      ],
      module: AdminAuditExportModule,
      providers: [
        selected(
          ADMIN_AUDIT_EXPORT_STORAGE,
          options.storage,
          new UnavailableAdminAuditExportStorage(),
          'C2b storage adapter',
        ),
        selected(
          ADMIN_AUDIT_EXPORT_KEYRING,
          options.keyring,
          new UnavailableAdminAuditExportStorageKeyring(),
          'C2b storage keyring',
        ),
        selected(
          ADMIN_AUDIT_EXPORT_SIGNING,
          options.signing,
          new UnavailableAdminAuditExportSigningPort(),
          'C2b signing adapter',
        ),
        BullAdminAuditExportWakeup,
        {
          provide: ADMIN_AUDIT_EXPORT_WAKEUP,
          useExisting: BullAdminAuditExportWakeup,
        } satisfies Provider<AdminAuditExportWakeupPort>,
        {
          inject: [ADMIN_AUDIT_EXPORT_SIGNING],
          provide: AdminAuditExportCodec,
          useFactory: (signing: AdminAuditExportSigningPort) => new AdminAuditExportCodec(signing),
        },
        AdminAuditExportRepository,
        AdminAuditExportWorker,
        AdminAuditExportWakeupProcessor,
      ],
    };
  }
}
