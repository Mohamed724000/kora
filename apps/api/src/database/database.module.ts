import { Global, Module, type DynamicModule } from '@nestjs/common';
import { AdminWriterService, type AdminWriterRuntimeBoundary } from './admin-writer.service';
import { PostgresqlRuntimeBoundary } from './postgresql-runtime-boundary';
import { PrismaService } from './prisma.service';
import { RuntimeDatabaseBoundary } from './runtime-database-boundary';
import {
  ADMIN_C2A_POOL_FACTORY,
  AdminC2aBoundariesService,
  createAdminC2aPgPool,
} from './admin-c2a-boundaries.service';
import {
  ADMIN_C2B_POOL_FACTORY,
  AdminC2bBoundariesService,
  createAdminC2bPgPool,
} from './admin-c2b-boundaries.service';

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
      exports: [
        AdminC2aBoundariesService,
        AdminC2bBoundariesService,
        AdminWriterService,
        PrismaService,
        RuntimeDatabaseBoundary,
      ],
      global: true,
      module: DatabaseModule,
      providers: [
        { provide: ADMIN_C2A_POOL_FACTORY, useValue: createAdminC2aPgPool },
        { provide: ADMIN_C2B_POOL_FACTORY, useValue: createAdminC2bPgPool },
        AdminC2aBoundariesService,
        AdminC2bBoundariesService,
        adminWriterProvider,
        PrismaService,
        PostgresqlRuntimeBoundary,
        boundaryProvider,
      ],
    };
  }
}
