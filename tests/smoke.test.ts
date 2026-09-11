import { beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../vite.config';

describe('vite deployment config', () => {
  it('uses the GitHub Pages repository base path', () => {
    expect(config.base).toBe('/xiaomi-su7-interactive/');
  });
});

describe('application foundation', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('resolves relative assets beneath the GitHub Pages repository base path', async () => {
    document.body.innerHTML = '<main id="app"></main>';

    const main = await import('../src/main') as {
      assetUrl?: (relativePath: string) => string;
    };

    expect(main.assetUrl?.('models/su7.glb')).toBe('/xiaomi-su7-interactive/models/su7.glb');
  });

  it('creates and mounts the application main element', async () => {
    await expect(import('../src/main')).resolves.toBeDefined();

    const app = document.body.firstElementChild;
    expect(app?.tagName).toBe('MAIN');
    expect(app?.id).toBe('app');
  });
});
