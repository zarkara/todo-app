import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api-integration',
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // Suites share one database. Don't rely on this setting alone: suites that drop or
    // recreate tables use their own schema (see migrations.integration.test.ts).
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://todo:todo@localhost:5432/todo',
    },
  },
});
