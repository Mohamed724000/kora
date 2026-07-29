import eslint from '@eslint/js';
import sharedConfig from '@kora-plus/config/eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
  },
  ...sharedConfig,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'prisma.config.ts'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.spec.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: {
        afterAll: 'readonly',
        beforeAll: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        jest: 'readonly',
      },
    },
  },
);
