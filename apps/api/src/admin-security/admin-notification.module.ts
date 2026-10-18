import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from '../config/runtime-config';
import { loadRuntimeConfig } from '../config/runtime-config';
import { DatabaseModule } from '../database/database.module';
import { QueueInfrastructureModule } from '../infrastructure/queue-infrastructure.module';
import {
  ADMIN_NOTIFICATION_PORT,
  type AdminNotificationPort,
  UnavailableAdminNotificationPort,
} from './admin-notification.port';
import {
  ADMIN_NOTIFICATION_WAKEUP,
  ADMIN_NOTIFICATION_WAKEUP_QUEUE,
  AdminNotificationActivationGate,
  AdminNotificationWakeupProcessor,
  AdminNotificationWorker,
  BullAdminNotificationWakeup,
} from './admin-notification.worker';
import {
  ADMIN_SECURITY_CRYPTO,
  ADMIN_SECURITY_OUTBOX_KEYRING,
  AdminSecurityCrypto,
  type AdminSecurityOutboxKeyring,
  UnavailableAdminSecurityOutboxKeyring,
} from './admin-security.crypto';
import { AdminSecurityRepository } from './admin-security.repository';

export interface AdminNotificationModuleOptions {
  readonly notificationPort?: AdminNotificationPort;
  readonly outboxKeyring?: AdminSecurityOutboxKeyring;
}

@Module({})
export class AdminNotificationModule {
  static register(options: AdminNotificationModuleOptions = {}): DynamicModule {
    const keyring: Provider = {
      inject: [ConfigService],
      provide: ADMIN_SECURITY_OUTBOX_KEYRING,
      useFactory: (config: ConfigService<RuntimeConfig, true>) => {
        const selected = options.outboxKeyring ?? new UnavailableAdminSecurityOutboxKeyring();
        if (
          options.outboxKeyring !== undefined &&
          config.get('environment', { infer: true }) !== 'test'
        ) {
          throw new Error('C2a outbox keyring injection is restricted to test harnesses.');
        }
        return selected;
      },
    };
    const notificationPort: Provider = {
      inject: [ConfigService],
      provide: ADMIN_NOTIFICATION_PORT,
      useFactory: (config: ConfigService<RuntimeConfig, true>) => {
        if (
          options.notificationPort !== undefined &&
          config.get('environment', { infer: true }) !== 'test'
        ) {
          throw new Error('C2a notification adapters are restricted to test harnesses.');
        }
        return options.notificationPort ?? new UnavailableAdminNotificationPort();
      },
    };
    return {
      exports: [AdminNotificationWorker],
      imports: [
        ConfigModule.forRoot({ cache: true, isGlobal: true, validate: loadRuntimeConfig }),
        DatabaseModule.register(),
        QueueInfrastructureModule,
        BullModule.registerQueue({ name: ADMIN_NOTIFICATION_WAKEUP_QUEUE }),
      ],
      module: AdminNotificationModule,
      providers: [
        notificationPort,
        keyring,
        {
          inject: [ADMIN_SECURITY_OUTBOX_KEYRING],
          provide: ADMIN_SECURITY_CRYPTO,
          useFactory: (selected: AdminSecurityOutboxKeyring) => new AdminSecurityCrypto(selected),
        },
        AdminSecurityRepository,
        AdminNotificationWorker,
        AdminNotificationActivationGate,
        BullAdminNotificationWakeup,
        { provide: ADMIN_NOTIFICATION_WAKEUP, useExisting: BullAdminNotificationWakeup },
        AdminNotificationWakeupProcessor,
      ],
    };
  }
}
