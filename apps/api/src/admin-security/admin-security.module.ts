import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import type { AdminKeyProvider } from '../admin-auth/admin-key-provider';
import { ADMIN_KEY_PROVIDER } from '../admin-auth/admin-key-provider';
import type { RuntimeConfig } from '../config/runtime-config';
import { QueueInfrastructureModule } from '../infrastructure/queue-infrastructure.module';
import {
  ADMIN_NOTIFICATION_WAKEUP,
  ADMIN_NOTIFICATION_WAKEUP_QUEUE,
  BullAdminNotificationWakeup,
} from './admin-notification.worker';
import {
  ADMIN_NOTIFICATION_PORT,
  type AdminNotificationPort,
  UnavailableAdminNotificationPort,
} from './admin-notification.port';
import {
  ADMIN_PASSWORD_COMPROMISE_PORT,
  type AdminPasswordCompromisePort,
  UnavailableAdminPasswordCompromisePort,
} from './admin-password-compromise.port';
import {
  ADMIN_SECURITY_CRYPTO,
  ADMIN_SECURITY_OUTBOX_KEYRING,
  AdminSecurityCrypto,
  type AdminSecurityOutboxKeyring,
  UnavailableAdminSecurityOutboxKeyring,
} from './admin-security.crypto';
import { AdminSecurityController } from './admin-security.controller';
import { AdminSecurityPagination } from './admin-security.pagination';
import { AdminSecurityRepository } from './admin-security.repository';
import { AdminSecurityService } from './admin-security.service';

export interface AdminSecurityModuleOptions {
  readonly adminKeyProvider?: AdminKeyProvider;
  readonly httpRoutesEnabled?: boolean;
  readonly notificationPort?: AdminNotificationPort;
  readonly outboxKeyring?: AdminSecurityOutboxKeyring;
  readonly passwordCompromisePort?: AdminPasswordCompromisePort;
}

@Module({})
export class AdminSecurityModule {
  static register(options: AdminSecurityModuleOptions = {}): DynamicModule {
    const outboxKeyring: Provider = {
      inject: [ConfigService],
      provide: ADMIN_SECURITY_OUTBOX_KEYRING,
      useFactory: (config: ConfigService<RuntimeConfig, true>): AdminSecurityOutboxKeyring => {
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
    const passwordCompromisePort: Provider = {
      inject: [ConfigService],
      provide: ADMIN_PASSWORD_COMPROMISE_PORT,
      useFactory: (config: ConfigService<RuntimeConfig, true>) => {
        if (
          options.passwordCompromisePort !== undefined &&
          config.get('environment', { infer: true }) !== 'test'
        ) {
          throw new Error('C2a password-compromise adapters are restricted to test harnesses.');
        }
        return options.passwordCompromisePort ?? new UnavailableAdminPasswordCompromisePort();
      },
    };
    return {
      controllers: options.httpRoutesEnabled === true ? [AdminSecurityController] : [],
      exports: [
        AdminSecurityRepository,
        AdminSecurityService,
        ADMIN_NOTIFICATION_PORT,
        ADMIN_PASSWORD_COMPROMISE_PORT,
        ADMIN_SECURITY_CRYPTO,
        ADMIN_SECURITY_OUTBOX_KEYRING,
      ],
      imports: [
        QueueInfrastructureModule,
        BullModule.registerQueue({ name: ADMIN_NOTIFICATION_WAKEUP_QUEUE }),
        AdminAuthModule.register({
          ...(options.adminKeyProvider === undefined
            ? {}
            : { keyProvider: options.adminKeyProvider }),
        }),
      ],
      module: AdminSecurityModule,
      providers: [
        notificationPort,
        passwordCompromisePort,
        outboxKeyring,
        BullAdminNotificationWakeup,
        { provide: ADMIN_NOTIFICATION_WAKEUP, useExisting: BullAdminNotificationWakeup },
        {
          inject: [ADMIN_SECURITY_OUTBOX_KEYRING],
          provide: ADMIN_SECURITY_CRYPTO,
          useFactory: (keyring: AdminSecurityOutboxKeyring) => new AdminSecurityCrypto(keyring),
        },
        {
          inject: [ADMIN_KEY_PROVIDER],
          provide: AdminSecurityPagination,
          useFactory: (keyProvider: AdminKeyProvider) => new AdminSecurityPagination(keyProvider),
        },
        AdminSecurityRepository,
        AdminSecurityService,
      ],
    };
  }
}
