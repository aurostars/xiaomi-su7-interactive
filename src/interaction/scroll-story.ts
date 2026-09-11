import type { CameraView } from '../scene/camera-controller';

export interface StorySection {
  element: HTMLElement;
  view: CameraView;
}

export type ScrollProgressHandler = (view: CameraView, progress: number) => void;

export interface ScrollStory {
  update(autoCameraSuspendedUntil?: number): void;
  dispose(): void;
}

export function createScrollStory(
  sections: readonly StorySection[],
  onProgress: ScrollProgressHandler,
): ScrollStory {
  let disposed = false;

  return {
    update(autoCameraSuspendedUntil = 0) {
      if (disposed || Date.now() < autoCameraSuspendedUntil || sections.length === 0) return;

      const viewportCenter = window.innerHeight / 2;
      const section = sections.find(({ element }) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top <= viewportCenter && bounds.bottom > viewportCenter;
      });
      if (!section) return;

      const bounds = section.element.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (viewportCenter - bounds.top) / bounds.height));
      onProgress(section.view, progress);
    },
    dispose() {
      disposed = true;
    },
  };
}
