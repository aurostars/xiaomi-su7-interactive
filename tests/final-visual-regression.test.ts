import { describe, expect, it } from 'vitest';
import {
  automotiveLighting,
  pixelRatioCap,
  pixelRatioFor,
  rendererOptions,
  automotiveSurface,
} from '../src/scene/create-scene';

describe('final visual regression guardrails', () => {
  it('keeps high-quality antialiasing while bounding constrained render cost', () => {
    expect(rendererOptions('low').antialias).toBe(false);
    expect(rendererOptions('high').antialias).toBe(true);
    expect(pixelRatioCap('low')).toBe(1);
    expect(pixelRatioFor('low', 2)).toBe(1);
    expect(pixelRatioFor('high', 1)).toBe(1.5);
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
