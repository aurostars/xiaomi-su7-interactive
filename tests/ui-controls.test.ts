import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyVehicleCapabilities, bindControls } from '../src/ui/bind-controls';
import { renderShell } from '../src/ui/render-shell';
import { createVehicleStore } from '../src/state/vehicle-state';

const styles = readFileSync('src/styles.css', 'utf8');

function mobileStyle(element: Element, property: string): string {
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);
  const sheet = style.sheet;
  if (!sheet) throw new Error('Stylesheet failed to load');
  let value = '';
  Array.from(sheet.cssRules).forEach((rule) => {
    const mediaRule = rule as CSSMediaRule;
    if (!mediaRule.media?.mediaText.includes('max-width: 767px')) return;
    Array.from(mediaRule.cssRules).forEach((nestedRule) => {
      const styleRule = nestedRule as CSSStyleRule;
      if (!styleRule.selectorText) return;
      const matches = styleRule.selectorText.split(',').some((selector) => element.matches(selector.trim()));
      if (matches && styleRule.style.getPropertyValue(property)) value = styleRule.style.getPropertyValue(property);
    });
  });
  style.remove();
  return value;
}

describe('high fidelity page shell', () => {
  afterEach(() => {
    document.body.replaceChildren();
    delete document.documentElement.dataset.vehicleMode;
    vi.unstubAllGlobals();
  });

  it('exposes the vehicle stage and all primary controls with accessible names', () => {
    const elements = renderShell(document.body);

    expect(document.querySelector('[role="region"][aria-label="小米 SU7 交互车辆舞台"]')).not.toBeNull();
    expect(elements.modeButtons.map((button) => button.textContent)).toEqual(['外观', '座舱']);
    expect(elements.colorButtons).toHaveLength(13);
    expect(elements.colorButtons.map((button) => button.textContent)).toEqual([
      '海湾蓝', '雅灰', '橄榄绿', '珍珠白', '钻石黑', '流星蓝', '霞光紫', '熔岩橙', '寒武岩灰',
      '银河灰', '曜石黑', '暮光红', '迷雾紫',
    ]);
    expect(elements.colorButtons.every((button) => button.getAttribute('aria-label') === button.textContent)).toBe(true);
    expect(elements.colorButtons.every((button) => button.hasAttribute('aria-pressed'))).toBe(true);
    expect(elements.doorButton.textContent).toContain('开门');
    expect(elements.canvas.getAttribute('aria-label')).toBe('小米 SU7 三维车辆');
    expect(document.querySelector('.hero-actions')?.textContent).toContain('进入座舱');
    expect(elements.hotspotLabel.querySelector('.hotspot-marker')?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows an accessible cabin detail card and keeps it synced while doors close and seats change', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);

    expect(elements.cabinDetail.getAttribute('aria-live')).toBe('polite');
    expect(elements.cabinDetail.querySelector('ul')?.getAttribute('aria-label')).toBe('当前座舱细节');
    expect(elements.cabinDetail.hidden).toBe(true);
    expect(elements.stage.dataset.mode).toBe('exterior');

    elements.enterCabinButton.click();
    expect(store.getState().mode).toBe('cabin');
    expect(elements.stage.dataset.mode).toBe('cabin');
    expect(elements.cabinDetail.hidden).toBe(false);
    const expectedSeats = {
      driver: ['主驾沉浸视野', '方向盘、前挡视野与中控信息围绕驾驶者展开。', ['主驾位置', '方向盘', '前挡视野']],
      passenger: ['副驾交互空间', '从副驾横向观察中控屏、中央通道与驾驶区域。', ['副驾位置', '侧窗', '中控屏']],
      rear: ['后排空间关系', '从后排中央观察前排座椅、中控与中央扶手。', ['后排中央', '前排座椅', '中央扶手']],
    } as const;
    for (const [seat, [title, description, tags]] of Object.entries(expectedSeats)) {
      elements.seatButtons.find((button) => button.dataset.seat === seat)?.click();
      expect(elements.cabinDetail.querySelector('h2')?.textContent).toBe(title);
      expect(elements.cabinDetail.querySelector('[data-cabin-description]')?.textContent).toBe(description);
      expect(Array.from(elements.cabinDetail.querySelectorAll('li'), (item) => item.textContent)).toEqual(tags);
    }
    expect(elements.doorButton.textContent).toBe('关门');

    elements.doorButton.click();
    expect(store.getState()).toMatchObject({ mode: 'cabin', doorsOpen: false });
    expect(elements.doorButton.textContent).toBe('开门');
    expect(elements.hotspotLabel.classList.contains('cabin-detail')).toBe(false);

    elements.modeButtons.find((button) => button.dataset.mode === 'exterior')?.click();
    expect(elements.stage.dataset.mode).toBe('exterior');

    unbind();
    expect(document.documentElement.dataset.vehicleMode).toBeUndefined();
    expect(elements.stage.dataset.mode).toBeUndefined();
  });

  it('enables the unified door control for any single available door capability', () => {
    const elements = renderShell(document.body);
    const doors = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;

    doors.forEach((availableDoor) => {
      applyVehicleCapabilities(elements, {
        bodyColor: true,
        interiorColor: true,
        screenGlow: true,
        doors: Object.fromEntries(doors.map((door) => [door, door === availableDoor])) as Record<typeof doors[number], boolean>,
      });
      expect(elements.doorButton.disabled, availableDoor).toBe(false);
    });
  });

  it('renders the complete story, technology imagery and return link', () => {
    renderShell(document.body);

    const headings = Array.from(document.querySelectorAll('[data-story-view] h2'), (node) => node.textContent);
    expect(headings).toEqual([
      '低趴轿跑姿态，像风压过车身',
      '电驱、轮组与底盘共同制造力量感',
      '切入座舱，看见屏幕与乘坐空间',
      '传感器视角，展示智能驾驶想象力',
    ]);
    expect(document.querySelectorAll('.technology-card')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.technology-card h3'), (node) => node.textContent)).toContain('智能驾驶感知');
    expect(document.querySelector('.brand-film img')).not.toBeNull();
    const returnLink = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="#vehicle-stage"]'))
      .find((link) => link.textContent?.includes('返回车辆舞台'));
    expect(returnLink).toBeDefined();
  });

  it('binds mode, color and door controls to store behavior', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);
    applyVehicleCapabilities(elements, {
      bodyColor: true,
      interiorColor: true,
      screenGlow: true,
      doors: {
        frontLeft: true,
        frontRight: false,
        rearLeft: false,
        rearRight: false,
      },
    });

    elements.modeButtons[1].click();
    expect(store.getState().mode).toBe('cabin');

    elements.modeButtons[0].click();
    elements.colorButtons.find((button) => button.dataset.paint === 'gulf-blue')?.click();
    expect(store.getState().paint).toBe('gulf-blue');

    elements.doorButton.click();
    expect(store.getState()).toMatchObject({ doorsOpen: false, mode: 'exterior' });
    expect(elements.doorButton.getAttribute('aria-pressed')).toBe('false');

    unbind();
  });

  it('disables interactions that the loaded model cannot provide', () => {
    const elements = renderShell(document.body);

    applyVehicleCapabilities(elements, {
      bodyColor: true,
      interiorColor: false,
      screenGlow: false,
      doors: {
        frontLeft: false,
        frontRight: false,
        rearLeft: false,
        rearRight: false,
      },
    });

    expect(elements.colorButtons.filter((button) => button.dataset.paint).every((button) => !button.disabled)).toBe(true);
    expect(elements.colorButtons.filter((button) => button.dataset.interior).every((button) => button.disabled)).toBe(true);
    expect(elements.doorButton.disabled).toBe(true);
  });

  it('enables the door control when only rear doors are available', () => {
    const elements = renderShell(document.body);

    applyVehicleCapabilities(elements, {
      bodyColor: true,
      interiorColor: true,
      screenGlow: true,
      doors: {
        frontLeft: false,
        frontRight: false,
        rearLeft: true,
        rearRight: true,
      },
    });

    expect(elements.doorButton.disabled).toBe(false);
  });

  it('renders persistent story hotspots, mobile rail and detail from the initial story', () => {
    const elements = renderShell(document.body);

    expect(elements.storyHotspots).toHaveLength(4);
    expect(elements.mobileStoryButtons).toHaveLength(4);
    expect(elements.storyDetail.hidden).toBe(false);
    expect(elements.storyDetail.textContent).toContain('低趴轿跑姿态');
    expect(elements.storyHotspots[0].hasAttribute('aria-current')).toBe(false);
    expect(elements.storyHotspots[0].querySelector('.hotspot-marker')?.getAttribute('aria-current')).toBe('true');
    expect(elements.mobileStoryButtons[0].getAttribute('aria-current')).toBe('true');
  });

  it('uses the story store as the single source for desktop and mobile story controls', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const setActiveStory = vi.spyOn(store.actions, 'setActiveStory');
    const performanceScroll = vi.fn();
    const cabinScroll = vi.fn();
    elements.storySections.find(({ dataset }) => dataset.storySection === 'performance')!.scrollIntoView = performanceScroll;
    elements.storySections.find(({ dataset }) => dataset.storySection === 'cabin')!.scrollIntoView = cabinScroll;
    const unbind = bindControls(elements, store);

    elements.storyHotspots[1].querySelector<HTMLButtonElement>('button')!.click();
    expect(setActiveStory).toHaveBeenCalledWith('performance');
    expect(performanceScroll).toHaveBeenCalledWith({ behavior: 'smooth' });

    elements.mobileStoryButtons[2].click();
    expect(store.getState().activeStoryId).toBe('cabin');
    expect(setActiveStory).toHaveBeenLastCalledWith('cabin');
    expect(cabinScroll).toHaveBeenCalledWith({ behavior: 'smooth' });
    const desktopStoryButtons = elements.storyHotspots.map((hotspot) => hotspot.querySelector<HTMLButtonElement>('.hotspot-marker')!);
    expect(desktopStoryButtons.filter((button) => button.getAttribute('aria-current') === 'true')).toHaveLength(1);
    expect(elements.mobileStoryButtons.filter((button) => button.getAttribute('aria-current') === 'true')).toHaveLength(1);
    expect(desktopStoryButtons[2].getAttribute('aria-current')).toBe('true');
    expect(elements.storyHotspots.every((hotspot) => !hotspot.hasAttribute('aria-current'))).toBe(true);
    expect(elements.mobileStoryButtons[2].getAttribute('aria-current')).toBe('true');
    expect(elements.storyDetail.hidden).toBe(false);
    expect(elements.storyDetail.textContent).toContain('切入座舱');

    elements.enterCabinButton.click();
    expect(elements.storyDetail.hidden).toBe(false);

    unbind();
  });

  it('scrolls story hotspot targets without animation for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const performanceScroll = vi.fn();
    elements.storySections.find(({ dataset }) => dataset.storySection === 'performance')!.scrollIntoView = performanceScroll;
    const unbind = bindControls(elements, store);

    elements.storyHotspots[1].querySelector<HTMLButtonElement>('.hotspot-marker')!.click();

    expect(performanceScroll).toHaveBeenCalledWith({ behavior: 'auto' });
    unbind();
  });

  it('stops click, keydown and store-driven DOM synchronization after unbind', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const setMode = vi.spyOn(store.actions, 'setMode');
    const unbind = bindControls(elements, store);
    const initialCabinPressed = elements.modeButtons[1].getAttribute('aria-pressed');
    const initialStoryCurrent = elements.storyHotspots[0]
      .querySelector<HTMLButtonElement>('.hotspot-marker')!.getAttribute('aria-current');

    unbind();
    elements.modeButtons[1].click();
    elements.modeButtons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(setMode).not.toHaveBeenCalled();
    expect(store.getState().mode).toBe('exterior');

    store.actions.setMode('cabin');
    store.actions.setActiveStory('performance');
    expect(elements.modeButtons[1].getAttribute('aria-pressed')).toBe(initialCabinPressed);
    expect(elements.storyHotspots[0].querySelector('.hotspot-marker')?.getAttribute('aria-current')).toBe(initialStoryCurrent);
    expect(elements.storyHotspots[1].querySelector('.hotspot-marker')?.getAttribute('aria-current')).toBe('false');
    expect(document.documentElement.dataset.vehicleMode).toBeUndefined();
    expect(elements.stage.dataset.mode).toBeUndefined();
  });

  it('ignores an unknown story control id without dispatching or throwing', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const setActiveStory = vi.spyOn(store.actions, 'setActiveStory');
    elements.mobileStoryButtons[0].dataset.storyId = 'unknown-story';
    const unbind = bindControls(elements, store);

    expect(() => elements.mobileStoryButtons[0].click()).not.toThrow();
    expect(setActiveStory).not.toHaveBeenCalled();
    expect(store.getState().activeStoryId).toBe('aero');

    unbind();
  });

  it('keeps one sticky vehicle visual alongside every story section and ends before technology', () => {
    const elements = renderShell(document.body);
    const experience = document.querySelector('.driving-experience');
    const visual = experience?.querySelector(':scope > .vehicle-visual');
    const story = experience?.querySelector(':scope > .story-sequence');
    const technology = document.querySelector('.technology-section');

    expect(visual?.contains(elements.canvas)).toBe(true);
    expect(story?.querySelectorAll('[data-story-view]')).toHaveLength(4);
    expect(experience?.contains(technology)).toBe(false);
  });

  it('supports keyboard navigation in an aria-pressed mode button group', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);
    const [exterior, cabin] = elements.modeButtons;
    const modeGroup = document.querySelector('.mode-tabs');

    expect(modeGroup?.getAttribute('role')).toBe('group');
    expect(elements.modeButtons.every((button) => button.getAttribute('role') !== 'tab')).toBe(true);
    expect(elements.modeButtons.every((button) => !button.hasAttribute('aria-selected'))).toBe(true);
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(0);

    exterior.focus();
    exterior.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cabin);
    expect(store.getState().mode).toBe('cabin');
    expect(cabin.getAttribute('aria-pressed')).toBe('true');

    cabin.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(exterior);
    exterior.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(cabin);
    cabin.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(exterior);

    unbind();
  });

  it('keeps both desktop palettes visible and exposes icon control state accessibly', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);
    const palettes = Array.from(document.querySelectorAll<HTMLFieldSetElement>('.control-palette'));

    expect(palettes.map((palette) => palette.dataset.palette)).toEqual(['paint', 'interior']);
    expect(palettes.every((palette) => !palette.hidden)).toBe(true);
    expect(elements.modeButtons.every((button) => button.querySelector('svg[aria-hidden="true"]'))).toBe(true);
    expect(elements.doorButton.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(elements.modeButtons.every((button) => button.hasAttribute('aria-pressed'))).toBe(true);
    expect(elements.doorButton.hasAttribute('aria-pressed')).toBe(true);

    elements.modeButtons[1].click();
    expect(palettes.every((palette) => !palette.hidden)).toBe(true);
    expect(elements.seatButtons.every((button) => !button.disabled && button.tabIndex === 0)).toBe(true);

    elements.modeButtons[0].click();
    expect(elements.seatButtons.every((button) => button.disabled && button.tabIndex === -1)).toBe(true);
    unbind();
  });

  it('collapses the inactive palette at a narrow viewport and keeps every primary button at least 44px', () => {
    const elements = renderShell(document.body);
    const primaryButtons = [...elements.modeButtons, ...elements.seatButtons, elements.doorButton];

    expect(primaryButtons).toHaveLength(6);
    expect(primaryButtons.every((button) => button.hasAttribute('data-primary-control'))).toBe(true);
    primaryButtons.forEach((button) => {
      expect(Number.parseFloat(mobileStyle(button, 'min-height')), button.outerHTML).toBeGreaterThanOrEqual(44);
    });

    const paintPalette = document.querySelector<HTMLElement>('[data-palette="paint"]')!;
    const interiorPalette = document.querySelector<HTMLElement>('[data-palette="interior"]')!;
    document.documentElement.dataset.vehicleMode = 'exterior';
    expect(mobileStyle(paintPalette, 'display')).not.toBe('none');
    expect(mobileStyle(interiorPalette, 'display')).toBe('none');
    document.documentElement.dataset.vehicleMode = 'cabin';
    expect(mobileStyle(paintPalette, 'display')).toBe('none');
    expect(mobileStyle(interiorPalette, 'display')).not.toBe('none');

    document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      expect(Number(image.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(image.getAttribute('height'))).toBeGreaterThan(0);
    });
  });
});
