import { describe, expect, it } from 'vitest';
import {
  getInteriorOption,
  getPaintOption,
  INTERIOR_OPTIONS,
  PAINT_OPTIONS,
  type InteriorId,
  type PaintId,
} from '../src/content/vehicle-palettes';

const paintOption: (typeof PAINT_OPTIONS)[number] = getPaintOption('legacy-paint');
const interiorOption: (typeof INTERIOR_OPTIONS)[number] = getInteriorOption('legacy-interior');
const paintId: PaintId = paintOption.id;
const interiorId: InteriorId = interiorOption.id;
void paintId;
void interiorId;

describe('official initial-generation SU7 palettes', () => {
  it('exposes the exact official 9+4 colors in display order', () => {
    expect(PAINT_OPTIONS).toHaveLength(9);
    expect(PAINT_OPTIONS.map(({ label }) => label)).toEqual([
      '海湾蓝', '雅灰', '橄榄绿', '珍珠白', '钻石黑',
      '流星蓝', '霞光紫', '熔岩橙', '寒武岩灰',
    ]);
    expect(INTERIOR_OPTIONS).toEqual([
      { id: 'galaxy-gray', label: '银河灰', swatch: '#969793', materialColor: 0x969793 },
      { id: 'obsidian-black', label: '曜石黑', swatch: '#11161c', materialColor: 0x11161c },
      { id: 'twilight-red', label: '暮光红', swatch: '#642b34', materialColor: 0x642b34 },
      { id: 'mist-purple', label: '迷雾紫', swatch: '#6b5f70', materialColor: 0x6b5f70 },
    ]);
    expect(new Set(PAINT_OPTIONS.map(({ id }) => id)).size).toBe(9);
    expect(new Set(INTERIOR_OPTIONS.map(({ id }) => id)).size).toBe(4);
    INTERIOR_OPTIONS.forEach((option) => expect(option.materialColor).toBeTypeOf('number'));
  });

  it('provides bounded, differentiated physical material tuning for every paint', () => {
    for (const paint of PAINT_OPTIONS) {
      expect(paint.material.color).toBeTypeOf('number');
      expect(paint.material.metalness).toBeGreaterThanOrEqual(0);
      expect(paint.material.metalness).toBeLessThanOrEqual(1);
      expect(paint.material.roughness).toBeGreaterThanOrEqual(0);
      expect(paint.material.roughness).toBeLessThanOrEqual(1);
      expect(paint.material.clearcoat).toBeGreaterThan(0);
      expect(paint.material.clearcoat).toBeLessThanOrEqual(1);
      expect(paint.material.clearcoatRoughness).toBeGreaterThanOrEqual(0);
      expect(paint.material.clearcoatRoughness).toBeLessThanOrEqual(1);
    }

    expect(getPaintOption('diamond-black').material.color)
      .not.toBe(getPaintOption('pearl-white').material.color);
    expect(getPaintOption('elegant-gray').material.color)
      .not.toBe(getPaintOption('basalt-gray').material.color);
    expect(getPaintOption('lava-orange').material.clearcoat).toBeGreaterThanOrEqual(0.72);
  });

  it('falls unknown persisted values back to the official defaults', () => {
    expect(getPaintOption('legacy-paint')).toBe(PAINT_OPTIONS[0]);
    expect(getInteriorOption('legacy-interior')).toBe(INTERIOR_OPTIONS[1]);
  });
});
