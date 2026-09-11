import { describe, expect, it } from 'vitest';
import {
  createStageFeedback,
  detectCapabilities,
} from '../src/performance/capabilities';

describe('detectCapabilities', () => {
  it('uses the static fallback when WebGL is unavailable', () => {
    expect(detectCapabilities({ webgl: false })).toEqual({
      webgl: false,
      reducedMotion: false,
      quality: 'fallback',
    });
  });

  it('preserves the user reduced-motion preference', () => {
    expect(detectCapabilities({ webgl: true, reducedMotion: true })).toMatchObject({
      webgl: true,
      reducedMotion: true,
    });
  });

  it('uses balanced quality on constrained devices', () => {
    expect(detectCapabilities({
      webgl: true,
      deviceMemory: 2,
      hardwareConcurrency: 2,
      devicePixelRatio: 3,
    }).quality).toBe('balanced');
  });

  it('uses high quality on capable devices', () => {
    expect(detectCapabilities({
      webgl: true,
      deviceMemory: 8,
      hardwareConcurrency: 8,
      devicePixelRatio: 2,
    }).quality).toBe('high');
  });
});


describe('vehicle stage feedback', () => {
  const setup = () => {
    const stage = document.createElement('div');
    const canvas = document.createElement('canvas');
    stage.append(canvas);
    const retries: number[] = [];
    const feedback = createStageFeedback(stage, canvas, '/vehicle-fallback.webp', () => {
      retries.push(1);
    });
    return { stage, canvas, retries, feedback };
  };

  it('announces loading progress inside the vehicle stage', () => {
    const { stage, feedback } = setup();

    feedback.loading(0.42);

    expect(stage.querySelector('[role="status"]')?.textContent).toContain('42%');
    expect(stage.querySelector('progress')?.getAttribute('value')).toBe('42');
  });

  it('shows a static vehicle and retry action after model failure', () => {
    const { stage, canvas, retries, feedback } = setup();

    feedback.failed('车辆模型加载失败');
    stage.querySelector<HTMLButtonElement>('button')?.click();

    expect(canvas.hidden).toBe(true);
    expect(stage.querySelector<HTMLImageElement>('img')?.src).toContain('vehicle-fallback.webp');
    expect(stage.querySelector('[role="alert"]')?.textContent).toContain('车辆模型加载失败');
    expect(retries).toHaveLength(1);
  });

  it('restores the canvas and removes status UI when a retry succeeds', () => {
    const { stage, canvas, feedback } = setup();
    feedback.failed('加载失败');

    feedback.ready();

    expect(canvas.hidden).toBe(false);
    expect(stage.querySelector('.vehicle-stage-feedback')).toBeNull();
    expect(stage.querySelector('.vehicle-fallback')).toBeNull();
  });
});
