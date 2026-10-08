import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import type { AdminKeyProvider } from './admin-auth/admin-key-provider';
import { loadRuntimeConfig } from './config/runtime-config';
import { DatabaseModule } from './database/database.module';
import type { AdminWriterRuntimeBoundary } from './database/admin-writer.service';
import type { RuntimeDatabaseBoundary } from './database/runtime-database-boundary';
import { HealthModule } from './health/health.module';
import type { ReadinessCheck } from './health/readiness-check';
import { QueueInfrastructureModule } from './infrastructure/queue-infrastructure.module';

export interface AppModuleOptions {
  adminKeyProvider?: AdminKeyProvider;
  adminWriterBoundary?: AdminWriterRuntimeBoundary;
  environment?: Record<string, string | undefined>;
  readinessChecks?: readonly ReadinessCheck[];
  runtimeDatabaseBoundary?: RuntimeDatabaseBoundary;
}

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    return {
      imports: [
        ConfigModule.forRoot({
          cache: true,
          ignoreEnvFile: options.environment !== undefined,
          isGlobal: true,
          validate: (environment) => loadRuntimeConfig(options.environment ?? environment),
        }),
        DatabaseModule.register({
          ...(options.adminWriterBoundary === undefined
            ? {}
            : { adminWriterBoundary: options.adminWriterBoundary }),
          ...(options.runtimeDatabaseBoundary === undefined
            ? {}
            : { runtimeBoundary: options.runtimeDatabaseBoundary }),
        }),
        AdminAuthModule.register({
          ...(options.adminKeyProvider === undefined
            ? {}
            : { keyProvider: options.adminKeyProvider }),
        }),
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
