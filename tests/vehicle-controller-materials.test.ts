import { describe, expect, it } from 'vitest';
import { Color, Group, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { getPaintOption } from '../src/content/vehicle-palettes';
import { createVehicleController } from '../src/scene/vehicle-controller';
import type { LoadedVehicle } from '../src/scene/load-vehicle';
import type { VehicleState } from '../src/state/vehicle-state';

const lavaOrangeState: VehicleState = {
  mode: 'exterior',
  paint: 'lava-orange',
  interior: 'galaxy-gray',
  doorsOpen: false,
  seatView: 'driver',
  activeStoryId: 'aero',
  autoCameraSuspendedUntil: 0,
};

describe('vehicle paint physical materials', () => {
  it('applies every paint tuning field only to physical body materials', () => {
    const bodyMaterial = new MeshPhysicalMaterial({ color: 0xffffff });
    const nonPhysicalBodyMaterial = new MeshStandardMaterial({ color: 0x123456 });
    const interiorMaterial = new MeshPhysicalMaterial({
      color: 0x654321,
      metalness: 0.1,
      roughness: 0.8,
      clearcoat: 0.2,
      clearcoatRoughness: 0.6,
    });
    const vehicle: LoadedVehicle = {
      root: new Group(),
      bodyMaterials: [bodyMaterial, nonPhysicalBodyMaterial],
      interiorMaterials: [interiorMaterial],
      screenMaterials: [],
      doors: {},
      capabilities: {
        bodyColor: true,
        interiorColor: true,
        screenGlow: false,
        doors: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
      },
      setCabinPresentation: () => undefined,
      dispose: () => undefined,
    };
    const expected = getPaintOption('lava-orange').material;
    const originalNonPhysicalBodyColor = nonPhysicalBodyMaterial.color.getHexString();

    createVehicleController(vehicle, true).applyState(lavaOrangeState);

    expect(bodyMaterial.color.getHexString()).toBe(new Color(expected.color).getHexString());
    expect(bodyMaterial.metalness).toBe(expected.metalness);
    expect(bodyMaterial.roughness).toBe(expected.roughness);
    expect(bodyMaterial.clearcoat).toBe(expected.clearcoat);
    expect(bodyMaterial.clearcoatRoughness).toBe(expected.clearcoatRoughness);
    expect(nonPhysicalBodyMaterial.color.getHexString()).toBe(originalNonPhysicalBodyColor);
    expect(interiorMaterial.metalness).toBe(0.1);
    expect(interiorMaterial.roughness).toBe(0.8);
    expect(interiorMaterial.clearcoat).toBe(0.2);
    expect(interiorMaterial.clearcoatRoughness).toBe(0.6);
  });
});
