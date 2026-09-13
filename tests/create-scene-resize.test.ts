import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GridHelper,
  LineBasicMaterial,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  ShadowMaterial,
} from 'three';

const rendererHarness = vi.hoisted(() => ({
  instances: [] as Array<{
    render: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class WebGLRenderer {
    outputColorSpace = '';
    toneMapping = 0;
    toneMappingExposure = 1;
    shadowMap = { enabled: false, type: 0 };
    render = vi.fn();
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    dispose = vi.fn();

    constructor() {
      rendererHarness.instances.push(this);
    }
  }
  class PMREMGenerator {
    fromScene() {
      return { texture: new actual.Texture(), dispose: vi.fn() };
    }
    dispose() {}
  }
  return { ...actual, PMREMGenerator, WebGLRenderer };
});

vi.mock('three/examples/jsm/environments/RoomEnvironment.js', () => ({
  RoomEnvironment: class {
    dispose() {}
  },
}));

import { createScene, type SceneQuality } from '../src/scene/create-scene';

function installAnimationFrames() {
  let nextHandle = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
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
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

function createRuntime(onRendered: () => void = () => undefined, quality: SceneQuality = 'low') {
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 400 },
  });
  const runtime = createScene(canvas, quality, onRendered);
  const renderer = rendererHarness.instances.at(-1);
  if (!renderer) throw new Error('renderer was not created');
  return { canvas, renderer, runtime };
}

afterEach(() => {
  rendererHarness.instances.length = 0;
  vi.restoreAllMocks();
});

describe('spatial display ground', () => {
  it('groups a low-contrast grid, colored accents, and the contact shadow below the vehicle', () => {
    const { runtime } = createRuntime(() => undefined, 'medium');
    const displayGround = runtime.scene.getObjectByName('display-ground');

    expect(displayGround?.children.map(({ name }) => name).sort()).toEqual([
      'display-accent-cyan',
      'display-accent-orange',
      'display-grid',
      'vehicle-contact-ground',
    ]);

    const grid = displayGround?.getObjectByName('display-grid') as GridHelper | undefined;
    const contact = displayGround?.getObjectByName('vehicle-contact-ground') as Mesh | undefined;
    const gridMaterials = Array.isArray(grid?.material) ? grid.material : [grid?.material];
    expect(grid?.position.y).toBeLessThan(0);
    expect(grid?.renderOrder).toBeLessThan(0);
    expect(gridMaterials.every((material) => material instanceof LineBasicMaterial)).toBe(true);
    expect(gridMaterials.every((material) => material?.transparent && !material.depthWrite)).toBe(true);
    expect(contact?.position.y).toBeLessThan(0);
    expect(contact?.renderOrder).toBeLessThan(0);
    expect(contact?.material).toBeInstanceOf(ShadowMaterial);
    expect((contact?.material as Material).transparent).toBe(true);
    expect((contact?.material as Material).depthWrite).toBe(false);

    for (const name of ['display-accent-cyan', 'display-accent-orange']) {
      const accent = displayGround?.getObjectByName(name) as Mesh | undefined;
      expect(accent?.position.y).toBeLessThan(0);
      expect(accent?.renderOrder).toBeLessThan(0);
      const materials = Array.isArray(accent?.material) ? accent.material : [accent?.material];
      expect(materials.every((material) => material instanceof MeshBasicMaterial)).toBe(true);
      expect(materials.every((material) => material?.transparent && !material.depthWrite)).toBe(true);
    }

    runtime.dispose();
  });

  it('hides the exterior display ground in cabin mode so its cyan accents cannot leak through windows', () => {
    const { runtime } = createRuntime(() => undefined, 'high');
    const displayGround = runtime.scene.getObjectByName('display-ground');

    runtime.setCabinMode(true, 'passenger', true);
    expect(displayGround?.visible).toBe(false);

    runtime.setCabinMode(false, 'passenger', true);
    expect(displayGround?.visible).toBe(true);
    runtime.dispose();
  });

  it('omits accents and reduces grid geometry at low quality', () => {
    const low = createRuntime();
    const medium = createRuntime(() => undefined, 'medium');
    const lowGround = low.runtime.scene.getObjectByName('display-ground');
    const mediumGround = medium.runtime.scene.getObjectByName('display-ground');
    const lowGrid = lowGround?.getObjectByName('display-grid') as GridHelper | undefined;
    const lowContact = lowGround?.getObjectByName('vehicle-contact-ground') as Mesh | undefined;
    const mediumGrid = mediumGround?.getObjectByName('display-grid') as GridHelper | undefined;
    const lowGridMaterials = Array.isArray(lowGrid?.material) ? lowGrid.material : [lowGrid?.material];

    expect(lowGround?.getObjectByName('display-accent-cyan')).toBeUndefined();
    expect(lowGround?.getObjectByName('display-accent-orange')).toBeUndefined();
    expect(lowGrid?.position.y).toBeLessThan(0);
    expect(lowGrid?.renderOrder).toBeLessThan(0);
    expect(lowGridMaterials.every((material) => material instanceof LineBasicMaterial)).toBe(true);
    expect(lowGridMaterials.every((material) => material?.transparent && !material.depthWrite)).toBe(true);
    expect(lowContact?.position.y).toBeLessThan(0);
    expect(lowContact?.renderOrder).toBeLessThan(0);
    expect(lowContact?.material).toBeInstanceOf(ShadowMaterial);
    expect((lowContact?.material as Material).transparent).toBe(true);
    expect((lowContact?.material as Material).depthWrite).toBe(false);
    expect(lowGrid?.geometry.getAttribute('position').count).toBeLessThan(
      mediumGrid?.geometry.getAttribute('position').count ?? 0,
    );

    low.runtime.dispose();
    medium.runtime.dispose();
  });

  it('disposes every owned display-ground geometry and material exactly once', () => {
    const { runtime } = createRuntime(() => undefined, 'high');
    const displayGround = runtime.scene.getObjectByName('display-ground');
    if (!displayGround) throw new Error('display ground was not created');
    const disposeSpies = displayGround.children.flatMap((child) => {
      const mesh = child as Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return [
        vi.spyOn(mesh.geometry, 'dispose'),
        ...materials.map((material: Material) => vi.spyOn(material, 'dispose')),
      ];
    });

    runtime.dispose();
    runtime.dispose();

    for (const dispose of disposeSpies) expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('scene resize lifecycle', () => {
  it('coalesces resize and context restoration into one real scene frame', () => {
    const frames = installAnimationFrames();
    const { canvas, renderer, runtime } = createRuntime();

    window.dispatchEvent(new Event('resize'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(renderer.render).not.toHaveBeenCalled();
    expect(frames.pendingCount()).toBe(1);
    frames.flush(16);
    expect(renderer.setSize).toHaveBeenCalledWith(800, 400, false);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(frames.pendingCount()).toBe(0);
    runtime.dispose();
  });

  it('makes manual render asynchronous and preserves frame callback order in RAF', () => {
    const frames = installAnimationFrames();
    const order: string[] = [];
    const { renderer, runtime } = createRuntime(() => order.push('onRendered'));
    renderer.render.mockImplementation(() => order.push('renderer.render'));
    runtime.setBeforeRender((time) => order.push(`beforeRender:${time}`));

    runtime.render();
    runtime.render();

    expect(renderer.render).not.toHaveBeenCalled();
    expect(frames.pendingCount()).toBe(1);
    frames.flush(32);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['beforeRender:32', 'renderer.render', 'onRendered']);
    expect(frames.pendingCount()).toBe(0);
    runtime.dispose();
  });

  it('keeps rendering only while an activity reason is retained', () => {
    const frames = installAnimationFrames();
    const { renderer, runtime } = createRuntime();

    runtime.beginRenderActivity('camera');
    frames.flush(0);
    frames.flush(16);
    expect(renderer.render).toHaveBeenCalledTimes(2);

    runtime.endRenderActivity('camera');
    frames.flush(32);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(frames.pendingCount()).toBe(0);
    runtime.dispose();
  });

  it('cancels pending work, removes listeners, and ignores requests after dispose', () => {
    const frames = installAnimationFrames();
    const { canvas, renderer, runtime } = createRuntime();

    runtime.requestRender();
    expect(frames.pendingCount()).toBe(1);
    runtime.dispose();
    expect(frames.cancelled).toHaveLength(1);
    expect(frames.pendingCount()).toBe(0);

    const resizeCalls = renderer.setSize.mock.calls.length;
    window.dispatchEvent(new Event('resize'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    runtime.render();
    expect(renderer.setSize).toHaveBeenCalledTimes(resizeCalls);
    expect(frames.pendingCount()).toBe(0);
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
