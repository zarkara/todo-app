import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*', 'apps/api/vitest.integration.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.contract.ts',
        '**/src/test/**',
        '**/index.ts',
        '**/types.ts',
        '**/main.tsx',
        '**/server.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
