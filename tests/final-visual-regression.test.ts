import { readFileSync } from 'node:fs';
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

  it('keeps the mobile cabin card inside the stage reserve without removed story overlay styles', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const mobileRules = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    const cabinRule = mobileRules.match(/\.cabin-detail \{([\s\S]*?)\}/)?.[1] ?? '';

    expect(cabinRule).toContain('position: absolute');
    expect(cabinRule).not.toContain('position: fixed');
    expect(cabinRule).toContain('top: 108px');
    expect(cabinRule).toContain('bottom: auto');
    expect(cabinRule).toContain('max-height: calc(52dvh - 120px)');
    expect(mobileRules).toMatch(/\.vehicle-stage\[data-mode=['"]cabin['"]\]\s+\.hero-copy\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/);
    expect(css).not.toMatch(/\.(?:header-cta|story-hotspots?|hotspot-marker|hotspot-pulse|story-detail|mobile-story-rail)(?:\b|\[|:)/);
    expect(css).not.toMatch(/\.brand(?:\s|\{|span)/);
  });

  it('keeps desktop story copy inside the left safe region and stages the vehicle on the right', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const desktopStoryRule = css.match(/\.story-section\s*\{([^}]*)\}/)?.[1] ?? '';
    const storyCopyRule = css.match(/\.story-copy\s*\{([^}]*)\}/)?.[1] ?? '';
    const focusZoneRule = css.match(/\.vehicle-focus-zone\s*\{([^}]*)\}/)?.[1] ?? '';
    const visualRule = css.match(/\.vehicle-visual\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(desktopStoryRule).toContain('grid-template-columns: minmax(0, 40%) minmax(0, 60%)');
    expect(storyCopyRule).toContain('max-width: 420px');
    expect(focusZoneRule).toContain('inset: 20% 4% 16% 40%');
    expect(visualRule).toContain('opacity: calc(1 - var(--stage-exit-progress))');
    expect(css).toMatch(/\.vehicle-visual\[data-stage-visibility=['"]hidden['"]\]\s*\{[^}]*pointer-events:\s*none;[^}]*z-index:\s*0;/);
  });

  it('provides environment reflections and a grounded contact shadow', () => {
    expect(automotiveSurface.environmentIntensity).toBeGreaterThanOrEqual(1);
    expect(automotiveSurface.groundOpacity).toBeGreaterThan(0.3);
    expect(automotiveSurface.groundSize).toBeGreaterThanOrEqual(30);
  });
});
