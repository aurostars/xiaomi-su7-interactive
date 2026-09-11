import { describe, expect, it, vi } from 'vitest';
import * as sceneModule from '../src/scene/create-scene';

describe('scene resize lifecycle', () => {
  it('caps diagnostic rendering instead of continuously saturating software WebGL', () => {
    const renderFrameInterval = (sceneModule as typeof sceneModule & {
      renderFrameInterval?: (diagnostics: boolean) => number;
    }).renderFrameInterval;
    expect(renderFrameInterval).toBeTypeOf('function');
    expect(renderFrameInterval?.(true)).toBe(2_000);
    expect(renderFrameInterval?.(false)).toBe(0);
  });

  it('resizes with the window and removes the listener on dispose', () => {
    const bindSceneResize = (sceneModule as typeof sceneModule & {
      bindSceneResize?: (resize: () => void) => () => void;
    }).bindSceneResize;
    expect(bindSceneResize).toBeTypeOf('function');
    if (!bindSceneResize) return;

    const resize = vi.fn();
    const dispose = bindSceneResize(resize);

    window.dispatchEvent(new Event('resize'));
    expect(resize).toHaveBeenCalledTimes(1);

    dispose();
    window.dispatchEvent(new Event('resize'));
    expect(resize).toHaveBeenCalledTimes(1);
  });
});
