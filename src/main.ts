import './styles.css';
import { createDragController } from './interaction/drag-controller';
import { createScrollStory } from './interaction/scroll-story';
import {
  createExperienceOrchestrator,
  createStageFeedback,
  detectCapabilities,
} from './performance/capabilities';
import { createCameraController, type CameraView } from './scene/camera-controller';
import { createScene } from './scene/create-scene';
import {
  loadVehicle,
  type LoadedVehicle,
  vehicleFallbackUrl,
  vehicleModelUrl,
} from './scene/load-vehicle';
import { createVehicleController, type VehicleController } from './scene/vehicle-controller';
import { createVehicleStore } from './state/vehicle-state';
import { bindControls } from './ui/bind-controls';
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
const disposers: Array<() => void> = [unbindControls];
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
    const runtime = createScene(elements.canvas, capabilities.quality === 'high' ? 'high' : 'low');
    const camera = createCameraController(runtime.camera);
    let vehicleController: VehicleController | undefined;
    let vehicleYaw = 0;
    let stopped = false;

    const story = createScrollStory(
      elements.storySections.map((element) => ({
        element,
        view: element.dataset.storyView as CameraView,
      })),
      (view) => {
        camera.setTarget(view);
        store.actions.setHotspot(view);
      },
    );
    const drag = createDragController(elements.canvas, {
      rotateBy(deltaYaw) {
        vehicleYaw += deltaYaw;
        vehicleController?.setRotation(vehicleYaw);
      },
      suspendAutoCamera: store.actions.suspendAutoCamera,
    });
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      vehicleController?.applyState(state);
      if (state.mode === 'cabin') camera.setTarget(state.seatView);
      else if (state.hotspot === 'hero') camera.setTarget('aero');
    });

    runtime.start();
    let frame = 0;
    let previous = performance.now();
    const update = (now: number) => {
      if (stopped) return;
      const delta = Math.min(.05, (now - previous) / 1000);
      previous = now;
      if (!capabilities.reducedMotion) story.update(store.getState().autoCameraSuspendedUntil);
      camera.update(capabilities.reducedMotion ? 1 : delta);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);

    return {
      load: (onProgress: (progress: number) => void) => loadVehicle(vehicleModelUrl, onProgress),
      activate(vehicle: LoadedVehicle) {
        runtime.scene.add(vehicle.root);
        vehicleController = createVehicleController(vehicle);
        vehicleController.applyState(store.getState());
      },
      discard(vehicle: LoadedVehicle) {
        vehicle.dispose();
      },
      dispose() {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(frame);
        unsubscribe();
        drag.dispose();
        story.dispose();
        vehicleController?.dispose();
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
