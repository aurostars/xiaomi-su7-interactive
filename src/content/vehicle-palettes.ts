export interface VehiclePaletteOption<Id extends string> {
  id: Id;
  label: string;
  swatch: string;
  materialColor: number;
}

export const PAINT_OPTIONS = [
  { id: 'gulf-blue', label: '海湾蓝', swatch: '#2f6f91', materialColor: 0x2f6f91 },
  { id: 'elegant-gray', label: '雅灰', swatch: '#868987', materialColor: 0x868987 },
  { id: 'olive-green', label: '橄榄绿', swatch: '#59614b', materialColor: 0x59614b },
  { id: 'pearl-white', label: '珍珠白', swatch: '#ecebe6', materialColor: 0xecebe6 },
  { id: 'diamond-black', label: '钻石黑', swatch: '#111315', materialColor: 0x111315 },
  { id: 'meteor-blue', label: '流星蓝', swatch: '#4d6675', materialColor: 0x4d6675 },
  { id: 'radiant-purple', label: '霞光紫', swatch: '#7a667b', materialColor: 0x7a667b },
  { id: 'lava-orange', label: '熔岩橙', swatch: '#c84a20', materialColor: 0xc84a20 },
  { id: 'basalt-gray', label: '寒武岩灰', swatch: '#44494d', materialColor: 0x44494d },
] as const;

export const INTERIOR_OPTIONS = [
  { id: 'galaxy-gray', label: '银河灰', swatch: '#969793', materialColor: 0x969793 },
  { id: 'obsidian-black', label: '曜石黑', swatch: '#11161c', materialColor: 0x11161c },
  { id: 'twilight-red', label: '暮光红', swatch: '#642b34', materialColor: 0x642b34 },
  { id: 'mist-purple', label: '迷雾紫', swatch: '#6b5f70', materialColor: 0x6b5f70 },
] as const;

export type PaintId = typeof PAINT_OPTIONS[number]['id'];
export type InteriorId = typeof INTERIOR_OPTIONS[number]['id'];

export function getPaintOption(id: string): typeof PAINT_OPTIONS[number] {
  return PAINT_OPTIONS.find((option) => option.id === id) ?? PAINT_OPTIONS[0];
}

export function getInteriorOption(id: string): typeof INTERIOR_OPTIONS[number] {
  return INTERIOR_OPTIONS.find((option) => option.id === id) ?? INTERIOR_OPTIONS[1];
}
