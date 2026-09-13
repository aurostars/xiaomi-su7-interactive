import { getCabinExperienceIntent, type CabinExperienceIntent } from './performance/capabilities';
import type { SeatView, VehicleState } from './state/vehicle-state';
import {
  createCameraRenderOrchestration,
  type CameraController,
  type CameraView,
  type CameraRenderRuntime,
} from './scene/camera-controller';

export interface MainRenderOrchestrationOptions {
  camera: CameraController;
  runtime: CameraRenderRuntime;
  reducedMotion: boolean;
  rotateVehicle(deltaYaw: number): void;
  suspendAutoCamera(durationMs: number): void;
  initialTime?: number;
}

export interface MainStateTransitionOptions {
  previousState: VehicleState;
  state: VehicleState;
  vehicleController?: { applyState(state: VehicleState): void };
  runtime: {
    requestRender(): void;
    setCabinMode(enabled: boolean, seatView: SeatView, immediate?: boolean): void;
  };
  cameraRender: { setTarget(view: CameraView): void };
  reducedMotion: boolean;
}

export function applyMainStateTransition(options: MainStateTransitionOptions): CabinExperienceIntent {
  const { previousState, state, vehicleController, runtime, cameraRender, reducedMotion } = options;
  vehicleController?.applyState(state);
  runtime.requestRender();
  const intent = getCabinExperienceIntent(previousState, state);
  if (intent.cabinMode !== undefined || intent.cameraView) {
    runtime.setCabinMode(state.mode === 'cabin', state.seatView, reducedMotion);
  }
  if (intent.cameraView) cameraRender.setTarget(intent.cameraView);
  return intent;
}

export function createMainRenderOrchestration(options: MainRenderOrchestrationOptions) {
  const cameraRender = createCameraRenderOrchestration(
    options.camera,
    options.runtime,
    options.reducedMotion,
    options.initialTime,
  );

  return {
    beforeRender: cameraRender.beforeRender,
    setTarget: cameraRender.setTarget,
    setStoryProgress: cameraRender.setStoryProgress,
    forceImmediateUpdate: cameraRender.forceImmediateUpdate,
    dragCallbacks: {
      rotateBy(deltaYaw: number) {
        options.rotateVehicle(deltaYaw);
        cameraRender.requestFrame();
      },
      suspendAutoCamera: options.suspendAutoCamera,
    },
    bindVisibility(target: Document) {
      const onVisibilityChange = () => {
        if (!target.hidden) cameraRender.requestFrame();
      };
      target.addEventListener('visibilitychange', onVisibilityChange);
      return () => target.removeEventListener('visibilitychange', onVisibilityChange);
    },
  } satisfies {
    beforeRender(now: number): void;
    setTarget(view: CameraView): void;
    setStoryProgress(view: CameraView, progress: number): ReturnType<CameraController['setStoryProgress']>;
    forceImmediateUpdate(): void;
    dragCallbacks: {
      rotateBy(deltaYaw: number): void;
      suspendAutoCamera(durationMs: number): void;
    };
    bindVisibility(target: Document): () => void;
  };
}
