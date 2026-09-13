import { Group, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMainStateTransition, createMainRenderOrchestration } from '../src/main-render-orchestration';
import { createCabinLighting } from '../src/scene/cabin-lighting';
import { createCameraController } from '../src/scene/camera-controller';
import type { LoadedVehicle } from '../src/scene/load-vehicle';
import { createVehicleController } from '../src/scene/vehicle-controller';
import type { VehicleState } from '../src/state/vehicle-state';

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
    dispose() {},
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('main state orchestration', () => {
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
