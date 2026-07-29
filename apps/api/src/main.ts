import { ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from './config/runtime-config';
import { createApplication } from './app.factory';
import { createStructuredLogger } from './observability/structured-logger';

async function bootstrap(): Promise<void> {
  const application = await createApplication();
  const config = application.get(ConfigService<RuntimeConfig, true>);
  const http = config.get('http', { infer: true });

  application.enableShutdownHooks();
  await application.listen(http.port, http.host);
}

void bootstrap().catch((exception: unknown) => {
  const logger = createStructuredLogger('fatal');
  logger.fatal(
    {
      event: 'startup_failed',
      exceptionType:
        exception instanceof Error && exception.name.length > 0 ? exception.name : 'UnknownError',
    },
    'API startup failed',
  );
  process.exitCode = 1;
});
