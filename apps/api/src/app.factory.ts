import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, type AppModuleOptions } from './app.module';
import {
  GlobalExceptionFilter,
  normalizeAdminC1MalformedJsonError,
} from './common/filters/global-exception.filter';
import type { RuntimeConfig } from './config/runtime-config';
import { AdminWriterService } from './database/admin-writer.service';
import { AdminAuthRepository } from './admin-auth/admin-auth.repository';
import { RuntimeDatabaseBoundary } from './database/runtime-database-boundary';
import { createHttpLogger } from './observability/http-logger';
import { captureSentryException, initializeSentry } from './observability/sentry';
import { createStructuredLogger, NestStructuredLogger } from './observability/structured-logger';

const ADMIN_C1_JSON_BODY_PATHS = [
  '/api/v1/admin/auth/login',
  '/api/v1/admin/auth/totp/enrollments/:enrollmentId/confirm',
  '/api/v1/admin/auth/totp/verify',
  '/api/v1/admin/auth/recovery-codes/verify',
  '/api/v1/admin/auth/recovery-codes/rotate',
  '/api/v1/admin/auth/step-up',
  '/api/v1/admin/auth/sessions/:sessionId/revocations',
] as const;

export async function createApplication(options: AppModuleOptions = {}): Promise<INestApplication> {
  const application = await NestFactory.create<NestExpressApplication>(
    AppModule.register(options),
    {
      abortOnError: false,
      logger: false,
    },
  );
  const config = application.get(ConfigService<RuntimeConfig, true>);
  const logging = config.get('logging', { infer: true });
  const observability = config.get('observability', { infer: true });
  const logger = createStructuredLogger(logging.level);

  await initializeSentry(observability);

  application.useLogger(new NestStructuredLogger(logger));
  application.use(createHttpLogger(logger));
  application.useBodyParser('json');
  for (const path of ADMIN_C1_JSON_BODY_PATHS) {
    application.use(path, normalizeAdminC1MalformedJsonError);
  }
  const adminAuthRepository = application.get(AdminAuthRepository);
  application.useGlobalFilters(
    new GlobalExceptionFilter(logger, captureSentryException, (exception, requestId) =>
      adminAuthRepository.recordFailure(
        {
          code: exception.code,
          ...(exception.auditAction === undefined ? {} : { auditAction: exception.auditAction }),
          ...(exception.auditContext === undefined ? {} : { auditContext: exception.auditContext }),
        },
        requestId,
      ),
    ),
  );
  application.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  try {
    const runtimeDatabaseBoundary = application.get(RuntimeDatabaseBoundary);
    const adminWriter = application.get(AdminWriterService);
    await runtimeDatabaseBoundary.assertLeastPrivilege();
    await adminWriter.assertLeastPrivilege();
    await application.init();
  } catch (error: unknown) {
    await application.close();
    throw error;
  }

  return application;
}
