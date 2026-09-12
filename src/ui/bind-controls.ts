import type { VehicleCapabilities } from '../scene/load-vehicle';
import type { VehicleStore } from '../state/vehicle-state';
import type { ShellElements } from './render-shell';

const HOTSPOTS = {
  hero: {
    view: 'aero', label: '空气动力学', position: 'front',
    detail: '前翼与流线车身协同梳理气流，稳定高速姿态。',
  },
  aero: {
    view: 'aero', label: '空气动力学', position: 'front',
    detail: '前翼与流线车身协同梳理气流，稳定高速姿态。',
  },
  performance: {
    view: 'performance', label: '电驱与底盘', position: 'wheel',
    detail: '轮组与低重心底盘传递电驱响应，强化弯道支撑。',
  },
  cabin: {
    view: 'cabin', label: '智能座舱', position: 'cabin',
    detail: '座舱交互空间围绕驾乘者组织屏幕、方向盘与座席。',
  },
  sensing: {
    view: 'sensing', label: '智能驾驶感知', position: 'roof',
    detail: '车顶与环车感知融合环境信息，辅助车辆理解道路。',
  },
} as const;

export function applyVehicleCapabilities(elements: ShellElements, capabilities: VehicleCapabilities): void {
  elements.colorButtons.forEach((button) => {
    button.disabled = button.dataset.paint ? !capabilities.bodyColor : !capabilities.interiorColor;
  });
  elements.doorButton.disabled = !capabilities.doors.frontLeft && !capabilities.doors.frontRight;
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

  const hotspotMarker = elements.hotspotLabel.querySelector<HTMLButtonElement>('.hotspot-marker');
  const hotspotDetail = elements.hotspotLabel.querySelector<HTMLElement>('.hotspot-detail');
  const hotspotTitle = hotspotDetail?.querySelector<HTMLElement>('b');
  const hotspotCopy = hotspotDetail?.querySelector<HTMLElement>('p');
  if (!hotspotMarker || !hotspotDetail || !hotspotTitle || !hotspotCopy) {
    throw new Error('Story hotspot failed to render');
  }
  listen(hotspotMarker, () => {
    const expanded = hotspotMarker.getAttribute('aria-expanded') === 'true';
    hotspotMarker.setAttribute('aria-expanded', String(!expanded));
    hotspotDetail.hidden = expanded;
  });
  let activeHotspot = '';

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
    const hotspot = HOTSPOTS[state.hotspot as keyof typeof HOTSPOTS] ?? HOTSPOTS.hero;
    if (activeHotspot !== hotspot.view) {
      activeHotspot = hotspot.view;
      elements.hotspotLabel.dataset.hotspotView = hotspot.view;
      elements.hotspotLabel.dataset.hotspotPosition = hotspot.position;
      hotspotMarker.setAttribute('aria-label', `查看${hotspot.label}部件说明`);
      hotspotMarker.setAttribute('aria-expanded', 'false');
      hotspotMarker.querySelector('strong')!.textContent = hotspot.label;
      hotspotTitle.textContent = hotspot.label;
      hotspotCopy.textContent = hotspot.detail;
      hotspotDetail.hidden = true;
    }
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
