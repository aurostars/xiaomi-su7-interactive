import {
  Group,
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
const LEFT_DOOR_NAMES = ['door1'];
const RIGHT_DOOR_NAMES = ['door3'];

export interface VehicleCapabilities {
  bodyColor: boolean;
  interiorColor: boolean;
  leftDoor: boolean;
  rightDoor: boolean;
}

export interface LoadedVehicle {
  root: Object3D;
  bodyMaterials: Material[];
  interiorMaterials: Material[];
  doors: {
    left?: Object3D;
    right?: Object3D;
  };
  capabilities: VehicleCapabilities;
}

const normalizeName = (name: string) => name.trim().toLowerCase();

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
  if (!door?.parent) return door;
  const pivot = new Group();
  pivot.name = `${door.name}-${side}-hinge`;
  pivot.position.set(...hinge);
  root.add(pivot);
  pivot.attach(door);
  return pivot;
}

export async function loadVehicle(
  url: string,
  onProgress: (progress: number) => void = () => undefined,
): Promise<LoadedVehicle> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url, (event) => {
    onProgress(event.total > 0 ? Math.min(1, event.loaded / event.total) : 0);
  });
  const root = gltf.scene;
  const bodyMaterials = collectMaterials(root, BODY_MATERIAL_NAMES);
  const interiorMaterials = collectMaterials(root, INTERIOR_MATERIAL_NAMES);
  const leftDoor = createDoorPivot(
    root,
    findNode(root, LEFT_DOOR_NAMES),
    'left',
    [-1.04, 0, -0.94],
  );
  const rightDoor = createDoorPivot(
    root,
    findNode(root, RIGHT_DOOR_NAMES),
    'right',
    [1.04, 0, -0.94],
  );

  root.traverse((object) => {
    if (!('isMesh' in object)) return;
    const mesh = object as Object3D & { castShadow: boolean; receiveShadow: boolean };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return {
    root,
    bodyMaterials,
    interiorMaterials,
    doors: { left: leftDoor, right: rightDoor },
    capabilities: {
      bodyColor: bodyMaterials.length > 0,
      interiorColor: interiorMaterials.length > 0,
      leftDoor: Boolean(leftDoor),
      rightDoor: Boolean(rightDoor),
    },
  };
}
