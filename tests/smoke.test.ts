import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('vite deployment config', () => {
  it('uses the GitHub Pages repository base path', () => {
    expect(config.base).toBe('/xiaomi-su7-interactive/');
  });
});
