import { AmbientLight, Group, PointLight, type Light, type Scene, type WebGLRenderer } from 'three';
import type { SceneQuality } from './create-scene';

export type Invalidate = () => void;

export interface CabinLightingController {
  setEnabled(enabled: boolean, immediate?: boolean): void;
  getDiagnostics(): { enabled: boolean; exposure: number; activeLights: number };
  dispose(): void;
}

const CABIN_EXPOSURE = 0.88;
const TRANSITION_MS = 240;

export function createCabinLighting(
  scene: Scene,
  renderer: WebGLRenderer,
  quality: SceneQuality,
  reducedMotion = false,
  invalidate: Invalidate = () => undefined,
): CabinLightingController {
  const rig = new Group();
  rig.name = 'cabin-light-rig';

  const roof = new PointLight(0xdce8ff, 0, 3.2);
  roof.name = 'cabin-roof-light';
  roof.position.set(0, 1.62, 0.2);

  const screen = new PointLight(0x72dfff, 0, 2.1);
  screen.name = 'cabin-screen-light';
  screen.position.set(0, 1.12, -0.72);

  const ambient = new AmbientLight(0xb8d9ff, 0);
  ambient.name = 'cabin-ambient-fill';

  const lights: Array<{ light: Light; enabledIntensity: number }> = [
    { light: ambient, enabledIntensity: 0.45 },
    { light: roof, enabledIntensity: 1.4 },
    { light: screen, enabledIntensity: 0.35 },
  ];
  rig.add(ambient, roof, screen);

  if (quality !== 'low') {
    const left = new PointLight(0x5aaeff, 0, 1.35);
    left.name = 'cabin-footwell-left-light';
    left.position.set(-0.55, 0.3, -0.15);
    const right = left.clone();
    right.name = 'cabin-footwell-right-light';
    right.position.x = 0.55;
    rig.add(left, right);
    lights.push(
      { light: left, enabledIntensity: 0.18 },
      { light: right, enabledIntensity: 0.18 },
    );
  }

  scene.add(rig);
  const exteriorExposure = renderer.toneMappingExposure;
  let enabled = false;
  let disposed = false;
  let animationFrame: number | null = null;

  const cancelTransition = () => {
    if (animationFrame === null) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const apply = (intensities: number[], exposure: number) => {
    lights.forEach(({ light }, index) => { light.intensity = intensities[index]; });
    renderer.toneMappingExposure = exposure;
  };

  return {
    setEnabled(nextEnabled, immediate = false) {
      if (disposed) return;
      cancelTransition();
      enabled = nextEnabled;
      const targets = lights.map(({ enabledIntensity }) => nextEnabled ? enabledIntensity : 0);
      const targetExposure = nextEnabled ? CABIN_EXPOSURE : exteriorExposure;
      if (immediate || reducedMotion) {
        apply(targets, targetExposure);
        invalidate();
        return;
      }

      const starts = lights.map(({ light }) => light.intensity);
      const startExposure = renderer.toneMappingExposure;
      const startAt = performance.now();
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startAt) / TRANSITION_MS);
        const eased = 1 - (1 - progress) ** 3;
        apply(
          starts.map((start, index) => start + (targets[index] - start) * eased),
          startExposure + (targetExposure - startExposure) * eased,
        );
        invalidate();
        if (progress < 1) animationFrame = requestAnimationFrame(animate);
        else animationFrame = null;
      };
      animationFrame = requestAnimationFrame(animate);
    },
    getDiagnostics() {
      return {
        enabled,
        exposure: renderer.toneMappingExposure,
        activeLights: lights.filter(({ light }) => light.intensity > 0).length,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelTransition();
      enabled = false;
      apply(lights.map(() => 0), exteriorExposure);
      rig.removeFromParent();
      rig.clear();
    },
  };
}
