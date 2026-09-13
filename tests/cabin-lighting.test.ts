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
      activeLights: 5,
    });
  });

  it('omits footwell lights at low quality', () => {
    const scene = new Scene();
    const controller = createCabinLighting(scene, rendererWithExposure(), 'low');

    controller.setEnabled(true, true);

    expect(rigLights(scene).map((light) => light.name)).toEqual([
      'cabin-roof-light',
      'cabin-screen-light',
    ]);
    expect(controller.getDiagnostics().activeLights).toBe(3);
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
