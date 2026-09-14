export interface VehiclePaletteOption<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly swatch: string;
  readonly materialColor: number;
}

export interface PaintMaterialTuning {
  readonly color: number;
  readonly metalness: number;
  readonly roughness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
}

export interface PaintPaletteOption<Id extends string> extends VehiclePaletteOption<Id> {
  readonly material: PaintMaterialTuning;
}

export const PAINT_OPTIONS = [
  { id: 'gulf-blue', label: '海湾蓝', swatch: '#2f6f91', materialColor: 0x2f6f91, material: { color: 0x3f8db5, metalness: 0.72, roughness: 0.22, clearcoat: 0.96, clearcoatRoughness: 0.1 } },
  { id: 'elegant-gray', label: '雅灰', swatch: '#868987', materialColor: 0x868987, material: { color: 0xa6aaa7, metalness: 0.66, roughness: 0.28, clearcoat: 0.86, clearcoatRoughness: 0.14 } },
  { id: 'olive-green', label: '橄榄绿', swatch: '#59614b', materialColor: 0x59614b, material: { color: 0x6f7b59, metalness: 0.7, roughness: 0.27, clearcoat: 0.88, clearcoatRoughness: 0.14 } },
  { id: 'pearl-white', label: '珍珠白', swatch: '#ecebe6', materialColor: 0xecebe6, material: { color: 0xffffff, metalness: 0.58, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.09 } },
  { id: 'diamond-black', label: '钻石黑', swatch: '#111315', materialColor: 0x111315, material: { color: 0x20262b, metalness: 0.82, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 } },
  { id: 'meteor-blue', label: '流星蓝', swatch: '#4d6675', materialColor: 0x4d6675, material: { color: 0x66879a, metalness: 0.76, roughness: 0.24, clearcoat: 0.92, clearcoatRoughness: 0.12 } },
  { id: 'radiant-purple', label: '霞光紫', swatch: '#7a667b', materialColor: 0x7a667b, material: { color: 0x9a7f9e, metalness: 0.68, roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.13 } },
  { id: 'lava-orange', label: '熔岩橙', swatch: '#c84a20', materialColor: 0xc84a20, material: { color: 0xf05a24, metalness: 0.62, roughness: 0.2, clearcoat: 0.95, clearcoatRoughness: 0.1 } },
  { id: 'basalt-gray', label: '寒武岩灰', swatch: '#44494d', materialColor: 0x44494d, material: { color: 0x5e676e, metalness: 0.78, roughness: 0.24, clearcoat: 0.9, clearcoatRoughness: 0.12 } },
] as const satisfies readonly PaintPaletteOption<string>[];

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
