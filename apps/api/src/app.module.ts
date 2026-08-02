import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadRuntimeConfig } from './config/runtime-config';
import { HealthModule } from './health/health.module';
import type { ReadinessCheck } from './health/readiness-check';
import { QueueInfrastructureModule } from './infrastructure/queue-infrastructure.module';

export interface AppModuleOptions {
  environment?: Record<string, string | undefined>;
  readinessChecks?: readonly ReadinessCheck[];
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
