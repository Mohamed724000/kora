import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, type AppModuleOptions } from './app.module';
import {
  GlobalExceptionFilter,
  adminC2MalformedJsonNormalizer,
  normalizeAdminC1MalformedJsonError,
} from './common/filters/global-exception.filter';
import type { RuntimeConfig } from './config/runtime-config';
import { AdminC2aBoundariesService } from './database/admin-c2a-boundaries.service';
import { AdminWriterService } from './database/admin-writer.service';
import { AdminAuthRepository } from './admin-auth/admin-auth.repository';
import type { AdminC2OperationId } from './admin-security/admin-security.errors';
import { AdminSecurityService } from './admin-security/admin-security.service';
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

const ADMIN_C2A_JSON_BODY_PATHS: ReadonlyArray<
  readonly [path: string, operationId: AdminC2OperationId]
> = [
  ['/api/v1/admin/auth/password/reset-requests', 'requestAdminPasswordReset'],
  ['/api/v1/admin/auth/password/reset', 'resetAdminPassword'],
  ['/api/v1/admin/invitations', 'createAdminInvitation'],
  ['/api/v1/admin/auth/invitations/accept', 'acceptAdminInvitation'],
  ['/api/v1/admin/recovery-cases', 'createAdminRecoveryCase'],
  ['/api/v1/admin/recovery-cases/:caseId/approve', 'approveAdminRecoveryCase'],
  ['/api/v1/admin/users/:adminUserId/role-changes', 'changeAdminUserRole'],
  ['/api/v1/admin/users/:adminUserId/status-changes', 'changeAdminUserStatus'],
];

export async function createApplication(options: AppModuleOptions = {}): Promise<INestApplication> {
  const application = await NestFactory.create<NestExpressApplication>(
    AppModule.register(options),
    {
      abortOnError: false,
      logger: false,
    },
  );
  const config = application.get(ConfigService<RuntimeConfig, true>);
  const adminC2a = config.get('adminC2a', { infer: true });
  const adminC2aHttpEnabled = adminC2a.enabled && adminC2a.profile === 'HTTP';
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
  if (adminC2aHttpEnabled) {
    for (const [path, operationId] of ADMIN_C2A_JSON_BODY_PATHS) {
      application.use(path, adminC2MalformedJsonNormalizer(operationId));
    }
  }
  const adminAuthRepository = application.get(AdminAuthRepository);
  const adminSecurityService = adminC2aHttpEnabled
    ? application.get(AdminSecurityService)
    : undefined;
  application.useGlobalFilters(
    new GlobalExceptionFilter(
      logger,
      captureSentryException,
      (exception, requestId) =>
        adminAuthRepository.recordFailure(
          {
            code: exception.code,
            ...(exception.auditAction === undefined ? {} : { auditAction: exception.auditAction }),
            ...(exception.auditContext === undefined
              ? {}
              : { auditContext: exception.auditContext }),
          },
          requestId,
        ),
      adminSecurityService === undefined
        ? undefined
        : (exception, requestId) => adminSecurityService.recordFailure(exception, requestId),
    ),
  );
  application.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  try {
    if (adminC2a.enabled) {
      if (adminC2a.profile !== 'HTTP') {
        throw new Error('The HTTP API requires the C2a HTTP profile.');
      }
      await application.get(AdminC2aBoundariesService).assertIdentity();
    }
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
