import './styles.css';
import { createDragController } from './interaction/drag-controller';
import { createScrollStory } from './interaction/scroll-story';
import {
  createExperienceOrchestrator,
  createStageFeedback,
  detectCapabilities,
  getCabinExperienceIntent,
} from './performance/capabilities';
import {
  createCameraController,
  type CameraController,
  type CameraDiagnostics,
  type CameraView,
} from './scene/camera-controller';
import { createScene, renderFrameInterval } from './scene/create-scene';
import {
  loadVehicle,
  type LoadedVehicle,
  vehicleFallbackUrl,
  vehicleModelUrl,
} from './scene/load-vehicle';
import { createVehicleController, type VehicleController } from './scene/vehicle-controller';
import { createVehicleStore } from './state/vehicle-state';
import { bindControls, applyVehicleCapabilities } from './ui/bind-controls';
import { renderShell } from './ui/render-shell';
export { vehicleFallbackUrl, vehicleModelUrl } from './scene/load-vehicle';

export function assetUrl(relativePath: string): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  return new URL(relativePath, baseUrl).pathname;
}

const app = document.querySelector<HTMLElement>('#app') ?? document.createElement('main');
app.id = 'app';
if (!app.isConnected) document.body.prepend(app);

const elements = renderShell(app);
const store = createVehicleStore();
const unbindControls = bindControls(elements, store);
applyVehicleCapabilities(elements, {
  bodyColor: false,
  interiorColor: false,
  screenGlow: false,
  doors: {
    frontLeft: false,
    frontRight: false,
    rearLeft: false,
    rearRight: false,
  },
});
const disposers: Array<() => void> = [unbindControls];
let diagnosticCamera: CameraController | undefined;
let diagnosticVehicle: VehicleController | undefined;
let diagnosticCabinLighting: (() => {
  enabled: boolean;
  exposure: number;
  activeLights: number;
}) | undefined;
let diagnosticStory: { view: CameraView; progress: number; scrollY: number; updatedAt: number } | undefined;
let diagnosticRendering: (() => {
  renderRevision: number;
  renderedView: CameraView | null;
  renderedCamera: CameraDiagnostics | null;
}) | undefined;

if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') {
  document.documentElement.classList.add('no-transitions');
  Object.defineProperty(window, '__SU7_E2E_READ_DIAGNOSTICS__', {
    value: () => {
      const vehicle = diagnosticVehicle?.getDiagnostics();
      const rendering = diagnosticRendering?.() ?? {
        renderRevision: 0,
        renderedView: null,
        renderedCamera: null,
      };
      return {
        modelReady: Boolean(vehicle),
        mode: store.getState().mode,
        paint: vehicle?.paint ?? null,
        doorAngles: vehicle?.doorAngles ?? {
          frontLeft: null,
          frontRight: null,
          rearLeft: null,
          rearRight: null,
        },
        camera: diagnosticCamera?.getDiagnostics() ?? null,
        cabinLighting: diagnosticCabinLighting?.() ?? null,
        vehicleYaw: vehicle?.yaw ?? null,
        materials: vehicle?.materials ?? { body: 0, interior: 0, screens: 0 },
        hotspot: store.getState().hotspot,
        autoCameraSuspendedUntil: store.getState().autoCameraSuspendedUntil,
        story: diagnosticStory ?? null,
        ...rendering,
      };
    },
  });
}

const capabilities = detectCapabilities();
const visual = elements.canvas.parentElement ?? app;
document.documentElement.dataset.quality = capabilities.quality;
document.documentElement.classList.toggle('reduced-motion', capabilities.reducedMotion);

let orchestrator: ReturnType<typeof createExperienceOrchestrator<LoadedVehicle>>;
const feedback = createStageFeedback(visual, elements.canvas, vehicleFallbackUrl, () => {
  orchestrator.retry();
});

orchestrator = createExperienceOrchestrator({
  canvas: elements.canvas,
  webgl: capabilities.webgl,
  feedback,
  createAttempt() {
    let camera!: CameraController;
    let renderRevision = 0;
    let renderedView: CameraView | null = null;
    let renderedCamera: CameraDiagnostics | null = null;
    const readRendering = () => ({ renderRevision, renderedView, renderedCamera });
    const runtime = createScene(
      elements.canvas,
      capabilities.quality === 'high' ? 'high' : 'low',
      renderFrameInterval(import.meta.env.VITE_E2E_DIAGNOSTICS === '1'),
      () => {
        const cameraDiagnostics = camera?.getDiagnostics();
        renderRevision += 1;
        renderedView = cameraDiagnostics?.view ?? null;
        renderedCamera = cameraDiagnostics ?? null;
      },
    );
    camera = createCameraController(runtime.camera);
    let previousRenderAt = performance.now();
    let forceImmediateCameraUpdate = false;
    const clearBeforeRender = runtime.setBeforeRender((now) => {
      const delta = Math.min(.05, Math.max(0, (now - previousRenderAt) / 1000));
      previousRenderAt = now;
      camera.update(delta, forceImmediateCameraUpdate || capabilities.reducedMotion);
      forceImmediateCameraUpdate = false;
    });
    const readCabinLighting = () => runtime.getCabinLightingDiagnostics();
    diagnosticCamera = camera;
    diagnosticCabinLighting = readCabinLighting;
    diagnosticRendering = readRendering;
    let vehicleController: VehicleController | undefined;
    let vehicleYaw = 0;
    let storyFrame: { view: CameraView; progress: number } = { view: 'aero', progress: 0 };
    let stopped = false;

    const story = createScrollStory(
      elements.storySections.map((element) => ({
        element,
        view: element.dataset.storyView as CameraView,
      })),
      (view, progress) => {
        storyFrame = { view, progress };
        diagnosticStory = { view, progress, scrollY: window.scrollY, updatedAt: performance.now() };
        store.actions.setHotspot(view);
        if (store.getState().mode !== 'exterior') return;
        const frame = camera.setStoryProgress(view, progress);
        vehicleYaw = frame.vehicleYaw;
        vehicleController?.setRotation(vehicleYaw);
      },
      () => store.getState().autoCameraSuspendedUntil,
    );
    const drag = createDragController(elements.canvas, {
      rotateBy(deltaYaw) {
        vehicleYaw += deltaYaw;
        vehicleController?.setRotation(vehicleYaw);
      },
      suspendAutoCamera: store.actions.suspendAutoCamera,
    });
    let previousExperienceState = store.getState();
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      vehicleController?.applyState(state);
      const intent = getCabinExperienceIntent(previousExperienceState, state);
      previousExperienceState = state;
      if (intent.cabinMode !== undefined) {
        runtime.setCabinMode(intent.cabinMode, capabilities.reducedMotion);
      }
      if (intent.cameraView) camera.setTarget(intent.cameraView);
      else if (intent.cabinMode === false) {
        const frame = camera.setStoryProgress(storyFrame.view, storyFrame.progress);
        vehicleYaw = frame.vehicleYaw;
        vehicleController?.setRotation(vehicleYaw);
      }
    });

    runtime.start();

    return {
      load: (onProgress: (progress: number) => void) => loadVehicle(vehicleModelUrl, onProgress),
      activate(vehicle: LoadedVehicle) {
        runtime.scene.add(vehicle.root);
        vehicleController = createVehicleController(vehicle, {
          reducedMotion: capabilities.reducedMotion,
        });
        diagnosticVehicle = vehicleController;
        applyVehicleCapabilities(elements, vehicle.capabilities);
        const state = store.getState();
        vehicleController.applyState(state);
        runtime.setCabinMode(state.mode === 'cabin', true);
        if (state.mode === 'cabin') camera.setTarget(state.seatView);
        else {
          const currentStoryFrame = camera.setStoryProgress(storyFrame.view, storyFrame.progress);
          vehicleYaw = currentStoryFrame.vehicleYaw;
        }
        forceImmediateCameraUpdate = true;
        vehicleController.setRotation(vehicleYaw);
        runtime.render();
      },
      discard(vehicle: LoadedVehicle) {
        vehicle.dispose();
      },
      dispose() {
        if (stopped) return;
        stopped = true;
        clearBeforeRender();
        unsubscribe();
        drag.dispose();
        story.dispose();
        vehicleController?.dispose();
        if (diagnosticVehicle === vehicleController) diagnosticVehicle = undefined;
        if (diagnosticCamera === camera) {
          diagnosticCamera = undefined;
          diagnosticStory = undefined;
        }
        if (diagnosticCabinLighting === readCabinLighting) diagnosticCabinLighting = undefined;
        if (diagnosticRendering === readRendering) diagnosticRendering = undefined;
        runtime.dispose();
      },
    };
  },
});
disposers.push(() => orchestrator.dispose());

const dispose = () => {
  while (disposers.length) disposers.pop()?.();
};
window.addEventListener('pagehide', dispose, { once: true });
