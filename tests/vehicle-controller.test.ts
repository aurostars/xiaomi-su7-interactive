import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import type { VehicleState } from '../src/state/vehicle-state';
import { createVehicleController } from '../src/scene/vehicle-controller';
import { createLoadedVehicle, type LoadedVehicle } from '../src/scene/load-vehicle';

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

function makeVehicle(): LoadedVehicle & {
  screen: MeshStandardMaterial;
  untouched: MeshBasicMaterial;
} {
  const root = new Group();
  const frontLeftDoor = new Group();
  const frontRightDoor = new Group();
  const rearLeftDoor = new Group();
  const rearRightDoor = new Group();
  const bodyMaterial = new MeshStandardMaterial({ color: '#ffffff' });
  const interiorMaterial = new MeshStandardMaterial({ color: '#111111' });
  const screen = new MeshStandardMaterial({ emissive: '#000000', emissiveIntensity: 0 });
  const untouched = new MeshBasicMaterial({ color: '#123456' });
  root.add(frontLeftDoor, frontRightDoor, rearLeftDoor, rearRightDoor);

  return {
    root,
    bodyMaterials: [bodyMaterial],
    interiorMaterials: [interiorMaterial],
    screenMaterials: [screen, untouched],
    doors: {
      frontLeft: frontLeftDoor,
      frontRight: frontRightDoor,
      rearLeft: rearLeftDoor,
      rearRight: rearRightDoor,
    },
    capabilities: {
      bodyColor: true,
      interiorColor: true,
      screenGlow: true,
      doors: {
        frontLeft: true,
        frontRight: true,
        rearLeft: true,
        rearRight: true,
      },
    },
    dispose: () => undefined,
    screen,
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

  it('animates all four doors to their side-specific open angles', () => {
    vi.useFakeTimers();
    const controller = createVehicleController(makeVehicle());

    controller.applyState(state());
    finishAnimations();

    expect(controller.getDiagnostics().doorAngles).toEqual({
      frontLeft: -1.05,
      frontRight: 1.05,
      rearLeft: -0.92,
      rearRight: 0.92,
    });
  });

  it('reverses all doors from their current angles without jumping to open targets', () => {
    vi.useFakeTimers();
    const vehicle = makeVehicle();
    const controller = createVehicleController(vehicle);

    controller.applyState(state());
    vi.advanceTimersByTime(120);
    const partialAngles = controller.getDiagnostics().doorAngles;
    controller.applyState(state({ doorsOpen: false }));

    expect(controller.getDiagnostics().doorAngles).toEqual(partialAngles);
    expect(partialAngles.frontLeft).not.toBe(-1.05);
    expect(partialAngles.rearRight).not.toBe(0.92);
    finishAnimations();
    expect(controller.getDiagnostics().doorAngles).toEqual({
      frontLeft: 0,
      frontRight: 0,
      rearLeft: 0,
      rearRight: 0,
    });
  });

  it.each([
    ['seatView', { seatView: 'passenger' }],
    ['paint', { paint: 'gulf-blue' }],
    ['hotspot', { hotspot: 'performance' }],
  ] as const)('does not restart door motion for a %s-only update', (_field, update) => {
    vi.useFakeTimers();
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    const controller = createVehicleController(makeVehicle());

    controller.applyState(state());
    expect(schedule).toHaveBeenCalledTimes(1);
    controller.applyState(state(update));

    expect(schedule).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(400);
    expect(controller.getDiagnostics().doorAngles).toEqual({
      frontLeft: -1.05,
      frontRight: 1.05,
      rearLeft: -0.92,
      rearRight: 0.92,
    });
  });

  it('schedules a new motion only when doorsOpen changes', () => {
    vi.useFakeTimers();
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    const controller = createVehicleController(makeVehicle());

    controller.applyState(state({ doorsOpen: false }));
    expect(schedule).toHaveBeenCalledTimes(1);
    controller.applyState(state({ doorsOpen: true }));

    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('invalidates every non-reduced door animation update', () => {
    vi.useFakeTimers();
    const invalidate = vi.fn();
    const controller = createVehicleController(makeVehicle(), false, invalidate);

    controller.applyState(state());
    vi.advanceTimersByTime(48);

    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it('applies final door angles synchronously and invalidates once with reduced motion', () => {
    vi.useFakeTimers();
    const invalidate = vi.fn();
    const controller = createVehicleController(makeVehicle(), true, invalidate);

    controller.applyState(state());

    expect(controller.getDiagnostics().doorAngles).toEqual({
      frontLeft: -1.05,
      frontRight: 1.05,
      rearLeft: -0.92,
      rearRight: 0.92,
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drives emissive mode and intensity on the real generated screen materials', () => {
    vi.useFakeTimers();
    const vehicle = createLoadedVehicle(new Group());
    const controller = createVehicleController(vehicle, true);

    expect(vehicle.capabilities.screenGlow).toBe(true);
    for (const material of vehicle.screenMaterials) {
      expect(material).toBeInstanceOf(MeshStandardMaterial);
    }

    controller.applyState(state({ mode: 'exterior', doorsOpen: false }));
    for (const material of vehicle.screenMaterials as MeshStandardMaterial[]) {
      expect(material.emissive.getHexString()).toBe('72dfff');
      expect(material.emissiveIntensity).toBe(0.18);
    }

    controller.applyState(state({ mode: 'cabin', doorsOpen: false }));
    for (const material of vehicle.screenMaterials as MeshStandardMaterial[]) {
      expect(material.emissive.getHexString()).toBe('72dfff');
      expect(material.emissiveIntensity).toBe(0.7);
    }
  });

  it('rotates the vehicle root and stops pending animation on dispose', () => {
    vi.useFakeTimers();
    const vehicle = makeVehicle();
    const controller = createVehicleController(vehicle);

    controller.setRotation(Math.PI / 3);
    controller.applyState(state({ doorsOpen: false, paint: '#00ff00' }));
    controller.dispose();
    finishAnimations();

    expect(vehicle.root.rotation.y).toBeCloseTo(Math.PI / 3);
    expect(vehicle.bodyMaterials[0].color.getHexString()).toBe('00ff00');
    expect(vi.getTimerCount()).toBe(0);
  });
});
