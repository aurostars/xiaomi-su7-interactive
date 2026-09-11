import {
  MathUtils,
  PerspectiveCamera,
  Vector3,
} from 'three';

export type CameraView =
  | 'aero'
  | 'performance'
  | 'cabin'
  | 'sensing'
  | 'driver'
  | 'passenger'
  | 'rear';

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  vehicleYaw: number;
}

export interface CameraController {
  setTarget(view: CameraView): void;
  update(delta: number): void;
}

export const CAMERA_PRESETS: Record<CameraView, CameraPreset> = {
  aero: { position: [6.8, 2.8, 7.8], target: [0, 0.7, 0], fov: 32, vehicleYaw: -0.18 },
  performance: { position: [5.2, 1.2, 5.8], target: [0.2, 0.55, 0], fov: 28, vehicleYaw: 0.3 },
  cabin: { position: [2.4, 1.55, 2.3], target: [0, 1.05, -0.15], fov: 38, vehicleYaw: -0.08 },
  sensing: { position: [-5.5, 2.2, 6.2], target: [0, 0.8, 0.2], fov: 34, vehicleYaw: 0.48 },
  driver: { position: [0.48, 1.42, 0.42], target: [0.35, 1.35, -2.1], fov: 44, vehicleYaw: 0 },
  passenger: { position: [-0.48, 1.42, 0.42], target: [-0.3, 1.32, -2.05], fov: 44, vehicleYaw: 0 },
  rear: { position: [0, 1.48, 1.58], target: [0, 1.28, -1.15], fov: 47, vehicleYaw: 0 },
};

const DAMPING = 5;

export function createCameraController(camera: PerspectiveCamera): CameraController {
  const lookTarget = new Vector3(0, 0.7, 0);
  const targetPosition = camera.position.clone();
  const targetLook = lookTarget.clone();
  let targetFov = camera.fov;

  return {
    setTarget(view) {
      const preset = CAMERA_PRESETS[view];
      targetPosition.fromArray(preset.position);
      targetLook.fromArray(preset.target);
      targetFov = preset.fov;
    },
    update(delta) {
      const alpha = 1 - Math.exp(-DAMPING * Math.max(0, delta));
      camera.position.lerp(targetPosition, alpha);
      lookTarget.lerp(targetLook, alpha);
      camera.fov = MathUtils.lerp(camera.fov, targetFov, alpha);
      camera.lookAt(lookTarget);
      camera.updateProjectionMatrix();
    },
  };
}
