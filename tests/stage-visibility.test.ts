import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateStageVisibility,
  createStageVisibilityController,
} from '../src/interaction/stage-visibility';

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 1000,
    bottom: top + height,
    left: 0,
    width: 1000,
    height,
    toJSON: () => undefined,
  };
}

describe('stage visibility calculation', () => {
  it('keeps the stage visible before the final story fade boundary', () => {
    expect(calculateStageVisibility({
      finalStoryTop: 900, finalStoryHeight: 1000, technologyTop: 1900,
      viewportHeight: 900, reducedMotion: false,
    })).toEqual({ phase: 'visible', progress: 0 });
  });

  it('starts fading at exactly 80% story progress when technology has not entered', () => {
    expect(calculateStageVisibility({
      finalStoryTop: -350, finalStoryHeight: 1000, technologyTop: 1900,
      viewportHeight: 900, reducedMotion: false,
    })).toEqual({ phase: 'fading', progress: 0 });
  });

  it('lets technology entry override the exact 80% fade boundary', () => {
    expect(calculateStageVisibility({
      finalStoryTop: -350, finalStoryHeight: 1000, technologyTop: 900,
      viewportHeight: 900, reducedMotion: false,
    })).toEqual({ phase: 'hidden', progress: 1 });
  });

  it('hides the stage at the terminal story boundary', () => {
    expect(calculateStageVisibility({
      finalStoryTop: -800, finalStoryHeight: 1000, technologyTop: 850,
      viewportHeight: 900, reducedMotion: false,
    })).toEqual({ phase: 'hidden', progress: 1 });
  });

  it('uses the hidden terminal state for any nonzero reduced-motion fade', () => {
    expect(calculateStageVisibility({
      finalStoryTop: -450, finalStoryHeight: 1000, technologyTop: 1900,
      viewportHeight: 900, reducedMotion: true,
    })).toEqual({ phase: 'hidden', progress: 1 });
  });

  it('becomes visible again when scrolling upward before the fade boundary', () => {
    const input = {
      finalStoryTop: -450, finalStoryHeight: 1000, technologyTop: 1900,
      viewportHeight: 900, reducedMotion: false,
    };
    expect(calculateStageVisibility(input).phase).toBe('fading');
    expect(calculateStageVisibility({ ...input, finalStoryTop: 900 }))
      .toEqual({ phase: 'visible', progress: 0 });
  });
});

describe('stage visibility controller', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes CSS, data and accessibility state and only reports changed state', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const stage = document.createElement('div');
    const finalStory = document.createElement('section');
    const technology = document.createElement('section');
    let finalTop = 900;
    vi.spyOn(finalStory, 'getBoundingClientRect').mockImplementation(() => rect(finalTop, 1000));
    vi.spyOn(technology, 'getBoundingClientRect').mockImplementation(() => rect(1900, 600));
    const changes: Array<{ phase: string; progress: number }> = [];
    const controller = createStageVisibilityController({
      stage, finalStory, technology, reducedMotion: false,
      onChange: (state) => changes.push(state),
    });

    expect(addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(controller.update()).toEqual({ phase: 'visible', progress: 0 });
    expect(stage.style.getPropertyValue('--stage-exit-progress')).toBe('0');
    expect(stage.dataset.stageVisibility).toBe('visible');
    expect(stage.getAttribute('aria-hidden')).toBe('false');
    controller.update();
    expect(changes).toEqual([{ phase: 'visible', progress: 0 }]);

    finalTop = -800;
    window.dispatchEvent(new Event('resize'));
    expect(stage.style.getPropertyValue('--stage-exit-progress')).toBe('1');
    expect(stage.dataset.stageVisibility).toBe('hidden');
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(changes.at(-1)).toEqual({ phase: 'hidden', progress: 1 });
    controller.dispose();
  });

  it('removes scroll and resize responses when disposed', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const stage = document.createElement('div');
    const finalStory = document.createElement('section');
    const technology = document.createElement('section');
    let finalTop = 900;
    vi.spyOn(finalStory, 'getBoundingClientRect').mockImplementation(() => rect(finalTop, 1000));
    vi.spyOn(technology, 'getBoundingClientRect').mockReturnValue(rect(1900, 600));
    const onChange = vi.fn();
    const controller = createStageVisibilityController({
      stage, finalStory, technology, reducedMotion: false, onChange,
    });
    controller.update();
    controller.dispose();
    onChange.mockClear();
    finalTop = -800;

    window.dispatchEvent(new Event('scroll'));
    expect(onChange).not.toHaveBeenCalled();
    expect(stage.style.getPropertyValue('--stage-exit-progress')).toBe('0');
    expect(stage.dataset.stageVisibility).toBe('visible');
    expect(stage.getAttribute('aria-hidden')).toBe('false');

    window.dispatchEvent(new Event('resize'));
    expect(onChange).not.toHaveBeenCalled();
    expect(stage.style.getPropertyValue('--stage-exit-progress')).toBe('0');
    expect(stage.dataset.stageVisibility).toBe('visible');
    expect(stage.getAttribute('aria-hidden')).toBe('false');
  });
});
