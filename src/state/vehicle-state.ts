import type { StoryId } from '../content/story-chapters';
import { getInteriorOption, getPaintOption } from '../content/vehicle-palettes';

export type VehicleMode = 'exterior' | 'cabin';
export type SeatView = 'driver' | 'passenger' | 'rear';

export interface VehicleState {
  mode: VehicleMode;
  paint: string;
  interior: string;
  doorsOpen: boolean;
  seatView: SeatView;
  activeStoryId: StoryId;
  autoCameraSuspendedUntil: number;
}

export interface VehicleStore {
  getState(): Readonly<VehicleState>;
  subscribe(listener: () => void): () => void;
  actions: {
    setMode(mode: VehicleMode): void;
    setPaint(paint: string): void;
    setInterior(interior: string): void;
    toggleDoors(): void;
    setSeatView(seatView: SeatView): void;
    setActiveStory(id: StoryId): void;
    suspendAutoCamera(durationMs: number): void;
  };
}

const defaultState: VehicleState = {
  mode: 'exterior',
  paint: 'gulf-blue',
  interior: 'obsidian-black',
  doorsOpen: false,
  seatView: 'driver',
  activeStoryId: 'aero',
  autoCameraSuspendedUntil: 0,
};

export function createVehicleStore(initial: Partial<VehicleState> = {}): VehicleStore {
  let state: Readonly<VehicleState> = Object.freeze({
    ...defaultState,
    ...initial,
    paint: getPaintOption(initial.paint ?? defaultState.paint).id,
    interior: getInteriorOption(initial.interior ?? defaultState.interior).id,
  });
  const listeners = new Set<() => void>();

  const update = (fields: Partial<VehicleState>) => {
    const changed = Object.entries(fields).some(
      ([key, value]) => !Object.is(state[key as keyof VehicleState], value),
    );
    if (!changed) return;
    state = Object.freeze({ ...state, ...fields });
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions: {
      setMode: (mode) => update(mode === 'cabin'
        ? { mode, doorsOpen: true, seatView: 'driver' }
        : { mode }),
      setPaint: (paint) => update({ paint }),
      setInterior: (interior) => update({ interior }),
      toggleDoors: () => update({ doorsOpen: !state.doorsOpen }),
      setSeatView: (seatView) => update(state.mode === 'cabin'
        ? { seatView }
        : { mode: 'cabin', doorsOpen: true, seatView }),
      setActiveStory: (activeStoryId) => update({ activeStoryId }),
      suspendAutoCamera: (durationMs) =>
        update({ autoCameraSuspendedUntil: Date.now() + durationMs }),
    },
  };
}
