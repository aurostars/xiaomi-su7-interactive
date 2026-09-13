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
  near: number;
  vehicleYaw: number;
}

export interface CameraDiagnostics {
  view: CameraView;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
}

export interface StoryCameraFrame {
  view: CameraView;
  progress: number;
  vehicleYaw: number;
}

export interface CameraController {
  setTarget(view: CameraView): void;
  setStoryProgress(view: CameraView, progress: number): StoryCameraFrame;
  update(delta: number, immediate?: boolean): void;
  getDiagnostics(): CameraDiagnostics;
}

export const CAMERA_PRESETS: Record<CameraView, CameraPreset> = {
  aero: { position: [6.8, 2.8, 7.8], target: [0, 0.7, 0], fov: 32, near: 0.1, vehicleYaw: -0.18 },
  performance: { position: [5.2, 1.2, 5.8], target: [0.2, 0.55, 0], fov: 28, near: 0.1, vehicleYaw: 0.3 },
  cabin: { position: [2.4, 1.55, 2.3], target: [0, 1.05, -0.15], fov: 38, near: 0.1, vehicleYaw: -0.08 },
  sensing: { position: [-5.5, 2.2, 6.2], target: [0, 0.8, 0.2], fov: 34, near: 0.1, vehicleYaw: 0.48 },
  driver: { position: [-0.38, 1.26, 0.08], target: [-0.28, 1.06, -2.4], fov: 58, near: 0.025, vehicleYaw: 0 },
  passenger: { position: [0.38, 1.26, 0.08], target: [-0.25, 1.05, -2.35], fov: 58, near: 0.025, vehicleYaw: 0 },
  rear: { position: [0, 1.3, 1.28], target: [0, 1.05, -1.6], fov: 58, near: 0.025, vehicleYaw: 0 },
};

const STORY_VIEWS: CameraView[] = ['aero', 'performance', 'cabin', 'sensing'];
const DAMPING = 5;
const tuple = (value: Vector3): [number, number, number] => [value.x, value.y, value.z];

export function createCameraController(camera: PerspectiveCamera): CameraController {
  const lookTarget = new Vector3(0, 0.7, 0);
  const targetPosition = camera.position.clone();
  const targetLook = lookTarget.clone();
  let targetFov = camera.fov;
  let targetNear = camera.near;
  let currentView: CameraView = 'aero';

  const applyPreset = (preset: CameraPreset) => {
    targetPosition.fromArray(preset.position);
    targetLook.fromArray(preset.target);
    targetFov = preset.fov;
    targetNear = preset.near;
  };

  return {
    setTarget(view) {
      currentView = view;
      applyPreset(CAMERA_PRESETS[view]);
    },
    setStoryProgress(view, progress) {
      currentView = view;
      const from = CAMERA_PRESETS[view];
      const index = STORY_VIEWS.indexOf(view);
      const nextView = STORY_VIEWS[Math.min(index + 1, STORY_VIEWS.length - 1)] ?? view;
      const to = CAMERA_PRESETS[nextView];
      const amount = MathUtils.clamp(progress, 0, 1);
      targetPosition.fromArray(from.position).lerp(new Vector3(...to.position), amount);
      targetLook.fromArray(from.target).lerp(new Vector3(...to.target), amount);
      targetFov = MathUtils.lerp(from.fov, to.fov, amount);
      targetNear = MathUtils.lerp(from.near, to.near, amount);
      return {
        view,
        progress: amount,
        vehicleYaw: MathUtils.lerp(from.vehicleYaw, to.vehicleYaw, amount),
      };
    },
    update(delta, immediate = false) {
      const alpha = immediate ? 1 : 1 - Math.exp(-DAMPING * Math.max(0, delta));
      camera.position.lerp(targetPosition, alpha);
      lookTarget.lerp(targetLook, alpha);
      camera.fov = MathUtils.lerp(camera.fov, targetFov, alpha);
      camera.near = MathUtils.lerp(camera.near, targetNear, alpha);
      camera.lookAt(lookTarget);
      camera.updateProjectionMatrix();
    },
    getDiagnostics() {
      return {
        view: currentView,
        position: tuple(camera.position),
        target: tuple(lookTarget),
        fov: camera.fov,
        near: camera.near,
      };
    },
  };
}
