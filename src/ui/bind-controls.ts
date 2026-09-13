import { STORY_CHAPTERS } from '../content/story-chapters';
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

  const storyTitle = elements.storyDetail.querySelector<HTMLElement>('h2');
  const storyEyebrow = elements.storyDetail.querySelector<HTMLElement>(':scope > p:first-child');
  const storyDescription = elements.storyDetail.querySelector<HTMLElement>('[data-story-description]');
  if (!storyTitle || !storyEyebrow || !storyDescription) throw new Error('Story detail failed to render');

  const selectStory = (id: string | undefined) => {
    const chapter = STORY_CHAPTERS.find((candidate) => candidate.id === id);
    if (!chapter) return;
    store.actions.setActiveStory(chapter.id);
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    elements.storySections
      .find((section) => section.dataset.storySection === chapter.id)
      ?.scrollIntoView({ behavior });
  };
  const storyControls = [
    ...elements.storyHotspots.map((hotspot) => hotspot.querySelector<HTMLButtonElement>('button')),
    ...elements.mobileStoryButtons,
  ];
  storyControls.forEach((button) => {
    if (!button) throw new Error('Story control failed to render');
    listen(button, () => selectStory(button.dataset.storyId));
  });

  const cabinTitle = elements.cabinDetail.querySelector<HTMLElement>('h2');
  const cabinDescription = elements.cabinDetail.querySelector<HTMLElement>('[data-cabin-description]');
  const cabinTags = elements.cabinDetail.querySelector<HTMLUListElement>('ul');
  if (!cabinTitle || !cabinDescription || !cabinTags) throw new Error('Cabin detail failed to render');

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
    const chapter = STORY_CHAPTERS.find(({ id }) => id === state.activeStoryId)!;
    elements.storyHotspots.forEach((hotspot) => {
      const button = hotspot.querySelector<HTMLButtonElement>('.hotspot-marker');
      if (!button) throw new Error('Story control failed to render');
      button.setAttribute('aria-current', String(button.dataset.storyId === chapter.id));
    });
    elements.mobileStoryButtons.forEach((button) => {
      button.setAttribute('aria-current', String(button.dataset.storyId === chapter.id));
    });
    storyEyebrow.textContent = chapter.eyebrow;
    storyTitle.textContent = chapter.title;
    storyDescription.textContent = chapter.description;
    document.documentElement.dataset.vehicleMode = state.mode;
    elements.stage.dataset.mode = state.mode;
  };

  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    cleanups.forEach((cleanup) => cleanup());
    delete document.documentElement.dataset.vehicleMode;
    delete elements.stage.dataset.mode;
  };
}
