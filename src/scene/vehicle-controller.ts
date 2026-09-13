import {
  Color,
  MathUtils,
  type Material,
} from 'three';
import { getInteriorOption, getPaintOption } from '../content/vehicle-palettes';
import type { VehicleState } from '../state/vehicle-state';
import type { DoorId, LoadedVehicle } from './load-vehicle';

export interface DoorAngles {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
}

export interface VehicleDiagnostics {
  paint: string | null;
  doorAngles: DoorAngles;
  yaw: number;
  materials: { body: number; interior: number; screens: number };
}

export interface VehicleController {
  applyState(state: VehicleState): void;
  setRotation(y: number): void;
  getDiagnostics(): VehicleDiagnostics;
  dispose(): void;
}

const DOOR_IDS: DoorId[] = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
const DOOR_OPEN_ANGLES: Record<DoorId, number> = {
  frontLeft: -1.05,
  frontRight: 1.05,
  rearLeft: -0.92,
  rearRight: 0.92,
};
const TRANSITION_MS = 360;
const CABIN_OBSIDIAN_COLOR = '#465566';

type ColorMaterial = Material & { color: Color };
type EmissiveMaterial = Material & { emissive: Color; emissiveIntensity: number };
type FrameHandle = ReturnType<typeof setTimeout> | number;
type DoorMotion = { from: number; target: number };

const hasColor = (material: Material): material is ColorMaterial =>
  'color' in material && material.color instanceof Color;
const hasEmissive = (material: Material): material is EmissiveMaterial =>
  'emissive' in material
  && material.emissive instanceof Color
  && 'emissiveIntensity' in material
  && typeof material.emissiveIntensity === 'number';

export type Invalidate = () => void;

export function createVehicleController(
  vehicle: LoadedVehicle,
  reducedMotion = false,
  invalidate: Invalidate = () => undefined,
): VehicleController {
  let frame: FrameHandle | undefined;
  let disposed = false;
  let startedAt = 0;
  let appliedDoorsOpen: boolean | undefined;
  const motions = {} as Record<DoorId, DoorMotion>;

  const schedule = (callback: (timestamp: number) => void): FrameHandle =>
    setTimeout(() => callback(Date.now()), 16);
  const cancel = (handle: FrameHandle) => clearTimeout(handle);

  const applyDoorProgress = (progress: number) => {
    const eased = 1 - Math.pow(1 - progress, 3);
    DOOR_IDS.forEach((doorId) => {
      const pivot = vehicle.doors[doorId];
      const motion = motions[doorId];
      if (pivot && motion) pivot.rotation.y = MathUtils.lerp(motion.from, motion.target, eased);
    });
  };

  const animate = (timestamp: number) => {
    if (disposed) return;
    if (!startedAt) startedAt = timestamp;
    const progress = Math.min(1, (timestamp - startedAt) / TRANSITION_MS);
    applyDoorProgress(progress);
    invalidate();
    if (progress < 1) frame = schedule(animate);
    else frame = undefined;
  };

  return {
    applyState(state) {
      if (disposed) return;

      vehicle.setCabinPresentation(state.mode === 'cabin');
      const bodyTarget = new Color(getPaintOption(state.paint).materialColor);
      const usesObsidian = getInteriorOption(state.interior).id === 'obsidian-black';
      const interiorTarget = new Color(
        state.mode === 'cabin' && usesObsidian
          ? CABIN_OBSIDIAN_COLOR
          : getInteriorOption(state.interior).materialColor,
      );
      vehicle.bodyMaterials.filter(hasColor).forEach((material) => {
        material.color.copy(bodyTarget);
        material.needsUpdate = true;
      });
      vehicle.interiorMaterials.filter(hasColor).forEach((material) => {
        material.color.copy(interiorTarget);
        material.needsUpdate = true;
      });
      vehicle.interiorMaterials.filter(hasEmissive).forEach((material) => {
        material.emissive.set(state.mode === 'cabin' && usesObsidian ? '#28394a' : '#000000');
        material.emissiveIntensity = state.mode === 'cabin' && usesObsidian ? 0.75 : 0;
        material.needsUpdate = true;
      });
      vehicle.screenMaterials.filter(hasEmissive).forEach((material) => {
        material.emissive.set('#72dfff');
        material.emissiveIntensity = state.mode === 'cabin' ? 0.7 : 0.18;
        material.needsUpdate = true;
      });

      if (appliedDoorsOpen !== state.doorsOpen) {
        if (frame !== undefined) cancel(frame);
        frame = undefined;
        appliedDoorsOpen = state.doorsOpen;
        DOOR_IDS.forEach((doorId) => {
          motions[doorId] = {
            from: vehicle.doors[doorId]?.rotation.y ?? 0,
            target: state.doorsOpen ? DOOR_OPEN_ANGLES[doorId] : 0,
          };
        });
        startedAt = 0;
        if (reducedMotion) {
          applyDoorProgress(1);
          invalidate();
        } else frame = schedule(animate);
      }
    },
    setRotation(y) {
      if (!disposed) vehicle.root.rotation.y = y;
    },
    getDiagnostics() {
      const paintMaterial = vehicle.bodyMaterials.find(hasColor);
      return {
        paint: paintMaterial?.color.getHexString() ?? null,
        doorAngles: {
          frontLeft: vehicle.doors.frontLeft?.rotation.y ?? null,
          frontRight: vehicle.doors.frontRight?.rotation.y ?? null,
          rearLeft: vehicle.doors.rearLeft?.rotation.y ?? null,
          rearRight: vehicle.doors.rearRight?.rotation.y ?? null,
        },
        yaw: vehicle.root.rotation.y,
        materials: {
          body: vehicle.bodyMaterials.length,
          interior: vehicle.interiorMaterials.length,
          screens: vehicle.screenMaterials.length,
        },
      };
    },
    dispose() {
      disposed = true;
      if (frame !== undefined) cancel(frame);
      frame = undefined;
    },
  };
}
