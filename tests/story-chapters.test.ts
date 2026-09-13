import { describe, expect, it } from 'vitest';
import { STORY_CHAPTERS } from '../src/content/story-chapters';

describe('story chapters', () => {
  it('defines exactly four uniquely ordered story chapters', () => {
    const ids = STORY_CHAPTERS.map(({ id }) => id);

    expect(ids).toEqual(['aero', 'performance', 'cabin', 'intelligence']);
    expect(new Set(ids).size).toBe(4);
  });

  it('provides complete content and hotspot metadata for every chapter', () => {
    STORY_CHAPTERS.forEach((chapter) => {
      expect(chapter.eyebrow.trim()).not.toBe('');
      expect(chapter.title.trim()).not.toBe('');
      expect(chapter.description.trim()).not.toBe('');
      expect(chapter.tags.length).toBeGreaterThan(0);
      expect(chapter.tags.every((tag) => tag.trim().length > 0)).toBe(true);
      expect(chapter.hotspot.label.trim()).not.toBe('');
      expect(Number.isFinite(chapter.hotspot.x)).toBe(true);
      expect(Number.isFinite(chapter.hotspot.y)).toBe(true);
    });
  });
});
