import { AmbientLight, Group, PointLight, type Light, type Scene, type WebGLRenderer } from 'three';
import type { SeatView } from '../state/vehicle-state';
import type { SceneQuality } from './create-scene';

export type Invalidate = () => void;

export interface CabinLightingOptions {
  enabled: boolean;
  seatView: SeatView;
}

export interface CabinLightingController {
  apply(options: CabinLightingOptions, immediate?: boolean): void;
  setEnabled(enabled: boolean, immediate?: boolean): void;
  getDiagnostics(): { enabled: boolean; exposure: number; activeLights: number };
  dispose(): void;
}

const CABIN_EXPOSURE = 0.88;
const TRANSITION_MS = 240;

type WeightedLight = {
  light: Light;
  intensities: Record<SeatView, number>;
};

const sameIntensity = (intensity: number): Record<SeatView, number> => ({
  driver: intensity,
  passenger: intensity,
  rear: intensity,
});

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

  const broadFill = new PointLight(0x8fcfff, 0, 4.8);
  broadFill.name = 'cabin-broad-fill';
  broadFill.position.set(0, 1.28, 0.15);

  const rearFill = new PointLight(0xa8d8ff, 0, 2.8);
  rearFill.name = 'cabin-rear-fill';
  rearFill.position.set(0, 1.15, 1.05);

  const lights: WeightedLight[] = [
    { light: ambient, intensities: sameIntensity(0.3) },
    { light: roof, intensities: { driver: 0.72, passenger: 0.72, rear: 0.58 } },
    { light: screen, intensities: { driver: 0.3, passenger: 0.3, rear: 0.18 } },
    { light: broadFill, intensities: { driver: 0.28, passenger: 0.28, rear: 0.36 } },
    { light: rearFill, intensities: { driver: 0.12, passenger: 0.12, rear: 0.48 } },
  ];
  rig.add(ambient, roof, screen, broadFill, rearFill);

  if (quality !== 'low') {
    const left = new PointLight(0x5aaeff, 0, 1.35);
    left.name = 'cabin-footwell-left-light';
    left.position.set(-0.55, 0.3, -0.15);
    const right = left.clone();
    right.name = 'cabin-footwell-right-light';
    right.position.x = 0.55;
    rig.add(left, right);
    lights.push(
      { light: left, intensities: { driver: 0.14, passenger: 0.1, rear: 0.08 } },
      { light: right, intensities: { driver: 0.1, passenger: 0.14, rear: 0.08 } },
    );
  }

  scene.add(rig);
  const exteriorExposure = renderer.toneMappingExposure;
  let enabled = false;
  let seatView: SeatView = 'driver';
  let disposed = false;
  let animationFrame: number | null = null;

  const cancelTransition = () => {
    if (animationFrame === null) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const setValues = (intensities: number[], exposure: number) => {
    lights.forEach(({ light }, index) => { light.intensity = intensities[index]; });
    renderer.toneMappingExposure = exposure;
  };

  const transitionTo = (options: CabinLightingOptions, immediate = false) => {
    if (disposed) return;
    cancelTransition();
    enabled = options.enabled;
    seatView = options.seatView;
    const targets = lights.map(({ intensities }) => enabled ? intensities[seatView] : 0);
    const targetExposure = enabled ? CABIN_EXPOSURE : exteriorExposure;
    if (immediate || reducedMotion) {
      setValues(targets, targetExposure);
      invalidate();
      return;
    }

    const starts = lights.map(({ light }) => light.intensity);
    const startExposure = renderer.toneMappingExposure;
    const startAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startAt) / TRANSITION_MS);
      const eased = 1 - (1 - progress) ** 3;
      setValues(
        starts.map((start, index) => start + (targets[index] - start) * eased),
        startExposure + (targetExposure - startExposure) * eased,
      );
      invalidate();
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
      else animationFrame = null;
    };
    animationFrame = requestAnimationFrame(animate);
  };

  return {
    apply: transitionTo,
    setEnabled(nextEnabled, immediate = false) {
      transitionTo({ enabled: nextEnabled, seatView }, immediate);
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
      setValues(lights.map(() => 0), exteriorExposure);
      rig.removeFromParent();
      rig.clear();
    },
  };
}
