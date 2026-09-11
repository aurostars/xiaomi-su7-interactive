import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  automotiveLighting,
  pixelRatioCap,
  pixelRatioFor,
  rendererOptions,
} from '../src/scene/create-scene';

describe('final visual regression guardrails', () => {
  it('keeps antialiasing enabled for the vehicle silhouette at every quality tier', () => {
    expect(rendererOptions('low').antialias).toBe(true);
    expect(rendererOptions('high').antialias).toBe(true);
    expect(pixelRatioCap('low')).toBeGreaterThanOrEqual(1.5);
    expect(pixelRatioFor('low', 1)).toBe(1.5);
  });

  it('uses a restrained lighting preset that preserves saturated paint color', () => {
    expect(automotiveLighting.exposure).toBeLessThanOrEqual(0.9);
    expect(
      automotiveLighting.ambient
      + automotiveLighting.key
      + automotiveLighting.cyan
      + automotiveLighting.warm,
    ).toBeLessThanOrEqual(2.5);
  });

  it('keeps the mobile vehicle below the hero CTA instead of underneath it', () => {
    const css = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
    expect(css).toMatch(/\.vehicle-canvas, \.vehicle-fallback \{ inset: 38%/);
  });
});
