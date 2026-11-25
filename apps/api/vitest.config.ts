import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      'node_modules',
      'dist',
      'src/files/__tests__/**', // Skip file tests (Sharp dependency)
    ],
  },
});
