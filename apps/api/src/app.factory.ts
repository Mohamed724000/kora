import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule, type AppModuleOptions } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import type { RuntimeConfig } from './config/runtime-config';
import { createHttpLogger } from './observability/http-logger';
import { captureSentryException, initializeSentry } from './observability/sentry';
import { createStructuredLogger, NestStructuredLogger } from './observability/structured-logger';

export async function createApplication(options: AppModuleOptions = {}): Promise<INestApplication> {
  const application = await NestFactory.create(AppModule.register(options), {
    logger: false,
  });
  const config = application.get(ConfigService<RuntimeConfig, true>);
  const logging = config.get('logging', { infer: true });
  const observability = config.get('observability', { infer: true });
  const logger = createStructuredLogger(logging.level);

  await initializeSentry(observability);

  application.useLogger(new NestStructuredLogger(logger));
  application.use(createHttpLogger(logger));
  application.useGlobalFilters(new GlobalExceptionFilter(logger, captureSentryException));
  application.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  await application.init();

  return application;
}
