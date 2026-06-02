import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'build',
      'node_modules',
      'coverage',
      'test-results',
      'playwright-report',
      'backend',
      'docs',
      'infra',
      'deploy',
      'public',
      'e2e',
      'zhuji-demo.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/prop-types': 'off',
      // Underscore prefix opts out of unused-var check.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // We intentionally use `any` in a few wire/storage shims; flag as a
      // warning rather than blocking the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  // Vitest setup files use describe/it/expect globals.
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'vitest.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
)
