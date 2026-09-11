import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Group,
  MeshStandardMaterial,
} from 'three';
import type { VehicleState } from '../src/state/vehicle-state';
import { createVehicleController } from '../src/scene/vehicle-controller';
import type { LoadedVehicle } from '../src/scene/load-vehicle';

const state = (overrides: Partial<VehicleState> = {}): VehicleState => ({
  mode: 'exterior',
  paint: 'lava-orange',
  interior: 'cloud-brown',
  doorsOpen: true,
  seatView: 'driver',
  hotspot: 'hero',
  autoCameraSuspendedUntil: 0,
  ...overrides,
});

function makeVehicle(): LoadedVehicle & { untouched: MeshStandardMaterial } {
  const root = new Group();
  const leftDoor = new Group();
  const rightDoor = new Group();
  const bodyMaterial = new MeshStandardMaterial({ color: '#ffffff' });
  const interiorMaterial = new MeshStandardMaterial({ color: '#111111' });
  const untouched = new MeshStandardMaterial({ color: '#123456' });
  root.add(leftDoor, rightDoor);

  return {
    root,
    bodyMaterials: [bodyMaterial],
    interiorMaterials: [interiorMaterial],
    doors: { left: leftDoor, right: rightDoor },
    capabilities: {
      bodyColor: true,
      interiorColor: true,
      leftDoor: true,
      rightDoor: true,
    },
    dispose: () => undefined,
    untouched,
  };
}

function finishAnimations() {
  vi.advanceTimersByTime(1_000);
}

describe('createVehicleController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('interpolates recognized paint, interior, and front doors without changing unrelated materials', () => {
    vi.useFakeTimers();
    const vehicle = makeVehicle();
    const controller = createVehicleController(vehicle);

    controller.applyState(state());
    expect(vehicle.bodyMaterials[0].color.getHexString()).toBe('ff4b2b');
    expect(vehicle.interiorMaterials[0].color.getHexString()).toBe('c4a484');
    finishAnimations();

    expect(vehicle.bodyMaterials[0].color.getHexString()).toBe('ff4b2b');
    expect(vehicle.interiorMaterials[0].color.getHexString()).toBe('c4a484');
    expect(vehicle.untouched.color.getHexString()).toBe('123456');
    expect(vehicle.doors.left?.rotation.y).toBeCloseTo(-1.05);
    expect(vehicle.doors.right?.rotation.y).toBeCloseTo(1.05);
  });

  it('closes doors, rotates the vehicle root, and stops pending animation on dispose', () => {
    vi.useFakeTimers();
    const vehicle = makeVehicle();
    vehicle.doors.left!.rotation.y = -1.05;
    vehicle.doors.right!.rotation.y = 1.05;
    const controller = createVehicleController(vehicle);

    controller.setRotation(Math.PI / 3);
    controller.applyState(state({ doorsOpen: false, paint: '#00ff00' }));
    controller.dispose();
    finishAnimations();

    expect(vehicle.root.rotation.y).toBeCloseTo(Math.PI / 3);
    expect(vehicle.doors.left?.rotation.y).toBeCloseTo(-1.05);
    expect(vehicle.doors.right?.rotation.y).toBeCloseTo(1.05);
    expect(vehicle.bodyMaterials[0].color.getHexString()).toBe('00ff00');
  });
});
