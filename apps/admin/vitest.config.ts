import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    noExternal: ['@adminlte/react'],
  },
  test: {
    clearMocks: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
