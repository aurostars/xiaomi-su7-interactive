import type { VehicleStore } from '../state/vehicle-state';
import type { ShellElements } from './render-shell';

export function bindControls(elements: ShellElements, store: VehicleStore): () => void {
  const cleanups: Array<() => void> = [];
  const listen = (element: HTMLElement, handler: () => void) => {
    element.addEventListener('click', handler);
    cleanups.push(() => element.removeEventListener('click', handler));
  };

  elements.modeButtons.forEach((button) => {
    listen(button, () => store.actions.setMode(button.dataset.mode === 'cabin' ? 'cabin' : 'exterior'));
  });
  elements.colorButtons.forEach((button) => {
    listen(button, () => {
      if (button.dataset.paint) store.actions.setPaint(button.dataset.paint);
      if (button.dataset.interior) store.actions.setInterior(button.dataset.interior);
    });
  });
  elements.seatButtons.forEach((button) => {
    listen(button, () => {
      const seat = button.dataset.seat;
      if (seat === 'driver' || seat === 'passenger' || seat === 'rear') store.actions.setSeatView(seat);
    });
  });
  listen(elements.doorButton, () => store.actions.toggleDoors());

  const sync = () => {
    const state = store.getState();
    elements.modeButtons.forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    elements.colorButtons.forEach((button) => {
      const selected = button.dataset.paint === state.paint || button.dataset.interior === state.interior;
      button.setAttribute('aria-pressed', String(selected));
    });
    elements.seatButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.seat === state.seatView));
    });
    elements.doorButton.setAttribute('aria-pressed', String(state.doorsOpen));
    elements.doorButton.textContent = state.doorsOpen ? '关门' : '开门';
    document.documentElement.dataset.vehicleMode = state.mode;
  };

  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    cleanups.forEach((cleanup) => cleanup());
    delete document.documentElement.dataset.vehicleMode;
  };
}
