import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
