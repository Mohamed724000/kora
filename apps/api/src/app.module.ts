import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadRuntimeConfig } from './config/runtime-config';
import { DatabaseModule } from './database/database.module';
import type { RuntimeDatabaseBoundary } from './database/runtime-database-boundary';
import { HealthModule } from './health/health.module';
import type { ReadinessCheck } from './health/readiness-check';
import { QueueInfrastructureModule } from './infrastructure/queue-infrastructure.module';

export interface AppModuleOptions {
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
          ...(options.runtimeDatabaseBoundary === undefined
            ? {}
            : { runtimeBoundary: options.runtimeDatabaseBoundary }),
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
