import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'extension',
          environment: 'node',
          include: ['apps/extension/test/**/*.test.ts'],
        },
      },
      'apps/web',
    ],
  },
});
