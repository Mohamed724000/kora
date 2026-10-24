import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`S1.2-03C2b business validation failed: ${name} is required.`);
  }
  return value;
}

const instance = required('KORA_C2B_INSTANCE');
if (instance !== required('KORA_C2B_EXPECTED_INSTANCE') || instance === 'local') {
  throw new Error('S1.2-03C2b business validation failed: campaign identity mismatch.');
}
if (required('S1203C2B_BUSINESS_E2E') !== '1') {
  throw new Error('S1.2-03C2b business validation failed: real suite is not enabled.');
}
const root = resolve(import.meta.dirname, '..', '..', '..');
const worker = resolve(
  root,
  'apps',
  'api',
  'dist',
  'src',
  'admin-security',
  'admin-audit-export.main.js',
);
const vitest = resolve(root, 'node_modules', 'vitest', 'vitest.mjs');
if (!existsSync(worker) || !existsSync(vitest)) {
  throw new Error('S1.2-03C2b business validation failed: build or Vitest entry is missing.');
}

const child = spawn(
  process.execPath,
  [vitest, 'run', 'test/admin-security-c2b.integration.spec.ts'],
  {
    cwd: resolve(root, 'apps', 'api'),
    env: process.env,
    shell: false,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  },
);
const code = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('close', resolveExit);
});
if (code !== 0) {
  throw new Error(`S1.2-03C2b business validation failed: Vitest exited with ${String(code)}.`);
}
process.stdout.write(
  'C2B_BUSINESS_VALIDATION_PASS http_operations=4 worker_process=true bullmq=true integrity=true\n',
);
