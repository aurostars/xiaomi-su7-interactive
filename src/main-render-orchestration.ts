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
