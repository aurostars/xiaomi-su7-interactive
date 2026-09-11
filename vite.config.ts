import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/xiaomi-su7-interactive/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
