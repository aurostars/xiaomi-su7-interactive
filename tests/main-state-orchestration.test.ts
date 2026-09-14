import { Group, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMainStateTransition, createMainRenderOrchestration } from '../src/main-render-orchestration';
import { createCabinLighting } from '../src/scene/cabin-lighting';
import { createCameraController } from '../src/scene/camera-controller';
import type { LoadedVehicle } from '../src/scene/load-vehicle';
import { createVehicleController } from '../src/scene/vehicle-controller';
import type { VehicleState } from '../src/state/vehicle-state';
import { createVehicleStore } from '../src/state/vehicle-state';
import { renderShell } from '../src/ui/render-shell';

const state = (overrides: Partial<VehicleState> = {}): VehicleState => ({
  mode: 'cabin',
  paint: 'lava-orange',
  interior: 'obsidian-black',
  doorsOpen: true,
  seatView: 'driver',
  activeStoryId: 'aero',
  autoCameraSuspendedUntil: 0,
  ...overrides,
});

function makeVehicle(): LoadedVehicle {
  const root = new Group();
  const doors = {
    frontLeft: new Group(),
    frontRight: new Group(),
    rearLeft: new Group(),
    rearRight: new Group(),
  };
  root.add(...Object.values(doors));
  return {
    root,
    bodyMaterials: [new MeshStandardMaterial()],
    interiorMaterials: [new MeshStandardMaterial()],
    screenMaterials: [new MeshStandardMaterial(), new MeshBasicMaterial()],
    doors,
    capabilities: {
      bodyColor: true,
      interiorColor: true,
      screenGlow: true,
      doors: { frontLeft: true, frontRight: true, rearLeft: true, rearRight: true },
    },
    setCabinPresentation() {},
    dispose() {},
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('main state orchestration', () => {
  it('keeps scroll-originated active story state driving the camera without hotspot controls', () => {
    renderShell(document.body);
    const store = createVehicleStore();
    const camera = createCameraController(new PerspectiveCamera(32, 1, 0.1, 100));
    const cameraRender = createMainRenderOrchestration({
      camera,
      runtime: { requestRender: vi.fn(), beginRenderActivity: vi.fn(), endRenderActivity: vi.fn() },
      reducedMotion: true,
      rotateVehicle: () => undefined,
      suspendAutoCamera: () => undefined,
      initialTime: 0,
    });

    let previousState = store.getState();
    const unsubscribe = store.subscribe(() => {
      const currentState = store.getState();
      applyMainStateTransition({
        previousState,
        state: currentState,
        runtime: { requestRender: vi.fn(), setCabinMode: vi.fn() },
        cameraRender,
        reducedMotion: true,
      });
      previousState = currentState;
    });
    const onScrollChapter = (storyId: 'cabin', progress: number) => {
      store.actions.setActiveStory(storyId);
      if (store.getState().mode === 'exterior') cameraRender.setStoryProgress(storyId, progress);
      cameraRender.beforeRender(16);
    };
    onScrollChapter('cabin', 0.5);

    expect(store.getState().activeStoryId).toBe('cabin');
    expect(camera.getDiagnostics().view).toBe('rear');
    unsubscribe();
    expect(document.querySelectorAll('.story-hotspot')).toHaveLength(0);
    document.body.replaceChildren();
  });

  it('lets a changed exterior story retake the camera after cabin was entered manually', () => {
    const store = createVehicleStore({ activeStoryId: 'performance' });
    const camera = createCameraController(new PerspectiveCamera(32, 1, 0.1, 100));
    const cameraRender = createMainRenderOrchestration({
      camera,
      runtime: { requestRender: vi.fn(), beginRenderActivity: vi.fn(), endRenderActivity: vi.fn() },
      reducedMotion: true,
      rotateVehicle: () => undefined,
      suspendAutoCamera: () => undefined,
      initialTime: 0,
    });
    let storyView: 'performance' | 'aero' = 'performance';
    let previousState = store.getState();
    const unsubscribe = store.subscribe(() => {
      const currentState = store.getState();
      const intent = applyMainStateTransition({
        previousState,
        state: currentState,
        runtime: { requestRender: vi.fn(), setCabinMode: vi.fn() },
        cameraRender,
        reducedMotion: true,
      });
      previousState = currentState;
      if (!intent.cameraView && intent.cabinMode === false) {
        cameraRender.setStoryProgress(storyView, 0);
      }
    });

    store.actions.setMode('cabin');
    storyView = 'aero';
    store.actions.setActiveStory('aero');
    cameraRender.beforeRender(16);

    expect(store.getState()).toMatchObject({ activeStoryId: 'aero', mode: 'exterior' });
    expect(camera.getDiagnostics().view).toBe('aero');
    unsubscribe();
  });

  it('routes a seat-only cabin delta to lighting and camera without restarting door motion', () => {
    vi.useFakeTimers();
    const scheduleDoorFrame = vi.spyOn(globalThis, 'setTimeout');
    const vehicleController = createVehicleController(makeVehicle());
    const driverState = state();
    vehicleController.applyState(driverState);
    vi.advanceTimersByTime(1_000);
    const doorAngles = vehicleController.getDiagnostics().doorAngles;
    const scheduledAfterDoorSettles = scheduleDoorFrame.mock.calls.length;

    const scene = new Scene();
    const renderer = { toneMappingExposure: 0.9 } as WebGLRenderer;
    const cabinLighting = createCabinLighting(scene, renderer, 'high', true);
    cabinLighting.apply({ enabled: true, seatView: 'driver' });
    const rearFill = scene.getObjectByName('cabin-rear-fill');
    const driverRearIntensity = rearFill && 'intensity' in rearFill ? rearFill.intensity as number : 0;

    const camera = createCameraController(new PerspectiveCamera(32, 1, 0.1, 100));
    const renderRuntime = {
      requestRender: vi.fn(),
      beginRenderActivity: vi.fn(),
      endRenderActivity: vi.fn(),
    };
    const cameraRender = createMainRenderOrchestration({
      camera,
      runtime: renderRuntime,
      reducedMotion: true,
      rotateVehicle: () => undefined,
      suspendAutoCamera: () => undefined,
      initialTime: 0,
    });
    const runtime = {
      requestRender: renderRuntime.requestRender,
      setCabinMode(enabled: boolean, seatView: VehicleState['seatView'], immediate?: boolean) {
        cabinLighting.apply({ enabled, seatView }, immediate);
      },
    };
    const rearState = state({ seatView: 'rear' });

    applyMainStateTransition({
      previousState: driverState,
      state: rearState,
      vehicleController,
      runtime,
      cameraRender,
      reducedMotion: true,
    });
    cameraRender.beforeRender(16);

    expect(vehicleController.getDiagnostics().doorAngles).toEqual(doorAngles);
    expect(scheduleDoorFrame).toHaveBeenCalledTimes(scheduledAfterDoorSettles);
    expect(rearFill && 'intensity' in rearFill ? rearFill.intensity : 0).toBeGreaterThan(driverRearIntensity);
    expect(camera.getDiagnostics().view).toBe('rear');
  });
});
