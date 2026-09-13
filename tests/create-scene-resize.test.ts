import { describe, expect, it, vi } from 'vitest';
import * as sceneModule from '../src/scene/create-scene';

function createFrameHarness() {
  let nextHandle = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const renderer = { render: vi.fn() };
  const lifecycle = sceneModule.createScheduledRenderLifecycle(
    () => renderer.render(),
    () => undefined,
    (callback) => {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    (handle) => pending.delete(handle),
  );

  return {
    lifecycle,
    renderer,
    pendingAnimationFrames: () => pending.size,
    flushAnimationFrame(time: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

describe('scene resize lifecycle', () => {
  it('renders once when invalidated and remains idle afterward', () => {
    const { lifecycle: runtime, renderer, flushAnimationFrame, pendingAnimationFrames } = createFrameHarness();

    runtime.requestRender();
    flushAnimationFrame(0);

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(pendingAnimationFrames()).toBe(0);
  });

  it('keeps rendering only while an activity reason is retained', () => {
    const { lifecycle: runtime, renderer, flushAnimationFrame, pendingAnimationFrames } = createFrameHarness();

    runtime.beginRenderActivity('camera');
    flushAnimationFrame(0);
    flushAnimationFrame(16);
    expect(renderer.render).toHaveBeenCalledTimes(2);

    runtime.endRenderActivity('camera');
    flushAnimationFrame(32);
    expect(pendingAnimationFrames()).toBe(0);
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
