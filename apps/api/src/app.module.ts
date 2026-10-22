import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import type { AdminKeyProvider } from './admin-auth/admin-key-provider';
import {
  AdminSecurityModule,
  type AdminSecurityModuleOptions,
} from './admin-security/admin-security.module';
import { loadRuntimeConfig } from './config/runtime-config';
import { DatabaseModule } from './database/database.module';
import type { AdminWriterRuntimeBoundary } from './database/admin-writer.service';
import type { RuntimeDatabaseBoundary } from './database/runtime-database-boundary';
import { HealthModule } from './health/health.module';
import type { ReadinessCheck } from './health/readiness-check';
import { QueueInfrastructureModule } from './infrastructure/queue-infrastructure.module';

export interface AppModuleOptions {
  adminKeyProvider?: AdminKeyProvider;
  adminSecurity?: Omit<AdminSecurityModuleOptions, 'adminKeyProvider' | 'httpRoutesEnabled'>;
  adminWriterBoundary?: AdminWriterRuntimeBoundary;
  environment?: Record<string, string | undefined>;
  readinessChecks?: readonly ReadinessCheck[];
  runtimeDatabaseBoundary?: RuntimeDatabaseBoundary;
}

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const runtimeConfig = loadRuntimeConfig(options.environment ?? process.env);
    const adminAuthModule = AdminAuthModule.register({
      ...(options.adminKeyProvider === undefined ? {} : { keyProvider: options.adminKeyProvider }),
    });
    const adminHttpModule =
      runtimeConfig.adminC2a.enabled && runtimeConfig.adminC2a.profile === 'HTTP'
        ? AdminSecurityModule.register({
            ...options.adminSecurity,
            ...(options.adminKeyProvider === undefined
              ? {}
              : { adminKeyProvider: options.adminKeyProvider }),
            httpRoutesEnabled: true,
          })
        : adminAuthModule;
    return {
      imports: [
        ConfigModule.forRoot({
          cache: true,
          ignoreEnvFile: options.environment !== undefined,
          isGlobal: true,
          validate: () => runtimeConfig,
        }),
        DatabaseModule.register({
          ...(options.adminWriterBoundary === undefined
            ? {}
            : { adminWriterBoundary: options.adminWriterBoundary }),
          ...(options.runtimeDatabaseBoundary === undefined
            ? {}
            : { runtimeBoundary: options.runtimeDatabaseBoundary }),
        }),
        adminHttpModule,
        QueueInfrastructureModule,
        HealthModule.register({
          ...(options.readinessChecks === undefined
            ? {}
            : { readinessChecks: options.readinessChecks }),
        }),
      ],
      module: AppModule,
    };
  }
}
