import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

export type SceneQuality = 'low' | 'medium' | 'high';

export interface SceneRuntime {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  resize(): void;
  start(): void;
  dispose(): void;
}

const pixelRatioCaps: Record<SceneQuality, number> = {
  low: 1.5,
  medium: 1.5,
  high: 2,
};

export function pixelRatioCap(quality: SceneQuality): number {
  return pixelRatioCaps[quality];
}

export function pixelRatioFor(quality: SceneQuality, devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio || 1, 1.5), pixelRatioCap(quality));
}

export const automotiveLighting = {
  exposure: 0.85,
  ambient: 0.35,
  key: 1.1,
  cyan: 0.55,
  warm: 0.35,
} as const;

export function rendererOptions(_quality: SceneQuality) {
  return { antialias: true, alpha: true } as const;
}

export function bindSceneResize(resize: () => void): () => void {
  window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
}

export function createScene(canvas: HTMLCanvasElement, quality: SceneQuality): SceneRuntime {
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

  const ambient = new AmbientLight(0xdce8ff, automotiveLighting.ambient);
  const key = new DirectionalLight(0xffffff, automotiveLighting.key);
  key.name = 'main-rim-light';
  key.position.set(4, 7, 5);
  key.castShadow = quality !== 'low';
  const cyan = new DirectionalLight(0x4de8ff, automotiveLighting.cyan);
  cyan.name = 'cool-cyan-side-light';
  cyan.position.set(-5, 2.4, 1.5);
  const warm = new DirectionalLight(0xff8050, automotiveLighting.warm);
  warm.name = 'warm-fill-light';
  warm.position.set(2, 1.2, -5);
  scene.add(ambient, key, cyan, warm);

  let animationFrame = 0;
  let running = false;

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const unbindResize = bindSceneResize(resize);

  const render = () => {
    if (!running) return;
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(render);
  };

  return {
    scene,
    camera,
    renderer,
    resize,
    start() {
      if (running) return;
      running = true;
      resize();
      animationFrame = requestAnimationFrame(render);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(animationFrame);
      unbindResize();
      renderer.dispose();
    },
  };
}
