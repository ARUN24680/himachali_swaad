import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Real PostgreSQL 17 + Redis 7 containers, migrations applied once into a template DB (D-08)
          globalSetup: ['tests/helpers/global-setup.ts'],
          // Files share one Redis container and flush it between tests — run them one at a time.
          // (Each file still gets its own cloned PostgreSQL database.)
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
