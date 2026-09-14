export type RenderReason = 'camera' | 'doors' | 'lighting' | 'view-drag' | 'story';

export interface RenderScheduler {
  requestFrame(): void;
  begin(reason: RenderReason): void;
  end(reason: RenderReason): void;
  isActive(): boolean;
  getActiveReasons(): readonly RenderReason[];
  dispose(): void;
}

export function createRenderScheduler(options: {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  renderFrame: (time: number) => void;
}): RenderScheduler {
  const reasons = new Set<RenderReason>();
  let frameHandle: number | null = null;
  let disposed = false;

  const requestFrame = (): void => {
    if (disposed || frameHandle !== null) return;

    frameHandle = options.requestAnimationFrame((time) => {
      frameHandle = null;
      options.renderFrame(time);
      if (!disposed && reasons.size > 0) requestFrame();
    });
  };

  return {
    requestFrame,
    begin(reason) {
      if (disposed) return;
      reasons.add(reason);
      requestFrame();
    },
    end(reason) {
      reasons.delete(reason);
    },
    isActive() {
      return reasons.size > 0;
    },
    getActiveReasons() {
      return [...reasons];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reasons.clear();
      if (frameHandle !== null) {
        options.cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
    },
  };
}
