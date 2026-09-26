import { Global, Module, type DynamicModule } from '@nestjs/common';
import { PostgresqlRuntimeBoundary } from './postgresql-runtime-boundary';
import { PrismaService } from './prisma.service';
import { RuntimeDatabaseBoundary } from './runtime-database-boundary';

export interface DatabaseModuleOptions {
  runtimeBoundary?: RuntimeDatabaseBoundary;
}

@Global()
@Module({})
export class DatabaseModule {
  static register(options: DatabaseModuleOptions = {}): DynamicModule {
    const boundaryProvider =
      options.runtimeBoundary === undefined
        ? { provide: RuntimeDatabaseBoundary, useExisting: PostgresqlRuntimeBoundary }
        : { provide: RuntimeDatabaseBoundary, useValue: options.runtimeBoundary };

    return {
      exports: [PrismaService, RuntimeDatabaseBoundary],
      global: true,
      module: DatabaseModule,
      providers: [PrismaService, PostgresqlRuntimeBoundary, boundaryProvider],
    };
  }
}
