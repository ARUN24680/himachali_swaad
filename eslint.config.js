// Root ESLint flat config for every workspace (Phase 1 §1.8).
// Import boundaries enforce architecture/09-codebase-structure.md §1–§3.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const restrict = (...patterns) => ['error', { patterns }];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },

  // ── React (apps + ui) ────────────────────────────────────────────────
  {
    files: [
      'apps/storefront/**/*.{ts,tsx}',
      'apps/admin/**/*.{ts,tsx}',
      'apps/payment/web/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
    ],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/storefront/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs['core-web-vitals'].rules },
    settings: { next: { rootDir: 'apps/storefront' } },
  },

  // ── Import boundaries ────────────────────────────────────────────────
  {
    // Frontend apps talk to the backend over HTTP only (D-05)
    files: ['apps/storefront/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict(
        {
          group: ['@pk/backend', '@pk/backend/*', '@pk/database', 'pg', 'ioredis', 'bullmq'],
          message: 'Frontend apps call the backend over HTTP only (D-05).',
        },
        {
          group: ['@/modules/*/*'],
          message:
            "Import another module only through its public index: '@/modules/<feature>' (D-44). Use relative imports inside a module.",
        },
      ),
    },
  },
  {
    // Common components are lower than feature modules (D-44)
    files: ['apps/*/src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict(
        {
          group: ['@/modules', '@/modules/*', '**/modules/**'],
          message:
            'components/common must not depend on feature modules — move shared logic down, or the component into the module (D-44).',
        },
        {
          group: ['@pk/backend', '@pk/database', 'pg'],
          message: 'Frontend apps call the backend over HTTP only (D-05).',
        },
      ),
    },
  },
  {
    // Design system knows nothing about apps or business logic
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict({
        group: ['@/*', '@pk/backend', '@pk/database', '@pk/shared', '**/apps/**'],
        message: '@pk/ui is presentational only — no app, business or backend imports.',
      }),
    },
  },
  {
    // Shared contracts stay framework-free
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict({
        group: ['react', 'react-dom', 'next', 'next/*', 'fastify', 'pg', 'ioredis', 'bullmq', '@pk/*'],
        message: '@pk/shared must stay framework-free (zod only).',
      }),
    },
  },
  {
    // Backend layering: other modules' repositories are private (D-43)
    files: ['apps/backend/src/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict({
        group: ['../*/*.repository', '**/modules/*/*.repository'],
        message: "Use the other module's service, never its repository (architecture/09 §2.1).",
      }),
    },
  },
  {
    files: ['apps/backend/src/modules/**/*.controller.ts', 'apps/backend/src/modules/**/*.routes.ts'],
    rules: {
      'no-restricted-imports': restrict(
        {
          group: ['../*/*.repository', '**/modules/*/*.repository', './*.repository'],
          message: 'Controllers/routes never touch SQL — go through the service (architecture/09 §2.1).',
        },
        { group: ['pg'], message: 'No SQL outside repositories.' },
      ),
    },
  },
  {
    // Direct UPI service (D-59) stays deletable: it reaches the store over HTTP only, and nothing
    // in the store imports it (grep '@pk/payment' outside apps/payment must stay empty)
    files: ['apps/payment/src/**/*.ts', 'apps/payment/scripts/**/*.ts', 'apps/payment/tests/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict({
        group: ['@pk/backend', '@pk/backend/*', '@pk/database', '**/apps/backend/**', '**/packages/database/**'],
        message: 'The payment service talks to the store over HTTP only (D-59).',
      }),
    },
  },
  {
    // Packing Desk service worker (Phase 7): plain JS template, runs in the SW global scope
    files: ['apps/admin/src/pwa/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['**/tests/**', '**/*.test.ts', '**/*.config.{ts,js,mjs}', 'scripts/**', 'apps/*/scripts/**'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
