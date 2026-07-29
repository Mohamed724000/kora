import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule, type AppModuleOptions } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import type { RuntimeConfig } from './config/runtime-config';
import { createHttpLogger } from './observability/http-logger';
import { createStructuredLogger, NestStructuredLogger } from './observability/structured-logger';

export async function createApplication(options: AppModuleOptions = {}): Promise<INestApplication> {
  const application = await NestFactory.create(AppModule.register(options), {
    logger: false,
  });
  const config = application.get(ConfigService<RuntimeConfig, true>);
  const logging = config.get('logging', { infer: true });
  const logger = createStructuredLogger(logging.level);

  application.useLogger(new NestStructuredLogger(logger));
  application.use(createHttpLogger(logger));
  application.useGlobalFilters(new GlobalExceptionFilter(logger));
  application.setGlobalPrefix('api/v1');
  await application.init();

  return application;
}
