import type { VehicleCapabilities } from '../scene/load-vehicle';
import type { VehicleStore } from '../state/vehicle-state';
import type { ShellElements } from './render-shell';

const HOTSPOT_LABELS: Record<string, string> = {
  hero: '车辆总览',
  aero: '空气动力学',
  performance: '电驱与底盘',
  cabin: '智能座舱',
  sensing: '智能驾驶感知',
};

export function applyVehicleCapabilities(elements: ShellElements, capabilities: VehicleCapabilities): void {
  elements.colorButtons.forEach((button) => {
    button.disabled = button.dataset.paint ? !capabilities.bodyColor : !capabilities.interiorColor;
  });
  elements.doorButton.disabled = !capabilities.leftDoor && !capabilities.rightDoor;
}

export function bindControls(elements: ShellElements, store: VehicleStore): () => void {
  const cleanups: Array<() => void> = [];
  const listen = (element: HTMLElement, handler: () => void) => {
    element.addEventListener('click', handler);
    cleanups.push(() => element.removeEventListener('click', handler));
  };

  elements.modeButtons.forEach((button, index) => {
    listen(button, () => store.actions.setMode(button.dataset.mode === 'cabin' ? 'cabin' : 'exterior'));
    const onKeyDown = (event: KeyboardEvent) => {
      const lastIndex = elements.modeButtons.length - 1;
      let nextIndex: number | undefined;
      if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
      if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = lastIndex;
      if (nextIndex === undefined) return;
      event.preventDefault();
      const nextButton = elements.modeButtons[nextIndex];
      nextButton.focus();
      store.actions.setMode(nextButton.dataset.mode === 'cabin' ? 'cabin' : 'exterior');
    };
    button.addEventListener('keydown', onKeyDown);
    cleanups.push(() => button.removeEventListener('keydown', onKeyDown));
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
  listen(elements.enterCabinButton, () => store.actions.setMode('cabin'));

  const sync = () => {
    const state = store.getState();
    elements.modeButtons.forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      const panelId = button.getAttribute('aria-controls');
      const panel = panelId ? button.ownerDocument.getElementById(panelId) : null;
      if (panel) panel.hidden = !selected;
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
    elements.hotspotLabel.querySelector('strong')!.textContent = HOTSPOT_LABELS[state.hotspot] ?? '车辆总览';
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
