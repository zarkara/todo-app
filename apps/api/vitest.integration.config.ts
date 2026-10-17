import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api-integration',
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // Integration suites share one database, so they must not run concurrently.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://todo:todo@localhost:5432/todo',
    },
  },
});
