import { describe, expect, it, vi } from 'vitest';
import * as sceneModule from '../src/scene/create-scene';

describe('scene resize lifecycle', () => {
  it('keeps diagnostic rendering interaction-driven instead of periodically saturating software WebGL', () => {
    const renderFrameInterval = (sceneModule as typeof sceneModule & {
      renderFrameInterval?: (diagnostics: boolean) => number;
    }).renderFrameInterval;
    expect(renderFrameInterval).toBeTypeOf('function');
    expect(renderFrameInterval?.(true)).toBe(Number.POSITIVE_INFINITY);
    expect(renderFrameInterval?.(false)).toBe(0);
  });

  it('orders each frame beforeRender, renderer.render, then onRendered and clears lifecycle callbacks', () => {
    const createRenderLifecycle = (sceneModule as typeof sceneModule & {
      createRenderLifecycle?: (
        renderScene: () => void,
        onRendered: () => void,
      ) => {
        setBeforeRender(callback: (now: number) => void): () => void;
        render(now: number): void;
        dispose(): void;
      };
    }).createRenderLifecycle;
    expect(createRenderLifecycle).toBeTypeOf('function');
    if (!createRenderLifecycle) return;

    const order: string[] = [];
    const lifecycle = createRenderLifecycle(
      () => order.push('renderer.render'),
      () => order.push('onRendered'),
    );
    const clearBeforeRender = lifecycle.setBeforeRender((now) => order.push(`beforeRender:${now}`));

    lifecycle.render(42);
    expect(order).toEqual(['beforeRender:42', 'renderer.render', 'onRendered']);

    clearBeforeRender();
    lifecycle.render(84);
    expect(order).toEqual([
      'beforeRender:42',
      'renderer.render',
      'onRendered',
      'renderer.render',
      'onRendered',
    ]);

    lifecycle.dispose();
    lifecycle.render(126);
    expect(order).toHaveLength(5);
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
