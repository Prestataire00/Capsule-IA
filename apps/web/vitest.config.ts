import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(
        __dirname,
        'node_modules/next/dist/compiled/server-only/empty.js',
      ),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'tests/e2e'],
  },
});
