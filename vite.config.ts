import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/xiaomi-su7-interactive/',
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
