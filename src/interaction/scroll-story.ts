import type { StoryId } from '../content/story-chapters';

export interface StorySection {
  element: HTMLElement;
  view: StoryId;
}

export type ScrollProgressHandler = (view: StoryId, progress: number) => void;

export interface ScrollStory {
  update(autoCameraSuspendedUntil?: number): void;
  dispose(): void;
}

export function createScrollStory(
  sections: readonly StorySection[],
  onProgress: ScrollProgressHandler,
  getAutoCameraSuspendedUntil: () => number = () => 0,
): ScrollStory {
  let disposed = false;
  let lastView: StoryId | undefined;
  let lastProgress = Number.NaN;

  const update = (autoCameraSuspendedUntil = getAutoCameraSuspendedUntil()) => {
    if (disposed || Date.now() < autoCameraSuspendedUntil || sections.length === 0) return;

    const viewportCenter = window.innerHeight / 2;
    const section = sections.find(({ element }) => {
      const bounds = element.getBoundingClientRect();
      return bounds.top <= viewportCenter && bounds.bottom > viewportCenter;
    });
    if (!section) return;

    const bounds = section.element.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (viewportCenter - bounds.top) / bounds.height));
    if (section.view === lastView && Math.abs(progress - lastProgress) < .0001) return;
    lastView = section.view;
    lastProgress = progress;
    onProgress(section.view, progress);
  };
  const onViewportChange = () => update();
  window.addEventListener('scroll', onViewportChange, { passive: true });
  window.addEventListener('resize', onViewportChange);

  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
    },
  };
}
