import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createCameraController } from '../src/scene/camera-controller';
import { createMainRenderOrchestration } from '../src/main-render-orchestration';

afterEach(() => vi.restoreAllMocks());

describe('main render orchestration', () => {
  function createHarness(reducedMotion = false) {
    const camera = createCameraController(new PerspectiveCamera(32, 1, 0.1, 100));
    const requestRender = vi.fn();
    const runtime = {
      requestRender,
      beginRenderActivity: vi.fn(() => requestRender()),
      endRenderActivity: vi.fn(),
    };
    const rotateVehicle = vi.fn();
    const suspendAutoCamera = vi.fn();
    const orchestration = createMainRenderOrchestration({
      camera,
      runtime,
      reducedMotion,
      rotateVehicle,
      suspendAutoCamera,
      initialTime: 0,
    });
    return { camera, orchestration, requestRender, rotateVehicle, runtime, suspendAutoCamera };
  }

  it('requests a frame through the actual drag callback', () => {
    const { orchestration, requestRender, rotateVehicle, suspendAutoCamera } = createHarness();

    orchestration.dragCallbacks.rotateBy(0.25);
    orchestration.dragCallbacks.suspendAutoCamera(10_000);

    expect(rotateVehicle).toHaveBeenCalledWith(0.25);
    expect(suspendAutoCamera).toHaveBeenCalledWith(10_000);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('retains a reduced-motion target until its requested terminal frame', () => {
    const { camera, orchestration, requestRender, runtime } = createHarness(true);

    orchestration.setTarget('driver');

    expect(runtime.beginRenderActivity).toHaveBeenCalledWith('camera');
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(camera.isSettled()).toBe(false);

    orchestration.beforeRender(16);
    expect(camera.isSettled()).toBe(true);
    expect(runtime.endRenderActivity).toHaveBeenCalledWith('camera');
  });

  it('requests one frame on actual visibility restoration and removes the listener', () => {
    const { orchestration, requestRender } = createHarness();
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const unbind = orchestration.bindVisibility(document);

    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestRender).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestRender).toHaveBeenCalledTimes(1);

    unbind();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});
