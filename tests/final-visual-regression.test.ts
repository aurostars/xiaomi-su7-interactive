import { describe, expect, it } from 'vitest';
import {
  automotiveLighting,
  pixelRatioCap,
  pixelRatioFor,
  rendererOptions,
  automotiveSurface,
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

  it('provides environment reflections and a grounded contact shadow', () => {
    expect(automotiveSurface.environmentIntensity).toBeGreaterThanOrEqual(1);
    expect(automotiveSurface.groundOpacity).toBeGreaterThan(0.3);
    expect(automotiveSurface.groundSize).toBeGreaterThanOrEqual(30);
  });
});
