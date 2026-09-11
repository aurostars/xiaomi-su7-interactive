import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import {
  CAMERA_PRESETS,
  createCameraController,
} from '../src/scene/camera-controller';

describe('camera controller', () => {
  it('keeps driver, passenger, and rear viewpoints spatially distinct', () => {
    const cabinViews = ['driver', 'passenger', 'rear'] as const;
    const positions = cabinViews.map((view) => CAMERA_PRESETS[view].position.join(','));
    const targets = cabinViews.map((view) => CAMERA_PRESETS[view].target.join(','));

    expect(new Set(positions).size).toBe(3);
    expect(new Set(targets).size).toBe(3);
  });

  it('moves toward a preset without jumping directly to it', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
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
    expect(camera.fov).toBeGreaterThan(CAMERA_PRESETS.driver.fov);
  });

  it('interpolates actual position, look target, FOV and vehicle yaw from continuous story progress', () => {
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.fromArray(CAMERA_PRESETS.aero.position);
    const controller = createCameraController(camera);

    const frame = controller.setStoryProgress('aero', 0.5);
    controller.update(0, true);
    const diagnostics = controller.getDiagnostics();

    expect(frame.vehicleYaw).toBeCloseTo((CAMERA_PRESETS.aero.vehicleYaw + CAMERA_PRESETS.performance.vehicleYaw) / 2);
    expect(diagnostics.position).toEqual([6, 2, 6.8]);
    expect(diagnostics.target).toEqual([0.1, 0.625, 0]);
    expect(diagnostics.fov).toBe(30);
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
