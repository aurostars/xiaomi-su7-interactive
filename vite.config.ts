import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export function buildOutDir(env: Record<string, string | undefined>): string {
  return env.VITE_E2E_DIAGNOSTICS === '1' ? 'dist-e2e' : 'dist';
}

export default defineConfig({
  base: '/xiaomi-su7-interactive/',
  build: {
    outDir: buildOutDir(loadEnv('production', '.', '')),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
