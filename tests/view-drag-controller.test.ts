import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createViewDragController, type ManualViewOffset } from '../src/interaction/view-drag-controller';

beforeAll(() => {
  if (!window.PointerEvent) {
    class TestPointerEvent extends MouseEvent {
      readonly pointerId: number;

      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });
    Object.defineProperty(globalThis, 'PointerEvent', { configurable: true, value: TestPointerEvent });
  }
});

function dispatchPointer(
  element: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  clientX: number,
  clientY: number,
  pointerId = 7,
) {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId }));
}

function createHarness() {
  const element = document.createElement('div');
  const offsets: ManualViewOffset[] = [];
  const beginInteraction = vi.fn();
  const endInteraction = vi.fn();
  const requestRender = vi.fn();
  const controller = createViewDragController(element, {
    applyOffset: (offset) => offsets.push({ ...offset }),
    beginInteraction,
    endInteraction,
    requestRender,
  });
  controller.setEnabled(true);
  return { beginInteraction, controller, element, endInteraction, offsets, requestRender };
}

describe('view drag controller', () => {
  it('keeps exterior yaw continuous across a full rotation', () => {
    const { beginInteraction, controller, element, offsets } = createHarness();

    dispatchPointer(element, 'pointerdown', 200, 100);
    dispatchPointer(element, 'pointermove', 1_400, 100);

    expect(offsets.at(-1)).toEqual({ yaw: 7.2, pitch: 0 });
    expect(Math.abs(offsets.at(-1)?.yaw ?? 0)).toBeGreaterThan(Math.PI * 2);
    expect(beginInteraction).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('clamps exterior and cabin pitch without clamping yaw', () => {
    const { controller, element, offsets } = createHarness();

    dispatchPointer(element, 'pointerdown', 0, 0, 1);
    dispatchPointer(element, 'pointermove', 2_000, 1_000, 1);
    dispatchPointer(element, 'pointerup', 2_000, 1_000, 1);
    expect(offsets.at(-1)).toEqual({ yaw: 12, pitch: 0.42 });

    controller.setMode('cabin');
    controller.reset();
    dispatchPointer(element, 'pointerdown', 0, 0, 2);
    dispatchPointer(element, 'pointermove', -2_000, -1_000, 2);
    expect(offsets.at(-1)).toEqual({ yaw: -12, pitch: -0.72 });
    controller.dispose();
  });

  it.each(['pointerup', 'pointercancel'] as const)(
    'ends render activity on %s while preserving the final offset',
    (eventName) => {
      const { beginInteraction, controller, element, endInteraction, offsets } = createHarness();

      dispatchPointer(element, 'pointerdown', 40, 50);
      dispatchPointer(element, 'pointermove', 50, 55);
      dispatchPointer(element, eventName, 50, 55);

      expect(beginInteraction).toHaveBeenCalledTimes(1);
      expect(endInteraction).toHaveBeenCalledTimes(1);
      expect(offsets).toEqual([{ yaw: 0.06, pitch: 0.03 }]);
      controller.dispose();
    },
  );

  it('reset cancels an active drag and ignores continuation from its old pointer', () => {
    const { beginInteraction, controller, element, endInteraction, offsets, requestRender } = createHarness();

    dispatchPointer(element, 'pointerdown', 10, 10);
    dispatchPointer(element, 'pointermove', 20, 20);
    controller.reset();
    dispatchPointer(element, 'pointermove', 30, 30);
    dispatchPointer(element, 'pointerup', 30, 30);

    expect(beginInteraction).toHaveBeenCalledTimes(1);
    expect(endInteraction).toHaveBeenCalledTimes(1);
    expect(offsets).toEqual([
      { yaw: 0.06, pitch: 0.06 },
      { yaw: 0, pitch: 0 },
    ]);
    expect(requestRender).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('does not capture pointer input started by an interactive descendant', () => {
    const { beginInteraction, controller, element, offsets } = createHarness();
    const button = document.createElement('button');
    element.append(button);

    dispatchPointer(button, 'pointerdown', 10, 10);
    dispatchPointer(element, 'pointermove', 30, 10);
    dispatchPointer(element, 'pointerup', 30, 10);

    expect(beginInteraction).not.toHaveBeenCalled();
    expect(offsets).toEqual([]);
    controller.dispose();
  });

  it('ends an active interaction on window blur while preserving its offset', () => {
    const { beginInteraction, controller, element, endInteraction, offsets } = createHarness();

    dispatchPointer(element, 'pointerdown', 10, 10);
    dispatchPointer(element, 'pointermove', 20, 20);
    window.dispatchEvent(new Event('blur'));
    dispatchPointer(element, 'pointermove', 30, 30);

    expect(beginInteraction).toHaveBeenCalledTimes(1);
    expect(endInteraction).toHaveBeenCalledTimes(1);
    expect(offsets).toEqual([{ yaw: 0.06, pitch: 0.06 }]);
    controller.dispose();
  });

  it('ends an active interaction when disabled and ignores later pointer events', () => {
    const { beginInteraction, controller, element, endInteraction, offsets } = createHarness();

    dispatchPointer(element, 'pointerdown', 10, 10);
    dispatchPointer(element, 'pointermove', 20, 20);
    controller.setEnabled(false);
    dispatchPointer(element, 'pointermove', 30, 30);
    dispatchPointer(element, 'pointerup', 30, 30);

    expect(beginInteraction).toHaveBeenCalledTimes(1);
    expect(endInteraction).toHaveBeenCalledTimes(1);
    expect(offsets).toEqual([{ yaw: 0.06, pitch: 0.06 }]);
    controller.dispose();
  });

  it('resets offsets and releases an active interaction on dispose', () => {
    const { beginInteraction, controller, element, endInteraction, offsets, requestRender } = createHarness();

    dispatchPointer(element, 'pointerdown', 10, 10);
    dispatchPointer(element, 'pointermove', 20, 20);
    controller.dispose();
    dispatchPointer(element, 'pointermove', 30, 30);
    dispatchPointer(element, 'pointerup', 30, 30);

    expect(beginInteraction).toHaveBeenCalledTimes(1);
    expect(endInteraction).toHaveBeenCalledTimes(1);
    expect(offsets).toEqual([
      { yaw: 0.06, pitch: 0.06 },
      { yaw: 0, pitch: 0 },
    ]);
    expect(requestRender).toHaveBeenCalledTimes(2);
  });
});
