import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PostgresqlReadinessCheck } from './postgresql-readiness.check';
import { READINESS_CHECKS, type ReadinessCheck } from './readiness-check';
import { RedisReadinessCheck } from './redis-readiness.check';

interface HealthModuleOptions {
  readinessChecks?: readonly ReadinessCheck[];
}

@Module({})
export class HealthModule {
  static register(options: HealthModuleOptions = {}): DynamicModule {
    const readinessProvider: Provider =
      options.readinessChecks === undefined
        ? {
            inject: [PostgresqlReadinessCheck, RedisReadinessCheck],
            provide: READINESS_CHECKS,
            useFactory: (
              postgresql: PostgresqlReadinessCheck,
              redis: RedisReadinessCheck,
            ): readonly ReadinessCheck[] => [postgresql, redis],
          }
        : {
            provide: READINESS_CHECKS,
            useValue: options.readinessChecks,
          };

    return {
      controllers: [HealthController],
      module: HealthModule,
      providers: [HealthService, PostgresqlReadinessCheck, RedisReadinessCheck, readinessProvider],
    };
  }
}
