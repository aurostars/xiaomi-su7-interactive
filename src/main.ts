import { type StoryId } from './content/story-chapters';
import './styles.css';
import { createDragController } from './interaction/drag-controller';
import { createScrollStory } from './interaction/scroll-story';
import { applyMainStateTransition, createMainRenderOrchestration } from './main-render-orchestration';
import {
  createExperienceOrchestrator,
  createStageFeedback,
  detectCapabilities,
} from './performance/capabilities';
import {
  createCameraController,
  type CameraController,
  type CameraDiagnostics,
  type CameraView,
} from './scene/camera-controller';
import { createScene } from './scene/create-scene';
import { type RenderReason } from './scene/render-scheduler';
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
  renderActive: boolean;
  pendingRenderReasons: RenderReason[];
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
        renderActive: false,
        pendingRenderReasons: [],
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
        activeStoryId: store.getState().activeStoryId,
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
    const readRendering = () => ({
      renderActive: runtime.isRenderActive(),
      pendingRenderReasons: [...runtime.getActiveRenderReasons()],
      renderRevision,
      renderedView,
      renderedCamera,
    });
    const runtime = createScene(
      elements.canvas,
      capabilities.quality === 'high' ? 'high' : 'low',
      () => {
        const cameraDiagnostics = camera?.getDiagnostics();
        renderRevision += 1;
        renderedView = cameraDiagnostics?.view ?? null;
        renderedCamera = cameraDiagnostics ?? null;
      },
      capabilities.reducedMotion,
    );
    camera = createCameraController(runtime.camera);
    const readCabinLighting = () => runtime.getCabinLightingDiagnostics();
    diagnosticCamera = camera;
    diagnosticCabinLighting = readCabinLighting;
    diagnosticRendering = readRendering;
    let vehicleController: VehicleController | undefined;
    let vehicleYaw = 0;
    let storyFrame: { view: CameraView; progress: number } = { view: 'aero', progress: 0 };
    let stopped = false;
    const cameraRender = createMainRenderOrchestration({
      camera,
      runtime,
      reducedMotion: capabilities.reducedMotion,
      rotateVehicle(deltaYaw) {
        vehicleYaw += deltaYaw;
        vehicleController?.setRotation(vehicleYaw);
      },
      suspendAutoCamera: store.actions.suspendAutoCamera,
    });
    const clearBeforeRender = runtime.setBeforeRender(cameraRender.beforeRender);

    const story = createScrollStory(
      elements.storySections.map((element) => ({
        element,
        view: element.dataset.storyView as StoryId,
      })),
      (storyId, progress) => {
        const view: CameraView = storyId === 'intelligence' ? 'sensing' : storyId;
        storyFrame = { view, progress };
        diagnosticStory = { view, progress, scrollY: window.scrollY, updatedAt: performance.now() };
        store.actions.setActiveStory(storyId);
        if (store.getState().mode !== 'exterior') return;
        const frame = cameraRender.setStoryProgress(view, progress);
        vehicleYaw = frame.vehicleYaw;
        vehicleController?.setRotation(vehicleYaw);
      },
      () => store.getState().autoCameraSuspendedUntil,
    );
    const drag = createDragController(elements.canvas, cameraRender.dragCallbacks);
    let previousExperienceState = store.getState();
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      const intent = applyMainStateTransition({
        previousState: previousExperienceState,
        state,
        vehicleController,
        runtime,
        cameraRender,
        reducedMotion: capabilities.reducedMotion,
      });
      previousExperienceState = state;
      if (!intent.cameraView && intent.cabinMode === false) {
        const frame = cameraRender.setStoryProgress(storyFrame.view, storyFrame.progress);
        vehicleYaw = frame.vehicleYaw;
        vehicleController?.setRotation(vehicleYaw);
      }
    });

    runtime.start();
    const unbindVisibility = cameraRender.bindVisibility(document);

    return {
      load: (onProgress: (progress: number) => void) => loadVehicle(vehicleModelUrl, onProgress),
      activate(vehicle: LoadedVehicle) {
        runtime.scene.add(vehicle.root);
        vehicleController = createVehicleController(
          vehicle,
          capabilities.reducedMotion,
          runtime.requestRender,
        );
        diagnosticVehicle = vehicleController;
        applyVehicleCapabilities(elements, vehicle.capabilities);
        const state = store.getState();
        vehicleController.applyState(state);
        runtime.setCabinMode(state.mode === 'cabin', state.seatView, true);
        if (state.mode === 'cabin') cameraRender.setTarget(state.seatView);
        else {
          const currentStoryFrame = cameraRender.setStoryProgress(storyFrame.view, storyFrame.progress);
          vehicleYaw = currentStoryFrame.vehicleYaw;
        }
        cameraRender.forceImmediateUpdate();
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
        unbindVisibility();
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
