import { describe, expect, it, vi } from 'vitest';
import {
  createRenderScheduler,
  type RenderScheduler,
} from '../src/scene/render-scheduler';

function createHarness() {
  let nextHandle = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  const renderFrame = vi.fn<(time: number) => void>();

  const runtime: RenderScheduler = createRenderScheduler({
    requestAnimationFrame(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame(handle) {
      cancelled.push(handle);
      pending.delete(handle);
    },
    renderFrame,
  });

  return {
    runtime,
    renderFrame,
    pendingCount: () => pending.size,
    cancelledCount: () => cancelled.length,
    flush(time: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(time);
    },
  };
}

describe('render scheduler', () => {
  it('coalesces repeated single-frame requests', () => {
    const scheduler = createHarness();
    scheduler.runtime.requestFrame();
    scheduler.runtime.requestFrame();
    expect(scheduler.pendingCount()).toBe(1);
  });

  it('continues while a reason is active and stops after end', () => {
    const scheduler = createHarness();
    scheduler.runtime.begin('camera');
    scheduler.flush(0);
    expect(scheduler.pendingCount()).toBe(1);
    scheduler.runtime.end('camera');
    scheduler.flush(16);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it('does not stop until every active reason ends', () => {
    const scheduler = createHarness();
    scheduler.runtime.begin('camera');
    scheduler.runtime.begin('doors');
    scheduler.runtime.end('camera');
    expect(scheduler.runtime.isActive()).toBe(true);
    expect(scheduler.runtime.getActiveReasons()).toEqual(['doors']);
  });

  it('cancels pending work and ignores new requests after dispose', () => {
    const scheduler = createHarness();
    scheduler.runtime.requestFrame();
    scheduler.runtime.dispose();
    scheduler.runtime.requestFrame();
    scheduler.runtime.begin('story');
    expect(scheduler.cancelledCount()).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
  });
});
