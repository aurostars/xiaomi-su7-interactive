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
  isSettled(): boolean;
  getDiagnostics(): CameraDiagnostics;
}

export const CAMERA_PRESETS: Record<CameraView, CameraPreset> = {
  aero: { position: [6, 2.4, 6.9], target: [0, 0.7, 0], fov: 32, near: 0.1, vehicleYaw: -0.18 },
  performance: { position: [5.2, 1.2, 5.8], target: [0.2, 0.55, 0], fov: 28, near: 0.1, vehicleYaw: 0.3 },
  cabin: { position: [2.4, 1.55, 2.3], target: [0, 1.05, -0.15], fov: 38, near: 0.1, vehicleYaw: -0.08 },
  sensing: { position: [-5.5, 2.2, 6.2], target: [0, 0.8, 0.2], fov: 34, near: 0.1, vehicleYaw: 0.48 },
  driver: { position: [-0.38, 1.26, 0.08], target: [-0.28, 1.06, -2.4], fov: 58, near: 0.025, vehicleYaw: 0 },
  passenger: { position: [0.38, 1.26, 0.08], target: [-0.25, 1.05, -2.35], fov: 58, near: 0.025, vehicleYaw: 0 },
  rear: { position: [0, 1.3, 1.28], target: [0, 1.05, -1.6], fov: 58, near: 0.025, vehicleYaw: 0 },
};

export interface WorldBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface NdcBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
}

/** Box3.setFromObject() bounds measured from the shipped SU7 GLB at its loader world transform. */
export const SU7_WORLD_BOUNDS: WorldBounds = {
  min: [-1.1002051298, -0.0297371928, -2.6309396052],
  max: [1.1002051298, 1.4350140945, 2.6062138636],
};
const VEHICLE_Y_AXIS = new Vector3(0, 1, 0);

export function projectWorldBoundsToNdc(
  preset: CameraPreset,
  aspect: number,
  bounds: WorldBounds,
): NdcBounds {
  const camera = new PerspectiveCamera(preset.fov, aspect, preset.near, 100);
  camera.position.fromArray(preset.position);
  camera.lookAt(...preset.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const projectedCorners: Vector3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        projectedCorners.push(new Vector3(x, y, z).applyAxisAngle(VEHICLE_Y_AXIS, preset.vehicleYaw).project(camera));
      }
    }
  }
  const xCoordinates = projectedCorners.map(({ x }) => x);
  const yCoordinates = projectedCorners.map(({ y }) => y);
  const minX = Math.min(...xCoordinates);
  const maxX = Math.max(...xCoordinates);
  const minY = Math.min(...yCoordinates);
  const maxY = Math.max(...yCoordinates);
  const width = maxX - minX;
  const height = maxY - minY;

  return { minX, maxX, minY, maxY, width, height, area: width * height };
}

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
  const isSettled = () => camera.position.distanceToSquared(targetPosition) < 1e-8
    && lookTarget.distanceToSquared(targetLook) < 1e-8
    && Math.abs(camera.fov - targetFov) < 1e-4
    && Math.abs(camera.near - targetNear) < 1e-6;

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
    isSettled,
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

export interface CameraRenderRuntime {
  beginRenderActivity(reason: 'camera'): void;
  endRenderActivity(reason: 'camera'): void;
  requestRender(): void;
}

export function createCameraRenderOrchestration(
  camera: CameraController,
  runtime: CameraRenderRuntime,
  reducedMotion: boolean,
  initialTime = performance.now(),
) {
  let previousRenderAt = initialTime;
  let forceImmediate = false;

  const beginTransition = () => runtime.beginRenderActivity('camera');

  return {
    setTarget(view: CameraView) {
      beginTransition();
      camera.setTarget(view);
    },
    setStoryProgress(view: CameraView, progress: number) {
      beginTransition();
      const frame = camera.setStoryProgress(view, progress);
      runtime.requestRender();
      return frame;
    },
    forceImmediateUpdate() {
      forceImmediate = true;
    },
    beforeRender(now: number) {
      const delta = Math.min(.05, Math.max(0, (now - previousRenderAt) / 1000));
      previousRenderAt = now;
      camera.update(delta, forceImmediate || reducedMotion);
      forceImmediate = false;
      if (camera.isSettled()) runtime.endRenderActivity('camera');
    },
    requestFrame: runtime.requestRender,
  };
}
