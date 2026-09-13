import {
  BufferGeometry,
  FrontSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Texture,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const vehicleModelUrl = new URL('../assets/models/xiaomi-su7.glb', import.meta.url).href;
export const vehicleFallbackUrl = new URL('../assets/images/vehicle-fallback.webp', import.meta.url).href;

const BODY_MATERIAL_NAMES = ['car_body'];
const INTERIOR_MATERIAL_NAMES = [
  'interior1.001',
  'interior2.001',
  'interior3.001',
  'interior4.001',
];
const DOOR_DEFINITIONS = {
  frontLeft: { names: ['door1'], side: 'left', hinge: [-1.04, 0, -0.94] },
  rearLeft: { names: ['door2'], side: 'left', hinge: [-1.04, 0, 0.18] },
  frontRight: { names: ['door3'], side: 'right', hinge: [1.04, 0, -0.94] },
  rearRight: { names: ['door4'], side: 'right', hinge: [1.04, 0, 0.18] },
} as const;
const WINDOW_MATERIAL_NAMES = new Set(['car_window', 'car_lightglass']);
const CABIN_OCCLUDER_NODE_NAMES = ['outside'];

function tuneAutomotiveMaterial(material: Material) {
  if (!(material instanceof MeshPhysicalMaterial)) return;
  const name = normalizeName(material.name);
  if (name === 'car_body'
    || WINDOW_MATERIAL_NAMES.has(name)
    || name.includes('body_black')
    || name.includes('body_inside')) {
    material.side = FrontSide;
  }
  material.envMapIntensity = 1.35;
  if (name === 'car_body') {
    material.metalness = .58;
    material.roughness = .2;
    material.clearcoat = .9;
    material.clearcoatRoughness = .12;
  } else if (WINDOW_MATERIAL_NAMES.has(name)) {
    material.roughness = .12;
    material.envMapIntensity = 1.6;
  } else if (name.includes('body_black') || name.includes('iron')) {
    material.roughness = Math.max(material.roughness, .16);
    material.envMapIntensity = 1.15;
  }
  material.needsUpdate = true;
}

export type DoorId = keyof typeof DOOR_DEFINITIONS;
export type VehicleDoors = Partial<Record<DoorId, Object3D>>;

export interface VehicleCapabilities {
  bodyColor: boolean;
  interiorColor: boolean;
  screenGlow: boolean;
  doors: Record<DoorId, boolean>;
}

export interface LoadedVehicle {
  root: Object3D;
  bodyMaterials: Material[];
  interiorMaterials: Material[];
  screenMaterials: Material[];
  doors: VehicleDoors;
  capabilities: VehicleCapabilities;
  setCabinPresentation(enabled: boolean): void;
  /** Releases this vehicle's GPU resources and detaches it. Safe to call repeatedly. */
  dispose(): void;
}

const normalizeName = (name: string) => name.trim().toLowerCase();
const supportsEmissive = (material: Material) =>
  'emissive' in material && 'emissiveIntensity' in material;

function collectMaterials(root: Object3D, acceptedNames: readonly string[]): Material[] {
  const accepted = new Set(acceptedNames);
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!('material' in object)) return;
    const source = (object as Object3D & { material?: Material | Material[] }).material;
    const list = Array.isArray(source) ? source : source ? [source] : [];
    list.forEach((material) => {
      if (accepted.has(normalizeName(material.name))) materials.add(material);
    });
  });
  return [...materials];
}

function findNode(root: Object3D, names: readonly string[]): Object3D | undefined {
  const accepted = new Set(names);
  let match: Object3D | undefined;
  root.traverse((object) => {
    if (!match && accepted.has(normalizeName(object.name))) match = object;
  });
  return match;
}

function createDoorPivot(
  root: Object3D,
  door: Object3D | undefined,
  side: 'left' | 'right',
  hinge: readonly [number, number, number],
) {
  if (!door?.parent) return undefined;
  const pivot = new Group();
  pivot.name = `${door.name}-${side}-hinge`;
  pivot.position.set(...hinge);
  root.add(pivot);
  pivot.attach(door);
  return pivot;
}

function createCabinDisplays(root: Object3D): Material[] {
  const definitions = [
    {
      name: 'cabin-center-display',
      size: [0.3, 0.17] as const,
      position: [0.18, 0.94, -0.72] as const,
      rotation: [-0.08, 0, 0] as const,
    },
    {
      name: 'cabin-instrument-display',
      size: [0.16, 0.07] as const,
      position: [-0.38, 0.91, -0.72] as const,
      rotation: [-0.08, 0, 0] as const,
    },
  ];

  return definitions.map((definition) => {
    const material = new MeshStandardMaterial({
      color: 0x050608,
      emissive: 0x000000,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.35,
      toneMapped: false,
    });
    material.name = `${definition.name}-material`;
    const display = new Mesh(
      new PlaneGeometry(definition.size[0], definition.size[1]),
      material,
    );
    display.name = definition.name;
    display.position.set(
      definition.position[0],
      definition.position[1],
      definition.position[2],
    );
    display.rotation.set(
      definition.rotation[0],
      definition.rotation[1],
      definition.rotation[2],
    );
    root.add(display);
    return material;
  });
}

function disposeGpuResources(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!('geometry' in object) || !('material' in object)) return;
    const renderable = object as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (renderable.geometry instanceof BufferGeometry) geometries.add(renderable.geometry);
    const materialList = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    materialList.forEach((material) => materials.add(material));
  });

  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value instanceof Texture) textures.add(value);
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export function createLoadedVehicle(root: Object3D): LoadedVehicle {
  const bodyMaterials = collectMaterials(root, BODY_MATERIAL_NAMES);
  const interiorMaterials = collectMaterials(root, INTERIOR_MATERIAL_NAMES);
  const doors: VehicleDoors = {};
  for (const [id, definition] of Object.entries(DOOR_DEFINITIONS) as [
    DoorId,
    (typeof DOOR_DEFINITIONS)[DoorId],
  ][]) {
    const pivot = createDoorPivot(
      root,
      findNode(root, definition.names),
      definition.side,
      definition.hinge,
    );
    if (pivot) doors[id] = pivot;
  }
  const screenMaterials = createCabinDisplays(root);
  const cabinOccluders = CABIN_OCCLUDER_NODE_NAMES
    .map((name) => findNode(root, [name]))
    .filter((node): node is Object3D => Boolean(node));
  const originalOccluderVisibility = new Map(
    cabinOccluders.map((node) => [node, node.visible]),
  );
  let disposed = false;

  root.traverse((object) => {
    if (!('isMesh' in object)) return;
    const mesh = object as Object3D & { castShadow: boolean; receiveShadow: boolean; material?: Material | Material[] };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(tuneAutomotiveMaterial);
  });
  const windowMaterials = collectMaterials(root, [...WINDOW_MATERIAL_NAMES])
    .filter((material): material is MeshPhysicalMaterial => material instanceof MeshPhysicalMaterial);
  const exteriorWindowIntensity = new Map(
    windowMaterials.map((material) => [material, material.envMapIntensity]),
  );

  return {
    root,
    bodyMaterials,
    interiorMaterials,
    screenMaterials,
    doors,
    capabilities: {
      bodyColor: bodyMaterials.length > 0,
      interiorColor: interiorMaterials.length > 0,
      screenGlow: screenMaterials.some(supportsEmissive),
      doors: {
        frontLeft: Boolean(doors.frontLeft),
        frontRight: Boolean(doors.frontRight),
        rearLeft: Boolean(doors.rearLeft),
        rearRight: Boolean(doors.rearRight),
      },
    },
    setCabinPresentation(enabled) {
      if (disposed) return;
      cabinOccluders.forEach((node) => {
        node.visible = enabled ? false : (originalOccluderVisibility.get(node) ?? true);
      });
      windowMaterials.forEach((material) => {
        material.envMapIntensity = enabled ? 0.25 : (exteriorWindowIntensity.get(material) ?? 1.6);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeGpuResources(root);
    },
  };
}

export async function loadVehicle(
  url: string,
  onProgress: (progress: number) => void = () => undefined,
): Promise<LoadedVehicle> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url, (event) => {
    onProgress(event.total > 0 ? Math.min(1, event.loaded / event.total) : 0);
  });
  return createLoadedVehicle(gltf.scene);
}
