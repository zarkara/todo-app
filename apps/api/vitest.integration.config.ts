import { defineProject } from 'vitest/config';

// Set here, in the main process, so the global setup (which creates the database) sees it too;
// test.env below only reaches the test workers.
process.env.DATABASE_URL ??= 'postgres://todo:todo@localhost:5432/todo_test';

export default defineProject({
  test: {
    name: 'api-integration',
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/test/integrationDatabase.ts'],
    // Suites share one database. Don't rely on this setting alone: suites that drop or
    // recreate tables use their own schema (see migrations.integration.test.ts).
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
    },
  },
});
