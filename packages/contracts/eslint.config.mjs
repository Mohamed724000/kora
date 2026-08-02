import eslint from '@eslint/js';
import sharedConfig from '@kora-plus/config/eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...sharedConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
