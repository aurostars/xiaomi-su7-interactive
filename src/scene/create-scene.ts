import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCabinLighting } from './cabin-lighting';
import { createRenderScheduler, type RenderReason } from './render-scheduler';

export type SceneQuality = 'low' | 'medium' | 'high';

export interface SceneRuntime {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  requestRender(): void;
  beginRenderActivity(reason: RenderReason): void;
  endRenderActivity(reason: RenderReason): void;
  isRenderActive(): boolean;
  getActiveRenderReasons(): readonly RenderReason[];
  resize(): void;
  render(): void;
  start(): void;
  setBeforeRender(callback: (now: number) => void): () => void;
  setCabinMode(enabled: boolean, immediate?: boolean): void;
  getCabinLightingDiagnostics(): { enabled: boolean; exposure: number; activeLights: number };
  dispose(): void;
}

const pixelRatioCaps: Record<SceneQuality, number> = { low: 1, medium: 1.5, high: 2 };

export function pixelRatioCap(quality: SceneQuality): number { return pixelRatioCaps[quality]; }
export function pixelRatioFor(quality: SceneQuality, devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio || 1, quality === 'low' ? 1 : 1.5), pixelRatioCap(quality));
}

export const automotiveLighting = {
  exposure: 0.9,
  ambient: 0.32,
  key: 1.08,
  cyan: 0.52,
  warm: 0.32,
} as const;

export const automotiveSurface = {
  environmentIntensity: 1.35,
  groundOpacity: 0.48,
  groundSize: 36,
} as const;

export function rendererOptions(quality: SceneQuality) {
  return { antialias: quality !== 'low', alpha: true } as const;
}

export function createRenderLifecycle(renderScene: () => void, onRendered: () => void) {
  let beforeRender: ((now: number) => void) | undefined;
  let disposed = false;

  return {
    setBeforeRender(callback: (now: number) => void) {
      beforeRender = callback;
      return () => {
        if (beforeRender === callback) beforeRender = undefined;
      };
    },
    render(now: number) {
      if (disposed) return;
      beforeRender?.(now);
      renderScene();
      onRendered();
    },
    dispose() {
      disposed = true;
      beforeRender = undefined;
    },
  };
}

export function createScheduledRenderLifecycle(
  renderScene: () => void,
  onRendered: () => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
) {
  const lifecycle = createRenderLifecycle(renderScene, onRendered);
  const scheduler = createRenderScheduler({
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: cancelFrame,
    renderFrame: (time) => lifecycle.render(time),
  });

  return {
    setBeforeRender: lifecycle.setBeforeRender,
    requestRender: scheduler.requestFrame,
    beginRenderActivity: scheduler.begin,
    endRenderActivity: scheduler.end,
    isRenderActive: scheduler.isActive,
    getActiveRenderReasons: scheduler.getActiveReasons,
    dispose() {
      scheduler.dispose();
      lifecycle.dispose();
    },
  };
}

export function bindSceneResize(resize: () => void): () => void {
  window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
}

export function attachEnvironmentTarget(scene: Scene, target: WebGLRenderTarget): () => void {
  scene.environment = target.texture;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    scene.environment = null;
    target.dispose();
  };
}

export function createScene(
  canvas: HTMLCanvasElement,
  quality: SceneQuality,
  onRendered: () => void = () => undefined,
  reducedMotion = false,
): SceneRuntime {
  const scene = new Scene();
  scene.background = new Color(0x05090f);
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(6.8, 2.8, 7.8);
  camera.lookAt(0, 0.7, 0);

  const renderer = new WebGLRenderer({ canvas, ...rendererOptions(quality) });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = automotiveLighting.exposure;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(pixelRatioFor(quality, window.devicePixelRatio));

  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(room, .04);
  const disposeEnvironment = attachEnvironmentTarget(scene, environmentTarget);
  room.dispose();
  pmrem.dispose();

  const groundMaterial = new ShadowMaterial({ color: 0x020407, opacity: automotiveSurface.groundOpacity });
  const groundGeometry = new PlaneGeometry(automotiveSurface.groundSize, automotiveSurface.groundSize);
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.name = 'vehicle-contact-ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.03;
  ground.receiveShadow = true;

  const ambient = new AmbientLight(0xdce8ff, automotiveLighting.ambient);
  const key = new DirectionalLight(0xffffff, automotiveLighting.key);
  key.name = 'main-rim-light';
  key.position.set(4, 7, 5);
  key.castShadow = quality !== 'low';
  key.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -.0004;
  const cyan = new DirectionalLight(0x4de8ff, automotiveLighting.cyan);
  cyan.name = 'cool-cyan-side-light';
  cyan.position.set(-5, 3.8, 2.5);
  const warm = new DirectionalLight(0xff8050, automotiveLighting.warm);
  warm.name = 'warm-fill-light';
  warm.position.set(3, 2.5, -5);
  scene.add(ground, ambient, key, cyan, warm);

  const renderLifecycle = createScheduledRenderLifecycle(
    () => renderer.render(scene, camera),
    onRendered,
  );
  const cabinLighting = createCabinLighting(
    scene,
    renderer,
    quality,
    reducedMotion,
    renderLifecycle.requestRender,
  );
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderLifecycle.requestRender();
  };
  const unbindResize = bindSceneResize(resize);
  const onContextRestored = () => renderLifecycle.requestRender();
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  return {
    scene, camera, renderer, resize,
    requestRender: renderLifecycle.requestRender,
    beginRenderActivity: renderLifecycle.beginRenderActivity,
    endRenderActivity: renderLifecycle.endRenderActivity,
    isRenderActive: renderLifecycle.isRenderActive,
    getActiveRenderReasons: renderLifecycle.getActiveRenderReasons,
    render: renderLifecycle.requestRender,
    start() {
      resize();
    },
    setBeforeRender(callback) {
      return renderLifecycle.setBeforeRender(callback);
    },
    setCabinMode(enabled, immediate) {
      cabinLighting.setEnabled(enabled, immediate);
    },
    getCabinLightingDiagnostics() {
      return cabinLighting.getDiagnostics();
    },
    dispose() {
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      renderLifecycle.dispose();
      unbindResize();
      disposeEnvironment();
      groundGeometry.dispose();
      groundMaterial.dispose();
      cabinLighting.dispose();
      renderer.dispose();
    },
  };
}
