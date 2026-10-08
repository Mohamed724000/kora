import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AdminWriterService, type AdminWriterRuntimeBoundary } from './admin-writer.service';
import { PostgresqlRuntimeBoundary } from './postgresql-runtime-boundary';
import { PrismaService } from './prisma.service';
import { RuntimeDatabaseBoundary } from './runtime-database-boundary';

export interface DatabaseModuleOptions {
  adminWriterBoundary?: AdminWriterRuntimeBoundary;
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
    const adminWriterProvider =
      options.adminWriterBoundary === undefined
        ? AdminWriterService
        : { provide: AdminWriterService, useValue: options.adminWriterBoundary };

    return {
      exports: [AdminWriterService, PrismaService, RuntimeDatabaseBoundary],
      global: true,
      module: DatabaseModule,
      providers: [adminWriterProvider, PrismaService, PostgresqlRuntimeBoundary, boundaryProvider],
    };
  }
}
