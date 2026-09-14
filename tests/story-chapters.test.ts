import { describe, expect, it } from 'vitest';
import { STORY_CHAPTERS } from '../src/content/story-chapters';

describe('story chapters', () => {
  it('defines exactly three uniquely ordered story chapters', () => {
    const ids = STORY_CHAPTERS.map(({ id }) => id);

    expect(ids).toEqual([
      'aero',
      'performance',
      'cabin',
    ]);
    expect(new Set(ids).size).toBe(3);
  });

  it('provides complete content and non-empty bullets for every chapter', () => {
    STORY_CHAPTERS.forEach((chapter) => {
      expect(Object.keys(chapter)).toEqual(['id', 'eyebrow', 'title', 'description', 'bullets']);
      expect(chapter.eyebrow.trim()).not.toBe('');
      expect(chapter.title.trim()).not.toBe('');
      expect(chapter.description.trim()).not.toBe('');
      expect(chapter.bullets.length).toBeGreaterThan(0);
      expect(chapter.bullets.every((bullet) => bullet.trim().length > 0)).toBe(true);
    });
  });
});
