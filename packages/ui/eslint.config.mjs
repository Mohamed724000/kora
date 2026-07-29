import { defineConfig, globalIgnores } from 'eslint/config';
import sharedConfig from '@kora-plus/config/eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...sharedConfig,
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  globalIgnores(['coverage/**']),
]);
