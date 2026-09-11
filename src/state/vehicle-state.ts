export type VehicleMode = 'exterior' | 'cabin';
export type SeatView = 'driver' | 'passenger' | 'rear';

export interface VehicleState {
  mode: VehicleMode;
  paint: string;
  interior: string;
  doorsOpen: boolean;
  seatView: SeatView;
  hotspot: string;
  autoCameraSuspendedUntil: number;
}

export interface VehicleStore {
  getState(): VehicleState;
  subscribe(listener: () => void): () => void;
  actions: {
    setMode(mode: VehicleMode): void;
    setPaint(paint: string): void;
    setInterior(interior: string): void;
    toggleDoors(): void;
    setSeatView(seatView: SeatView): void;
    setHotspot(hotspot: string): void;
    suspendAutoCamera(durationMs: number): void;
  };
}

const defaultState: VehicleState = {
  mode: 'exterior',
  paint: 'lava-orange',
  interior: 'obsidian-black',
  doorsOpen: false,
  seatView: 'driver',
  hotspot: 'hero',
  autoCameraSuspendedUntil: 0,
};

export function createVehicleStore(initial: Partial<VehicleState> = {}): VehicleStore {
  let state: VehicleState = { ...defaultState, ...initial };
  const listeners = new Set<() => void>();

  const update = (fields: Partial<VehicleState>) => {
    state = { ...state, ...fields };
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions: {
      setMode: (mode) => update({ mode }),
      setPaint: (paint) => update({ paint }),
      setInterior: (interior) => update({ interior }),
      toggleDoors: () => update({ doorsOpen: !state.doorsOpen }),
      setSeatView: (seatView) => update({ mode: 'cabin', seatView }),
      setHotspot: (hotspot) => update({ hotspot }),
      suspendAutoCamera: (durationMs) =>
        update({ autoCameraSuspendedUntil: Date.now() + durationMs }),
    },
  };
}
