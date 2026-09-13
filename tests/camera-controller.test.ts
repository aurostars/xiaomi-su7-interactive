import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import {
  CAMERA_PRESETS,
  SU7_WORLD_BOUNDS,
  type CameraPreset,
  createCameraController,
  createCameraRenderOrchestration,
  projectWorldBoundsToNdc,
} from '../src/scene/camera-controller';

describe('camera render orchestration', () => {
  function createHarness(reducedMotion = false) {
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.fromArray(CAMERA_PRESETS.aero.position);
    const controller = createCameraController(camera);
    const events: string[] = [];
    const runtime = {
      beginRenderActivity: vi.fn(() => events.push('begin')),
      endRenderActivity: vi.fn(() => events.push('end')),
      requestRender: vi.fn(() => events.push('request')),
    };
    const orchestration = createCameraRenderOrchestration(controller, runtime, reducedMotion, 0);
    return { camera, controller, events, orchestration, runtime };
  }

  it('begins camera activity before ordinary and story target changes', () => {
    const { controller, events, orchestration } = createHarness();
    vi.spyOn(controller, 'setTarget').mockImplementation(() => { events.push('target'); });
    vi.spyOn(controller, 'setStoryProgress').mockImplementation(() => {
      events.push('story');
      return { view: 'aero', progress: 0.5, vehicleYaw: 0 };
    });

    orchestration.setTarget('driver');
    orchestration.setStoryProgress('aero', 0.5);

    expect(events).toEqual(['begin', 'target', 'begin', 'story', 'request']);
  });

  it('updates continuously and ends activity only after the camera settles', () => {
    const { controller, orchestration, runtime } = createHarness();
    const update = vi.spyOn(controller, 'update');

    orchestration.setTarget('driver');
    for (let time = 16; time < 5_000 && runtime.endRenderActivity.mock.calls.length === 0; time += 16) {
      orchestration.beforeRender(time);
    }

    expect(update.mock.calls.length).toBeGreaterThan(1);
    expect(runtime.endRenderActivity).toHaveBeenCalledTimes(1);
    expect(runtime.endRenderActivity).toHaveBeenCalledWith('camera');
    expect(controller.isSettled()).toBe(true);
  });

  it('settles reduced motion in its requested terminal frame', () => {
    const { controller, orchestration, runtime } = createHarness(true);

    orchestration.setTarget('driver');
    expect(runtime.beginRenderActivity).toHaveBeenCalledWith('camera');
    orchestration.beforeRender(16);

    expect(controller.isSettled()).toBe(true);
    expect(runtime.endRenderActivity).toHaveBeenCalledWith('camera');
  });

});

describe('camera controller', () => {
  it('uses a low, 30-35 degree aero hero camera', () => {
    const aero = CAMERA_PRESETS.aero;

    expect(aero.position[1]).toBeLessThan(2.8);
    expect(aero.fov).toBeGreaterThanOrEqual(30);
    expect(aero.fov).toBeLessThanOrEqual(35);
  });

  it('keeps the complete aero vehicle prominent without cropping', () => {
    const legacyAero: CameraPreset = {
      position: [6.8, 2.8, 7.8],
      target: [0, 0.7, 0],
      fov: 32,
      near: 0.1,
      vehicleYaw: -0.18,
    };
    const legacyBounds = projectWorldBoundsToNdc(legacyAero, 1440 / 900, SU7_WORLD_BOUNDS);
    const currentBounds = projectWorldBoundsToNdc(CAMERA_PRESETS.aero, 1440 / 900, SU7_WORLD_BOUNDS);
    const linearScale = Math.sqrt(currentBounds.area / legacyBounds.area);

    expect(linearScale).toBeGreaterThanOrEqual(0.7);
    expect(linearScale).toBeLessThanOrEqual(0.8);
    expect(currentBounds.minX).toBeGreaterThanOrEqual(-1);
    expect(currentBounds.maxX).toBeLessThanOrEqual(1);
    expect(currentBounds.minY).toBeGreaterThanOrEqual(-1);
    expect(currentBounds.maxY).toBeLessThanOrEqual(1);
  });

  it('keeps the complete SU7 inside the real desktop canvas with wheel and roof margin', () => {
    for (const [width, height] of [[1280, 800], [1440, 900]] as const) {
      const canvasAspect = (width * 0.69) / height;
      const bounds = projectWorldBoundsToNdc(CAMERA_PRESETS.aero, canvasAspect, SU7_WORLD_BOUNDS);
      expect(bounds.minX).toBeGreaterThanOrEqual(-0.94);
      expect(bounds.maxX).toBeLessThanOrEqual(0.94);
      expect(bounds.minY).toBeGreaterThanOrEqual(-0.94);
      expect(bounds.maxY).toBeLessThanOrEqual(0.94);
    }
  });

  it('keeps driver, passenger, and rear viewpoints inside the cabin and spatially distinct', () => {
    const cabinViews = ['driver', 'passenger', 'rear'] as const;
    const positions = cabinViews.map((view) => CAMERA_PRESETS[view].position.join(','));
    const targets = cabinViews.map((view) => CAMERA_PRESETS[view].target.join(','));

    for (const view of cabinViews) {
      const [x, y, z] = CAMERA_PRESETS[view].position;
      expect(x).toBeGreaterThanOrEqual(-0.7);
      expect(x).toBeLessThanOrEqual(0.7);
      // The shipped GLB roof liner intersects upper view rays when the eye is above 1.15m.
      // Keep the eye below it and pitch down so near black roof/body geometry cannot dominate the frame.
      expect(y).toBeGreaterThanOrEqual(1.05);
      expect(y).toBeLessThanOrEqual(1.15);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(1.8);
      expect(CAMERA_PRESETS[view].near).toBeGreaterThanOrEqual(0.12);
      expect(CAMERA_PRESETS[view].near).toBeLessThanOrEqual(0.2);
      const [targetX, targetY, targetZ] = CAMERA_PRESETS[view].target;
      expect(y - targetY).toBeGreaterThanOrEqual(0.2);
      expect(Math.hypot(targetX - x, targetY - y, targetZ - z)).toBeGreaterThanOrEqual(2.4);
      expect(CAMERA_PRESETS[view].fov).toBeGreaterThanOrEqual(50);
      expect(CAMERA_PRESETS[view].fov).toBeLessThanOrEqual(58);
    }
    expect(CAMERA_PRESETS.driver.position[0]).toBeLessThan(0);
    expect(CAMERA_PRESETS.passenger.position[0]).toBeGreaterThan(0);
    expect(CAMERA_PRESETS.driver.position[2]).toBeLessThanOrEqual(0.15);
    expect(CAMERA_PRESETS.passenger.position[2]).toBeLessThanOrEqual(0.15);
    expect(new Set(positions).size).toBe(3);
    expect(new Set(targets).size).toBe(3);
  });

  it('retains the exterior near plane for story presets', () => {
    for (const view of ['aero', 'performance', 'cabin', 'sensing'] as const) {
      expect(CAMERA_PRESETS[view].near).toBe(0.1);
    }
  });

  it('applies the cabin near plane and updates the projection matrix', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    const projectionBefore = camera.projectionMatrix.clone();
    const controller = createCameraController(camera);

    controller.setTarget('driver');
    controller.update(0, true);

    expect(camera.near).toBe(0.15);
    expect(camera.projectionMatrix.equals(projectionBefore)).toBe(false);
    expect(controller.getDiagnostics().near).toBe(camera.near);
  });

  it('reports unsettled target transitions and settles after the terminal update', () => {
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.fromArray(CAMERA_PRESETS.aero.position);
    const controller = createCameraController(camera);

    expect(controller.isSettled()).toBe(true);
    controller.setTarget('driver');
    expect(controller.isSettled()).toBe(false);

    controller.update(0, true);
    expect(controller.isSettled()).toBe(true);
  });

  it('moves toward a preset without jumping directly to it', () => {
    const camera = new PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 0);
    const controller = createCameraController(camera);

    controller.setTarget('driver');
    controller.update(1 / 60);

    expect(camera.position.toArray()).not.toEqual(CAMERA_PRESETS.driver.position);
    expect(camera.position.distanceTo({
      x: CAMERA_PRESETS.driver.position[0],
      y: CAMERA_PRESETS.driver.position[1],
      z: CAMERA_PRESETS.driver.position[2],
    })).toBeLessThan(Math.hypot(...CAMERA_PRESETS.driver.position));
    expect(camera.fov).toBeGreaterThan(38);
    expect(camera.fov).toBeLessThan(CAMERA_PRESETS.driver.fov);
  });

  it('interpolates actual position, look target, FOV and vehicle yaw from continuous story progress', () => {
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.fromArray(CAMERA_PRESETS.aero.position);
    const controller = createCameraController(camera);

    const frame = controller.setStoryProgress('aero', 0.5);
    controller.update(0, true);
    const diagnostics = controller.getDiagnostics();

    expect(frame.vehicleYaw).toBeCloseTo((CAMERA_PRESETS.aero.vehicleYaw + CAMERA_PRESETS.performance.vehicleYaw) / 2);
    expect(diagnostics.position[0]).toBeCloseTo(6.85);
    expect(diagnostics.position[1]).toBeCloseTo(1.975);
    expect(diagnostics.position[2]).toBeCloseTo(7.7);
    expect(diagnostics.target).toEqual([0.775, 0.675, 0]);
    expect(diagnostics.fov).toBe(31);
  });

  it('reports the actual interpolated camera rather than the target preset', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 0);
    const controller = createCameraController(camera);

    controller.setTarget('driver');
    controller.update(1 / 60);

    const diagnostics = controller.getDiagnostics();
    expect(diagnostics.position).toEqual(camera.position.toArray());
    expect(diagnostics.position).not.toEqual(CAMERA_PRESETS.driver.position);
    expect(diagnostics.fov).toBe(camera.fov);
    expect(diagnostics.target).not.toEqual(CAMERA_PRESETS.driver.target);
  });

  it('uses frame-rate independent damping', () => {
    const camera30 = new PerspectiveCamera(50, 1, 0.1, 100);
    const camera120 = new PerspectiveCamera(50, 1, 0.1, 100);
    const controller30 = createCameraController(camera30);
    const controller120 = createCameraController(camera120);
    controller30.setTarget('passenger');
    controller120.setTarget('passenger');

    for (let frame = 0; frame < 30; frame += 1) controller30.update(1 / 30);
    for (let frame = 0; frame < 120; frame += 1) controller120.update(1 / 120);

    expect(camera30.position.distanceTo(camera120.position)).toBeLessThan(0.000_001);
    expect(camera30.fov).toBeCloseTo(camera120.fov, 6);
  });
});
