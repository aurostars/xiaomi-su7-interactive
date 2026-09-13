import { DirectionalLight, PointLight, Scene, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCabinLighting } from '../src/scene/cabin-lighting';

function rendererWithExposure(exposure = 0.9): WebGLRenderer {
  return { toneMappingExposure: exposure } as WebGLRenderer;
}

function rigLights(scene: Scene): PointLight[] {
  const rig = scene.getObjectByName('cabin-light-rig');
  return rig?.children.filter((child): child is PointLight => child instanceof PointLight) ?? [];
}

function installAnimationFrames() {
  let nextHandle = 1;
  let currentTime = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    const handle = nextHandle++;
    pending.set(handle, callback);
    return handle;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((handle) => {
    cancelled.push(handle);
    pending.delete(handle);
  });
  return {
    cancelled,
    pendingCount: () => pending.size,
    flush(time: number) {
      currentTime = time;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('cabin lighting', () => {
  it('keeps cabin lights isolated from exterior appearance lights', () => {
    const scene = new Scene();
    const exterior = new DirectionalLight(0xffffff, 1.08);
    exterior.name = 'main-rim-light';
    scene.add(exterior);
    const renderer = rendererWithExposure();
    const controller = createCabinLighting(scene, renderer, 'high');

    controller.setEnabled(true, true);

    const lights = rigLights(scene);
    expect(lights.map((light) => light.name)).toEqual([
      'cabin-roof-light',
      'cabin-screen-light',
      'cabin-broad-fill',
      'cabin-rear-fill',
      'cabin-footwell-left-light',
      'cabin-footwell-right-light',
    ]);
    expect(lights.every((light) => light.intensity > 0)).toBe(true);
    const [roof, screen] = lights;
    expect(roof.position.toArray()).toEqual([0, 1.62, 0.2]);
    expect(screen.position.toArray()).toEqual([0, 1.12, -0.72]);
    expect(screen.color.b).toBeGreaterThan(screen.color.r);
    expect(screen.color.b).toBeGreaterThan(screen.color.g);
    expect(roof.intensity).toBeLessThan(3);
    expect(lights.reduce((total, light) => total + light.intensity, 0)).toBeLessThan(3);
    expect(scene.getObjectByName('cabin-ambient-fill')?.type).toBe('AmbientLight');
    expect(exterior.intensity).toBe(1.08);
    expect(renderer.toneMappingExposure).toBeLessThan(0.9);
    expect(controller.getDiagnostics()).toEqual({
      enabled: true,
      exposure: renderer.toneMappingExposure,
      activeLights: 7,
    });
  });

  it('reweights one cool cabin rig for each seat without reallocating lights', () => {
    const scene = new Scene();
    const renderer = rendererWithExposure();
    const controller = createCabinLighting(scene, renderer, 'high', true);
    const rig = scene.getObjectByName('cabin-light-rig');
    const initialChildren = [...(rig?.children ?? [])];

    controller.apply({ enabled: true, seatView: 'driver' });
    const roof = scene.getObjectByName('cabin-roof-light') as PointLight;
    const screen = scene.getObjectByName('cabin-screen-light') as PointLight;
    const broadFill = scene.getObjectByName('cabin-broad-fill') as PointLight;
    const rearFill = scene.getObjectByName('cabin-rear-fill') as PointLight;
    const driverRearIntensity = rearFill.intensity;
    expect(roof.intensity).toBeGreaterThan(0);
    expect(screen.intensity).toBeGreaterThan(0);
    expect(broadFill.color.b).toBeGreaterThan(broadFill.color.r);
    expect(renderer.toneMappingExposure).toBeLessThanOrEqual(1);

    controller.apply({ enabled: true, seatView: 'passenger' });
    expect(roof.intensity).toBeGreaterThan(0);
    expect(screen.intensity).toBeGreaterThan(0);
    controller.apply({ enabled: true, seatView: 'rear' });
    expect(rearFill.intensity).toBeGreaterThan(driverRearIntensity);
    expect(rig?.children).toEqual(initialChildren);

    controller.apply({ enabled: false, seatView: 'rear' });
    expect(rig?.children.every((child) => (child as PointLight).intensity === 0)).toBe(true);
  });

  it('omits footwell lights at low quality', () => {
    const scene = new Scene();
    const controller = createCabinLighting(scene, rendererWithExposure(), 'low');

    controller.setEnabled(true, true);

    expect(rigLights(scene).map((light) => light.name)).toEqual([
      'cabin-roof-light',
      'cabin-screen-light',
      'cabin-broad-fill',
      'cabin-rear-fill',
    ]);
    expect(controller.getDiagnostics().activeLights).toBe(5);
  });

  it('restores the captured exterior exposure when disabled', () => {
    const renderer = rendererWithExposure(0.9);
    const controller = createCabinLighting(new Scene(), renderer, 'medium');

    controller.setEnabled(true, true);
    controller.setEnabled(false, true);

    expect(renderer.toneMappingExposure).toBe(0.9);
    expect(controller.getDiagnostics()).toEqual({ enabled: false, exposure: 0.9, activeLights: 0 });
  });

  it('invalidates every animated change including the terminal frame and stops afterward', () => {
    const frames = installAnimationFrames();
    const invalidate = vi.fn();
    const renderer = rendererWithExposure();
    const controller = createCabinLighting(new Scene(), renderer, 'high', false, invalidate);

    controller.setEnabled(true);
    expect(frames.pendingCount()).toBe(1);
    frames.flush(80);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(renderer.toneMappingExposure).toBeGreaterThan(0.88);
    frames.flush(160);
    expect(invalidate).toHaveBeenCalledTimes(2);
    frames.flush(240);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(renderer.toneMappingExposure).toBe(0.88);
    expect(frames.pendingCount()).toBe(0);

    frames.flush(320);
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it('cancels an old transition and keeps invalidating the reversed transition through completion', () => {
    const frames = installAnimationFrames();
    const invalidate = vi.fn();
    const renderer = rendererWithExposure();
    const controller = createCabinLighting(new Scene(), renderer, 'high', false, invalidate);

    controller.setEnabled(true);
    frames.flush(80);
    const exposureDuringOpening = renderer.toneMappingExposure;
    controller.setEnabled(false);
    expect(frames.cancelled).toHaveLength(1);

    frames.flush(160);
    frames.flush(240);
    frames.flush(320);
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(exposureDuringOpening).toBeLessThan(0.9);
    expect(renderer.toneMappingExposure).toBe(0.9);
    expect(frames.pendingCount()).toBe(0);

    frames.flush(400);
    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  it('applies reduced-motion terminal changes once without scheduling animation work', () => {
    const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
    const invalidate = vi.fn();
    const controller = createCabinLighting(new Scene(), rendererWithExposure(), 'high', true, invalidate);

    controller.setEnabled(true);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('applies immediate changes without scheduling animation work', () => {
    const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame');
    const controller = createCabinLighting(new Scene(), rendererWithExposure(), 'high');

    controller.setEnabled(true, true);
    controller.setEnabled(false, true);

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('cancels RAF handle zero before an immediate state change', () => {
    let pending: FrameRequestCallback | undefined;
    let cancelled = false;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      pending = callback;
      return 0;
    });
    const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((handle) => {
      if (handle === 0) cancelled = true;
    });
    const scene = new Scene();
    const renderer = rendererWithExposure();
    const controller = createCabinLighting(scene, renderer, 'high');

    controller.setEnabled(true);
    controller.setEnabled(false, true);
    if (!cancelled) pending?.(performance.now() + 240);

    expect(cancelFrame).toHaveBeenCalledWith(0);
    expect(renderer.toneMappingExposure).toBe(0.9);
    expect(rigLights(scene).every((light) => light.intensity === 0)).toBe(true);
  });

  it('cancels animation and removes only its rig on dispose', () => {
    const scene = new Scene();
    const exterior = new DirectionalLight();
    scene.add(exterior);
    const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const controller = createCabinLighting(scene, rendererWithExposure(), 'medium');

    controller.setEnabled(true);
    controller.dispose();
    controller.dispose();

    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(scene.getObjectByName('cabin-light-rig')).toBeUndefined();
    expect(exterior.parent).toBe(scene);
  });
});
