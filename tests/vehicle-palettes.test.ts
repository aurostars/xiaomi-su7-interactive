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
    expect(PAINT_OPTIONS).toEqual([
      { id: 'gulf-blue', label: '海湾蓝', swatch: '#2f6f91', materialColor: 0x2f6f91 },
      { id: 'elegant-gray', label: '雅灰', swatch: '#868987', materialColor: 0x868987 },
      { id: 'olive-green', label: '橄榄绿', swatch: '#59614b', materialColor: 0x59614b },
      { id: 'pearl-white', label: '珍珠白', swatch: '#ecebe6', materialColor: 0xecebe6 },
      { id: 'diamond-black', label: '钻石黑', swatch: '#111315', materialColor: 0x111315 },
      { id: 'meteor-blue', label: '流星蓝', swatch: '#4d6675', materialColor: 0x4d6675 },
      { id: 'radiant-purple', label: '霞光紫', swatch: '#7a667b', materialColor: 0x7a667b },
      { id: 'lava-orange', label: '熔岩橙', swatch: '#c84a20', materialColor: 0xc84a20 },
      { id: 'basalt-gray', label: '寒武岩灰', swatch: '#44494d', materialColor: 0x44494d },
    ]);
    expect(INTERIOR_OPTIONS).toEqual([
      { id: 'galaxy-gray', label: '银河灰', swatch: '#969793', materialColor: 0x969793 },
      { id: 'obsidian-black', label: '曜石黑', swatch: '#11161c', materialColor: 0x11161c },
      { id: 'twilight-red', label: '暮光红', swatch: '#642b34', materialColor: 0x642b34 },
      { id: 'mist-purple', label: '迷雾紫', swatch: '#6b5f70', materialColor: 0x6b5f70 },
    ]);
    expect(new Set(PAINT_OPTIONS.map(({ id }) => id)).size).toBe(9);
    expect(new Set(INTERIOR_OPTIONS.map(({ id }) => id)).size).toBe(4);
    PAINT_OPTIONS.forEach((option) => expect(option.materialColor).toBeTypeOf('number'));
    INTERIOR_OPTIONS.forEach((option) => expect(option.materialColor).toBeTypeOf('number'));
  });

  it('falls unknown persisted values back to the official defaults', () => {
    expect(getPaintOption('legacy-paint')).toBe(PAINT_OPTIONS[0]);
    expect(getInteriorOption('legacy-interior')).toBe(INTERIOR_OPTIONS[1]);
  });
});
