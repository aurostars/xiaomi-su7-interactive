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
      'cabin-footwell-left-light',
      'cabin-footwell-right-light',
    ]);
    expect(lights.every((light) => light.intensity > 0)).toBe(true);
    expect(lights.slice(0, 2).map((light) => ({
      color: light.color.getHex(),
      intensity: light.intensity,
      distance: light.distance,
      position: light.position.toArray(),
    }))).toEqual([
      { color: 0xffe7cf, intensity: 1.15, distance: 3.2, position: [0, 1.62, 0.2] },
      { color: 0x72dfff, intensity: 0.68, distance: 2.1, position: [0, 1.12, -0.72] },
    ]);
    expect(exterior.intensity).toBe(1.08);
    expect(renderer.toneMappingExposure).toBeCloseTo(0.72);
    expect(controller.getDiagnostics()).toEqual({ enabled: true, exposure: 0.72, activeLights: 4 });
  });

  it('omits footwell lights at low quality', () => {
    const scene = new Scene();
    const controller = createCabinLighting(scene, rendererWithExposure(), 'low');

    controller.setEnabled(true, true);

    expect(rigLights(scene).map((light) => light.name)).toEqual([
      'cabin-roof-light',
      'cabin-screen-light',
    ]);
    expect(controller.getDiagnostics().activeLights).toBe(2);
  });

  it('restores the captured exterior exposure when disabled', () => {
    const renderer = rendererWithExposure(0.9);
    const controller = createCabinLighting(new Scene(), renderer, 'medium');

    controller.setEnabled(true, true);
    controller.setEnabled(false, true);

    expect(renderer.toneMappingExposure).toBe(0.9);
    expect(controller.getDiagnostics()).toEqual({ enabled: false, exposure: 0.9, activeLights: 0 });
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
