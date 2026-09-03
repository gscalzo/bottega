/**
 * ESLint flat config — the lint half of the quality gate (ADR-0012):
 * - @eslint/js recommended everywhere
 * - typescript-eslint recommendedTypeChecked for all TS (projectService picks
 *   the right tsconfig: app for src+shared, worker for worker+shared, agent
 *   for agent+shared; root config files fall back to the default project)
 * - react-hooks on app code
 * - the per-function shape bars, at error, last so no preset can relax them
 */
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'reports/',
      '.wrangler/',
      '.stryker-tmp/',
      'skills/',
    ],
  },

  // ---------------------------------------------------------------- TypeScript
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React hooks rules for all app code.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Root-level config files sit outside every tsconfig; untyped linting.
  {
    files: ['*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Node ESM scripts (gate scripts, installer). They report to stdout by design.
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js', 'stryker.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // ------------------------------------------------------------ THE GATE RULES
  // raffaello's bars (ADR-0028 there, ADR-0012 here), everywhere, at error.
  // `npm run lint` runs with --max-warnings 0, so a warning fails the gate too.
  {
    plugins: { sonarjs },
    rules: {
      complexity: ['error', { max: 10 }],
      'sonarjs/cognitive-complexity': ['error', 12],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      'max-params': ['error', 5],
    },
  },

  // TypeScript hygiene shared with the siblings: no console noise in app,
  // Worker or agent code (warn/error only), `_`-prefixed unused arguments
  // are allowed, type-only imports must say so, and `any` is banned.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
