import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVehicleStore } from '../src/state/vehicle-state';

describe('vehicle state', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the vehicle presentation defaults', () => {
    const store = createVehicleStore();

    expect(store.getState()).toEqual({
      mode: 'exterior',
      paint: 'lava-orange',
      interior: 'obsidian-black',
      doorsOpen: false,
      seatView: 'driver',
      hotspot: 'hero',
      autoCameraSuspendedUntil: 0,
    });
  });

  it('applies supplied initial state fields without changing other defaults', () => {
    const store = createVehicleStore({ paint: 'aqua-blue', doorsOpen: true });

    expect(store.getState()).toMatchObject({
      mode: 'exterior',
      paint: 'aqua-blue',
      doorsOpen: true,
      interior: 'obsidian-black',
    });
  });

  it('opening doors does not enter cabin mode', () => {
    const store = createVehicleStore();

    store.actions.toggleDoors();

    expect(store.getState().doorsOpen).toBe(true);
    expect(store.getState().mode).toBe('exterior');
  });

  it('selecting a seat enters cabin mode', () => {
    const store = createVehicleStore();

    store.actions.setSeatView('passenger');

    expect(store.getState()).toMatchObject({ mode: 'cabin', seatView: 'passenger' });
  });

  it('updates each independently selectable vehicle field', () => {
    const store = createVehicleStore();

    store.actions.setMode('cabin');
    store.actions.setPaint('pearl-white');
    store.actions.setInterior('mist-gray');
    store.actions.setHotspot('wheel');

    expect(store.getState()).toMatchObject({
      mode: 'cabin',
      paint: 'pearl-white',
      interior: 'mist-gray',
      hotspot: 'wheel',
      doorsOpen: false,
      seatView: 'driver',
    });
  });

  it('suspends the automatic camera for the requested duration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T07:38:00.000Z'));
    const store = createVehicleStore();

    store.actions.suspendAutoCamera(2_500);

    expect(store.getState().autoCameraSuspendedUntil).toBe(Date.now() + 2_500);
  });

  it('notifies subscribers after an action and supports unsubscribe', () => {
    const store = createVehicleStore();
    const observedPaints: string[] = [];
    const unsubscribe = store.subscribe(() => {
      observedPaints.push(store.getState().paint);
    });

    store.actions.setPaint('pearl-white');
    unsubscribe();
    store.actions.setPaint('aqua-blue');

    expect(observedPaints).toEqual(['pearl-white']);
  });
});
