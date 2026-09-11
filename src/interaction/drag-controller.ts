export interface DragCallbacks {
  rotateBy(deltaYaw: number): void;
  suspendAutoCamera(durationMs: number): void;
}

export interface DragController {
  dispose(): void;
}

const YAW_PER_PIXEL = 0.008;
const AUTO_CAMERA_PAUSE_MS = 10_000;

export function createDragController(
  element: HTMLElement,
  callbacks: DragCallbacks,
): DragController {
  let activePointer: number | undefined;
  let lastX = 0;

  const onPointerDown = (event: PointerEvent) => {
    activePointer = event.pointerId;
    lastX = event.clientX;
    element.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    const deltaX = event.clientX - lastX;
    lastX = event.clientX;
    if (deltaX === 0) return;
    callbacks.rotateBy(deltaX * YAW_PER_PIXEL);
    callbacks.suspendAutoCamera(AUTO_CAMERA_PAUSE_MS);
  };

  const finishPointer = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    element.releasePointerCapture?.(event.pointerId);
    activePointer = undefined;
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', finishPointer);
  element.addEventListener('pointercancel', finishPointer);

  return {
    dispose() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', finishPointer);
      element.removeEventListener('pointercancel', finishPointer);
      activePointer = undefined;
    },
  };
}
