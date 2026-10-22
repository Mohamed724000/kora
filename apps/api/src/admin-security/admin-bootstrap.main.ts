import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { RuntimeConfig } from '../config/runtime-config';
import { AdminC2aBoundariesService } from '../database/admin-c2a-boundaries.service';
import {
  AdminBootstrapCommand,
  readAdminBootstrapStdin,
  type AdminBootstrapOutcome,
} from './admin-bootstrap.command';
import { AdminBootstrapModule } from './admin-bootstrap.module';
import type {
  AdminPasswordCompromisePort,
  AdminPasswordCompromiseResult,
} from './admin-password-compromise.port';

const PROCESS_PROOF_ENVIRONMENT = 'S1203C2A_PROCESS_PROOF';

class ProcessProofPasswordCompromisePort implements AdminPasswordCompromisePort {
  async checkPassword(
    _passwordUtf8: string,
    options: Readonly<{ signal: AbortSignal; timeoutMs: 3000 }>,
  ): Promise<AdminPasswordCompromiseResult> {
    if (options.signal.aborted) throw new Error('Process-proof password check aborted.');
    return 'SAFE';
  }
}

function processProofEnabled(): boolean {
  const enabled = process.env[PROCESS_PROOF_ENVIRONMENT] === '1';
  if (enabled && process.env.NODE_ENV !== 'test') {
    throw new Error('C2a process-proof adapters require NODE_ENV=test.');
  }
  return enabled;
}

function invalidInput(): AdminBootstrapOutcome {
  return { exitCode: 2, status: 'INVALID_INPUT' };
}

async function run(): Promise<AdminBootstrapOutcome> {
  if (process.argv.length !== 2) return invalidInput();
  let rawInput: Uint8Array;
  try {
    rawInput = await readAdminBootstrapStdin(process.stdin);
  } catch {
    return invalidInput();
  }

  let application: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    application = await NestFactory.createApplicationContext(
      AdminBootstrapModule.register(
        processProofEnabled()
          ? { passwordCompromisePort: new ProcessProofPasswordCompromisePort() }
          : {},
      ),
      { logger: false },
    );
    const config = application.get(ConfigService<RuntimeConfig, true>).get('adminC2a', {
      infer: true,
    });
    if (!config.enabled || config.profile !== 'BOOTSTRAP') {
      return { exitCode: 4, status: 'DEPENDENCY_UNAVAILABLE' };
    }
    await application.get(AdminC2aBoundariesService).assertIdentity();
    return await application.get(AdminBootstrapCommand).execute(rawInput);
  } catch {
    return { exitCode: 4, status: 'DEPENDENCY_UNAVAILABLE' };
  } finally {
    if (application !== undefined) {
      try {
        await application.close();
      } catch {
        // Cleanup failure never rewrites the already classified primary outcome.
      }
    }
  }
}

void run()
  .then((outcome) => {
    const serialized = JSON.stringify(outcome) + '\n';
    if (outcome.exitCode === 0) process.stdout.write(serialized);
    else process.stderr.write(serialized);
    process.exitCode = outcome.exitCode;
  })
  .catch(() => {
    process.stderr.write('{"exitCode":1,"status":"FAILED"}\n');
    process.exitCode = 1;
  });
