import { describe, expect, it } from 'vitest';
import { buildOutDir } from '../vite.config';

describe('build output isolation', () => {
  it('keeps production and E2E diagnostic artifacts in separate directories', () => {
    expect(buildOutDir({})).toBe('dist');
    expect(buildOutDir({ VITE_E2E_DIAGNOSTICS: '0' })).toBe('dist');
    expect(buildOutDir({ VITE_E2E_DIAGNOSTICS: '1' })).toBe('dist-e2e');
  });
});
