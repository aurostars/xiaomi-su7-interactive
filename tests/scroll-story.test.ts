import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScrollStory } from '../src/interaction/scroll-story';

const views = ['aero', 'performance', 'cabin'] as const;

function makeSections() {
  let scrollY = 0;
  const sections = views.map((view, index) => {
    const element = document.createElement('section');
    element.getBoundingClientRect = () => ({
      x: 0,
      y: index * 800 - scrollY,
      top: index * 800 - scrollY,
      right: 1000,
      bottom: (index + 1) * 800 - scrollY,
      left: 0,
      width: 1000,
      height: 800,
      toJSON: () => undefined,
    });
    return { element, view };
  });

  return { sections, scrollTo: (value: number) => { scrollY = value; } };
}

describe('scroll story', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps the viewport center to each of the three content sections', () => {
    const fixture = makeSections();
    const selected: string[] = [];
    const story = createScrollStory(fixture.sections, (view) => selected.push(view));

    views.forEach((view, index) => {
      fixture.scrollTo(index * 800);
      story.update(0);
      expect(selected.at(-1)).toBe(view);
    });

    story.dispose();
  });

  it('reports continuous, geometry-derived progress inside the active section', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    const fixture = makeSections();
    const frames: Array<{ view: string; progress: number }> = [];
    const story = createScrollStory(fixture.sections, (view, progress) => frames.push({ view, progress }));

    fixture.scrollTo(200);
    story.update(0);
    fixture.scrollTo(600);
    story.update(0);

    expect(frames).toEqual([
      { view: 'aero', progress: 0.5 },
      { view: 'performance', progress: 0 },
    ]);
    story.dispose();
  });

  it('initializes from current geometry when listeners attach after scrolling', async () => {
    const fixture = makeSections();
    const selected: string[] = [];
    fixture.scrollTo(800);

    const story = createScrollStory(fixture.sections, (view) => selected.push(view));
    await Promise.resolve();

    expect(selected).toEqual(['performance']);
    story.dispose();
  });

  it('updates immediately from scroll input without waiting for the render loop', () => {
    const fixture = makeSections();
    const selected: string[] = [];
    const story = createScrollStory(fixture.sections, (view) => selected.push(view));

    fixture.scrollTo(800);
    window.dispatchEvent(new Event('scroll'));

    expect(selected).toEqual(['performance']);
    story.dispose();
  });

  it('does not repeat unchanged frames while the viewport is stationary', () => {
    const fixture = makeSections();
    const frames: Array<{ view: string; progress: number }> = [];
    const story = createScrollStory(fixture.sections, (view, progress) => frames.push({ view, progress }));

    story.update(0);
    story.update(0);

    expect(frames).toEqual([{ view: 'aero', progress: 0.25 }]);
    story.dispose();
  });

  it('does not drive the camera until autoCameraSuspendedUntil has elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fixture = makeSections();
    const selected: string[] = [];
    const story = createScrollStory(fixture.sections, (view) => selected.push(view));

    story.update(11_400);
    expect(selected).toEqual([]);

    vi.setSystemTime(11_400);
    story.update(11_400);
    expect(selected).toEqual(['aero']);

    story.dispose();
  });
});
