import { getInteriorOption, getPaintOption } from '../content/vehicle-palettes';
import type { VehicleCapabilities } from '../scene/load-vehicle';
import type { VehicleStore } from '../state/vehicle-state';
import type { ShellElements } from './render-shell';

const CABIN_DETAILS = {
  driver: {
    title: '主驾沉浸视野',
    detail: '方向盘、前挡视野与中控信息围绕驾驶者展开。',
    tags: ['主驾位置', '方向盘', '前挡视野'],
  },
  passenger: {
    title: '副驾交互空间',
    detail: '从副驾横向观察中控屏、中央通道与驾驶区域。',
    tags: ['副驾位置', '侧窗', '中控屏'],
  },
  rear: {
    title: '后排空间关系',
    detail: '从后排中央观察前排座椅、中控与中央扶手。',
    tags: ['后排中央', '前排座椅', '中央扶手'],
  },
} as const;

export function applyVehicleCapabilities(elements: ShellElements, capabilities: VehicleCapabilities): void {
  elements.colorButtons.forEach((button) => {
    button.disabled = button.dataset.paint ? !capabilities.bodyColor : !capabilities.interiorColor;
  });
  elements.doorButton.disabled = !Object.values(capabilities.doors).some(Boolean);
}

export function bindControls(elements: ShellElements, store: VehicleStore): () => void {
  const cleanups: Array<() => void> = [];
  const listen = (element: HTMLElement, handler: () => void) => {
    element.addEventListener('click', handler);
    cleanups.push(() => element.removeEventListener('click', handler));
  };
  let keyboardModality = false;
  const ownerDocument = elements.stage.ownerDocument;
  const hideTooltip = () => {
    elements.controlTooltip.hidden = true;
    delete elements.controlTooltip.dataset.visible;
  };
  const onDocumentKeyDown = () => { keyboardModality = true; };
  const onDocumentPointerDown = () => {
    keyboardModality = false;
    hideTooltip();
  };
  ownerDocument.addEventListener('keydown', onDocumentKeyDown, true);
  ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true);
  cleanups.push(() => {
    ownerDocument.removeEventListener('keydown', onDocumentKeyDown, true);
    ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true);
  });

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
      if (button.dataset.paint) store.actions.setPaint(getPaintOption(button.dataset.paint).id);
      if (button.dataset.interior) store.actions.setInterior(getInteriorOption(button.dataset.interior).id);
    });
    const showTooltip = () => {
      if (!keyboardModality) return;
      elements.controlTooltip.textContent = button.dataset.tooltip ?? button.getAttribute('aria-label') ?? '';
      elements.controlTooltip.hidden = false;
      elements.controlTooltip.dataset.visible = 'true';
    };
    button.addEventListener('focus', showTooltip);
    button.addEventListener('blur', hideTooltip);
    cleanups.push(() => {
      button.removeEventListener('focus', showTooltip);
      button.removeEventListener('blur', hideTooltip);
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

  const cabinTitle = elements.cabinDetail.querySelector<HTMLElement>('h2');
  const cabinDescription = elements.cabinDetail.querySelector<HTMLElement>('[data-cabin-description]');
  const cabinTags = elements.cabinDetail.querySelector<HTMLUListElement>('ul');
  const hintPrimary = elements.viewHint.querySelector<HTMLElement>('[data-view-hint-primary]');
  const groups = new Map(elements.controlGroups.map((group) => [group.dataset.controlGroup, group]));
  const paintGroup = groups.get('paint');
  const interiorGroup = groups.get('interior');
  const seatGroup = groups.get('seat');
  if (!cabinTitle || !cabinDescription || !cabinTags || !hintPrimary || !paintGroup || !interiorGroup || !seatGroup) {
    throw new Error('Vehicle controls failed to render');
  }

  const setGroupVisible = (group: HTMLElement, visible: boolean) => {
    group.hidden = !visible;
    group.setAttribute('aria-hidden', String(!visible));
  };

  const sync = () => {
    const state = store.getState();
    elements.modeButtons.forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute('aria-pressed', String(selected));
    });
    elements.colorButtons.forEach((button) => {
      const selected = button.dataset.paint === state.paint || button.dataset.interior === state.interior;
      button.setAttribute('aria-pressed', String(selected));
    });
    elements.seatButtons.forEach((button) => {
      const enabled = state.mode === 'cabin';
      button.disabled = !enabled;
      button.tabIndex = enabled ? 0 : -1;
      button.setAttribute('aria-pressed', String(button.dataset.seat === state.seatView));
    });
    elements.doorButton.setAttribute('aria-pressed', String(state.doorsOpen));
    const cabinMode = state.mode === 'cabin';
    setGroupVisible(paintGroup, !cabinMode);
    setGroupVisible(interiorGroup, cabinMode);
    setGroupVisible(seatGroup, cabinMode);
    hintPrimary.textContent = cabinMode ? '拖拽视角查看座舱细节' : '拖拽车辆查看外观细节';
    const doorLabel = elements.doorButton.querySelector<HTMLElement>('span');
    if (!doorLabel) throw new Error('Door control failed to render');
    doorLabel.textContent = state.doorsOpen ? '关门' : '开门';
    const cabinDetail = CABIN_DETAILS[state.seatView];
    elements.cabinDetail.hidden = state.mode !== 'cabin';
    cabinTitle.textContent = cabinDetail.title;
    cabinDescription.textContent = cabinDetail.detail;
    cabinTags.replaceChildren(...cabinDetail.tags.map((tag) => {
      const item = cabinTags.ownerDocument.createElement('li');
      item.textContent = tag;
      return item;
    }));
    document.documentElement.dataset.vehicleMode = state.mode;
    elements.stage.dataset.mode = state.mode;
  };

  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    cleanups.forEach((cleanup) => cleanup());
    hideTooltip();
    delete document.documentElement.dataset.vehicleMode;
    delete elements.stage.dataset.mode;
  };
}
