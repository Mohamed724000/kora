import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, '..', '..', '..');
export const contractsRoot = join(repositoryRoot, 'packages', 'contracts');
export const contractsDist = join(contractsRoot, 'dist');
const BUILD_TIMEOUT_MS = 120_000;

function files(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Contracts inputs cannot contain links.');
    if (entry.isDirectory()) result.push(...files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

export function contractsInputDigest(root = contractsRoot) {
  const inputs = [
    join(root, 'package.json'),
    join(root, 'tsconfig.json'),
    join(root, 'tsconfig.build.json'),
    ...files(join(root, 'src')),
  ].sort();
  const digest = createHash('sha256');
  for (const path of inputs) {
    digest.update(relative(root, path).replaceAll('\\', '/'));
    digest.update('\0');
    digest.update(readFileSync(path));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function assertOutput(path) {
  if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || statSync(path).size === 0) {
    throw new Error('Contracts build output is missing.');
  }
}

function assertDist(root, dist) {
  if (resolve(dist) !== resolve(root, 'dist')) {
    throw new Error('Contracts dist path escaped the repository boundary.');
  }
  if (existsSync(dist) && lstatSync(dist).isSymbolicLink()) {
    throw new Error('Contracts dist cannot be a link.');
  }
}

function runContractsBuild(root = repositoryRoot) {
  const npmCli = process.env.npm_execpath;
  if (npmCli === undefined) throw new Error('npm_execpath is required.');
  const result = spawnSync(
    process.execPath,
    [npmCli, 'run', 'build', '--workspace', '@kora-plus/contracts'],
    {
      cwd: root,
      encoding: 'utf8',
      killSignal: 'SIGTERM',
      shell: false,
      stdio: 'inherit',
      timeout: BUILD_TIMEOUT_MS,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error('Contracts build failed.');
  }
}

export function prepareContractsForRoot(root, build = () => runContractsBuild(repositoryRoot)) {
  const resolvedRoot = resolve(root);
  const dist = join(resolvedRoot, 'dist');
  const lock = join(resolvedRoot, '.prepare-contracts.lock');
  assertDist(resolvedRoot, dist);
  let descriptor;
  try {
    descriptor = openSync(lock, 'wx', 0o600);
  } catch {
    throw new Error('Another Contracts preparation is active.');
  }
  try {
    const before = contractsInputDigest(resolvedRoot);
    rmSync(dist, { force: true, recursive: true });
    build();
    const after = contractsInputDigest(resolvedRoot);
    if (after !== before) throw new Error('Contracts inputs changed during generation.');
    assertDist(resolvedRoot, dist);
    assertOutput(join(dist, 'index.js'));
    assertOutput(join(dist, 'index.d.ts'));
    return before;
  } finally {
    closeSync(descriptor);
    rmSync(lock, { force: true });
  }
}

export function prepareContracts() {
  const digest = prepareContractsForRoot(contractsRoot);
  process.stdout.write(`Contracts prepared from inputs sha256:${digest}.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) prepareContracts();
