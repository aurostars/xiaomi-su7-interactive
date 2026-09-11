import {
  Color,
  MathUtils,
  type Material,
  type Object3D,
} from 'three';
import type { VehicleState } from '../state/vehicle-state';
import type { LoadedVehicle } from './load-vehicle';

export interface VehicleDiagnostics {
  paint: string | null;
  doorAngles: { left: number | null; right: number | null };
  yaw: number;
}

export interface VehicleController {
  applyState(state: VehicleState): void;
  setRotation(y: number): void;
  getDiagnostics(): VehicleDiagnostics;
  dispose(): void;
}

const DOOR_OPEN_ANGLE = 1.05;
const TRANSITION_MS = 360;
const PAINT_COLORS: Record<string, string> = {
  'lava-orange': '#ff4b2b',
  lava: '#ff4b2b',
  'gulf-blue': '#19b7ff',
  bay: '#19b7ff',
  aqua: '#0f7f72',
  red: '#d91f2d',
  pearl: '#f1f2ed',
  titanium: '#aeb4bb',
};
const INTERIOR_COLORS: Record<string, string> = {
  'obsidian-black': '#11161c',
  graphite: '#11161c',
  'cloud-brown': '#c4a484',
  sand: '#c4a484',
  crimson: '#8f3431',
  mist: '#756583',
};

type ColorMaterial = Material & { color: Color };
type FrameHandle = ReturnType<typeof setTimeout> | number;

const hasColor = (material: Material): material is ColorMaterial =>
  'color' in material && material.color instanceof Color;

export function createVehicleController(vehicle: LoadedVehicle): VehicleController {
  let frame: FrameHandle | undefined;
  let disposed = false;
  let startedAt = 0;
  let lastTimestamp = 0;
  let fromLeft = 0;
  let fromRight = 0;
  let targetLeft = 0;
  let targetRight = 0;

  const schedule = (callback: (timestamp: number) => void): FrameHandle =>
    setTimeout(() => callback(lastTimestamp + 16), 16);

  const cancel = (handle: FrameHandle) => {
    clearTimeout(handle);
  };

  const animate = (timestamp: number) => {
    if (disposed) return;
    if (!startedAt) startedAt = timestamp;
    lastTimestamp = timestamp;
    const progress = Math.min(1, (timestamp - startedAt) / TRANSITION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);

    if (vehicle.doors.left) {
      vehicle.doors.left.rotation.y = MathUtils.lerp(fromLeft, targetLeft, eased);
    }
    if (vehicle.doors.right) {
      vehicle.doors.right.rotation.y = MathUtils.lerp(fromRight, targetRight, eased);
    }

    if (progress < 1) frame = schedule(animate);
    else frame = undefined;
  };

  return {
    applyState(state) {
      if (disposed) return;
      if (frame !== undefined) cancel(frame);
      const bodyTarget = new Color(PAINT_COLORS[state.paint] ?? state.paint);
      const interiorTarget = new Color(INTERIOR_COLORS[state.interior] ?? state.interior);
      vehicle.bodyMaterials.filter(hasColor).forEach((material) => {
        material.color.copy(bodyTarget);
        material.needsUpdate = true;
      });
      vehicle.interiorMaterials.filter(hasColor).forEach((material) => {
        material.color.copy(interiorTarget);
        material.needsUpdate = true;
      });
      fromLeft = vehicle.doors.left?.rotation.y ?? 0;
      fromRight = vehicle.doors.right?.rotation.y ?? 0;
      targetLeft = state.doorsOpen ? -DOOR_OPEN_ANGLE : 0;
      targetRight = state.doorsOpen ? DOOR_OPEN_ANGLE : 0;
      startedAt = 0;
      frame = schedule(animate);
    },
    setRotation(y) {
      if (!disposed) vehicle.root.rotation.y = y;
    },
    getDiagnostics() {
      const paintMaterial = vehicle.bodyMaterials.find(hasColor);
      return {
        paint: paintMaterial?.color.getHexString() ?? null,
        doorAngles: {
          left: vehicle.doors.left?.rotation.y ?? null,
          right: vehicle.doors.right?.rotation.y ?? null,
        },
        yaw: vehicle.root.rotation.y,
      };
    },
    dispose() {
      disposed = true;
      if (frame !== undefined) cancel(frame);
      frame = undefined;
      startedAt = lastTimestamp;
    },
  };
}
