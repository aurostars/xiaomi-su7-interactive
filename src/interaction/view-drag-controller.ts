export type ViewDragMode = 'exterior' | 'cabin';

export interface ManualViewOffset {
  yaw: number;
  pitch: number;
}

export interface ViewDragController {
  setEnabled(enabled: boolean): void;
  setMode(mode: ViewDragMode): void;
  reset(): void;
  dispose(): void;
}

export interface ViewDragCallbacks {
  applyOffset(offset: ManualViewOffset): void;
  beginInteraction(): void;
  endInteraction(): void;
  requestRender(): void;
}

const DRAG_THRESHOLD_PX = 3;
const YAW_RADIANS_PER_PIXEL = 0.006;
const EXTERIOR_PITCH_MIN = -0.28;
const EXTERIOR_PITCH_MAX = 0.42;
const CABIN_PITCH_MIN = -0.72;
const CABIN_PITCH_MAX = 0.72;

export function createViewDragController(
  element: HTMLElement | readonly HTMLElement[],
  callbacks: ViewDragCallbacks,
): ViewDragController {
  const interactionElements = element instanceof HTMLElement ? [element] : element;
  let enabled = false;
  let mode: ViewDragMode = 'exterior';
  let activePointer: number | undefined;
  let activeElement: HTMLElement | undefined;
  let interactionStarted = false;
  let startX = 0;
  let startY = 0;
  let origin: ManualViewOffset = { yaw: 0, pitch: 0 };
  let offset: ManualViewOffset = { yaw: 0, pitch: 0 };
  let disposed = false;

  const pitchBounds = () => mode === 'exterior'
    ? [EXTERIOR_PITCH_MIN, EXTERIOR_PITCH_MAX] as const
    : [CABIN_PITCH_MIN, CABIN_PITCH_MAX] as const;

  const releaseCapture = (pointerId: number) => {
    try {
      activeElement?.releasePointerCapture?.(pointerId);
    } catch {
      // Capture may already have been released by the browser on cancellation or blur.
    }
  };

  const finishInteraction = (releasePointer = true) => {
    if (activePointer === undefined) return;
    if (releasePointer) releaseCapture(activePointer);
    activePointer = undefined;
    activeElement = undefined;
    if (interactionStarted) callbacks.endInteraction();
    interactionStarted = false;
  };

  const onPointerDown = (event: PointerEvent) => {
    const eventElement = event.currentTarget as HTMLElement;
    if (!enabled || activePointer !== undefined || event.target !== eventElement) return;
    activePointer = event.pointerId;
    activeElement = eventElement;
    startX = event.clientX;
    startY = event.clientY;
    origin = { ...offset };
    eventElement.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!enabled || event.pointerId !== activePointer) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!interactionStarted) {
      if (Math.hypot(deltaX, deltaY) <= DRAG_THRESHOLD_PX) return;
      interactionStarted = true;
      callbacks.beginInteraction();
    }
    const [minimumPitch, maximumPitch] = pitchBounds();
    offset = {
      yaw: origin.yaw + deltaX * YAW_RADIANS_PER_PIXEL,
      pitch: Math.min(maximumPitch, Math.max(minimumPitch, origin.pitch + deltaY * YAW_RADIANS_PER_PIXEL)),
    };
    callbacks.applyOffset(offset);
    callbacks.requestRender();
  };

  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    finishInteraction();
  };
  const onBlur = () => finishInteraction();

  for (const interactionElement of interactionElements) {
    interactionElement.addEventListener('pointerdown', onPointerDown);
    interactionElement.addEventListener('pointermove', onPointerMove);
    interactionElement.addEventListener('pointerup', onPointerEnd);
    interactionElement.addEventListener('pointercancel', onPointerEnd);
  }
  window.addEventListener('blur', onBlur);

  const reset = () => {
    finishInteraction();
    offset = { yaw: 0, pitch: 0 };
    origin = offset;
    callbacks.applyOffset(offset);
    callbacks.requestRender();
  };

  return {
    setEnabled(nextEnabled) {
      if (disposed || enabled === nextEnabled) return;
      enabled = nextEnabled;
      if (!enabled) finishInteraction();
    },
    setMode(nextMode) {
      mode = nextMode;
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      finishInteraction();
      reset();
      for (const interactionElement of interactionElements) {
        interactionElement.removeEventListener('pointerdown', onPointerDown);
        interactionElement.removeEventListener('pointermove', onPointerMove);
        interactionElement.removeEventListener('pointerup', onPointerEnd);
        interactionElement.removeEventListener('pointercancel', onPointerEnd);
      }
      window.removeEventListener('blur', onBlur);
    },
  };
}
