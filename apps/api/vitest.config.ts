import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    decorator: {
      emitDecoratorMetadata: true,
      legacy: true,
    },
    target: 'es2023',
  },
  test: {
    clearMocks: false,
    coverage: {
      exclude: ['src/main.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
    environment: 'node',
    fileParallelism: false,
    globals: true,
    hookTimeout: 5_000,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    isolate: true,
    maxConcurrency: 1,
    mockReset: false,
    pool: 'forks',
    restoreMocks: false,
    sequence: {
      concurrent: false,
      hooks: 'list',
    },
    setupFiles: ['./test/vitest.setup.ts'],
    testTimeout: 5_000,
  },
});
