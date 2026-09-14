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

    expect(document.querySelector('#film')).toBeNull();
    expect([...document.querySelectorAll('nav a')].map((node) => node.textContent?.trim()))
      .toEqual(['SU7', '细节', '科技']);
    expect(elements.storySections).toHaveLength(3);
    expect(document.querySelector('[role="region"][aria-label="小米 SU7 交互车辆舞台"]')).not.toBeNull();
    expect(elements.modeButtons.map((button) => button.textContent)).toEqual(['外观', '座舱']);
    expect(document.querySelectorAll('[data-control-group]')).toHaveLength(5);
    expect(Array.from(document.querySelectorAll<HTMLElement>('[data-control-group]'), (group) => group.dataset.controlGroup))
      .toEqual(['mode', 'paint', 'interior', 'seat', 'doors']);
    const paintButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-paint]')];
    expect(paintButtons).toHaveLength(9);
    for (const button of paintButtons) {
      expect(button.getAttribute('aria-label')).toMatch(/.+/);
      expect(button.getAttribute('data-tooltip')).toBe(button.getAttribute('aria-label'));
      expect(button.textContent?.trim()).toBe('');
    }
    expect(elements.colorButtons).toHaveLength(13);
    expect(elements.colorButtons.every((button) => button.hasAttribute('aria-pressed'))).toBe(true);
    expect(document.querySelector('[data-view-hint]')?.textContent).toContain('拖拽车辆查看外观细节');
    expect(document.querySelector('[data-view-hint]')?.textContent)
      .toContain('滚动页面切换细节，右侧会跟随叙事自动调整视角');
    expect(elements.doorButton.textContent).toContain('开门');
    expect(elements.canvas.getAttribute('aria-label')).toBe('小米 SU7 三维车辆');
    expect(document.querySelector('.hero-actions')?.textContent).toContain('进入座舱');
    expect(document.querySelector('.brand')).toBeNull();
    expect(document.querySelector('.header-cta')).toBeNull();
    expect(document.querySelectorAll('.story-hotspot')).toHaveLength(0);
    expect(document.querySelector('.story-detail')).toBeNull();
    expect(document.querySelector('.mobile-story-rail')).toBeNull();
    expect(document.querySelectorAll('.story-section')).toHaveLength(3);
    expect(document.querySelectorAll('.site-nav a')).toHaveLength(3);
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
    ]);
    expect(document.querySelectorAll('.technology-card')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('.technology-card h3'), (node) => node.textContent)).toContain('智能驾驶感知');
    expect(document.querySelector('.brand-film img')).toBeNull();
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

  it('stops click, keydown and store-driven DOM synchronization after unbind', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const setMode = vi.spyOn(store.actions, 'setMode');
    const unbind = bindControls(elements, store);
    const initialCabinPressed = elements.modeButtons[1].getAttribute('aria-pressed');

    unbind();
    elements.modeButtons[1].click();
    elements.modeButtons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(setMode).not.toHaveBeenCalled();
    expect(store.getState().mode).toBe('exterior');

    store.actions.setMode('cabin');
    store.actions.setActiveStory('performance');
    expect(elements.modeButtons[1].getAttribute('aria-pressed')).toBe(initialCabinPressed);
    expect(document.documentElement.dataset.vehicleMode).toBeUndefined();
    expect(elements.stage.dataset.mode).toBeUndefined();
  });

  it('keeps one sticky vehicle visual alongside every story section and ends before technology', () => {
    const elements = renderShell(document.body);
    const experience = document.querySelector('.driving-experience');
    const visual = experience?.querySelector(':scope > .vehicle-visual');
    const story = experience?.querySelector(':scope > .story-sequence');
    const technology = document.querySelector('.technology-section');

    expect(visual?.contains(elements.canvas)).toBe(true);
    expect(story?.querySelectorAll('[data-story-view]')).toHaveLength(3);
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

  it('synchronizes relevant control groups and guidance with the real store mode', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);
    const paintGroup = document.querySelector<HTMLElement>('[data-control-group="paint"]')!;
    const interiorGroup = document.querySelector<HTMLElement>('[data-control-group="interior"]')!;
    const seatGroup = document.querySelector<HTMLElement>('[data-control-group="seat"]')!;
    const hint = document.querySelector<HTMLElement>('[data-view-hint]')!;

    expect(paintGroup.hidden).toBe(false);
    expect(paintGroup.getAttribute('aria-hidden')).toBe('false');
    for (const group of [interiorGroup, seatGroup]) {
      expect(group.hidden).toBe(true);
      expect(group.getAttribute('aria-hidden')).toBe('true');
    }
    expect(hint.textContent).toContain('拖拽车辆查看外观细节');
    expect(elements.modeButtons.every((button) => button.querySelector('svg[aria-hidden="true"]'))).toBe(true);
    expect(elements.doorButton.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    elements.modeButtons[1].click();
    expect(store.getState().mode).toBe('cabin');
    expect(paintGroup.hidden).toBe(true);
    expect(paintGroup.getAttribute('aria-hidden')).toBe('true');
    for (const group of [interiorGroup, seatGroup]) {
      expect(group.hidden).toBe(false);
      expect(group.getAttribute('aria-hidden')).toBe('false');
    }
    expect(hint.textContent).toContain('拖拽视角查看座舱细节');
    expect(elements.seatButtons.every((button) => !button.disabled && button.tabIndex === 0)).toBe(true);

    elements.modeButtons[0].click();
    expect(elements.seatButtons.every((button) => button.disabled && button.tabIndex === -1)).toBe(true);
    unbind();
  });

  it('renders each semantic group as its own glass module with aligned fallbacks and motion reduction', () => {
    const outerRule = styles.match(/\.vehicle-controls\s*\{([^}]*)\}/)?.[1] ?? '';
    const groupRule = styles.match(/\.vehicle-controls\s*>\s*\[data-control-group\]\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(outerRule).not.toMatch(/(?:background|backdrop-filter|box-shadow|border):/);
    expect(groupRule).toContain('background:');
    expect(groupRule).toContain('border:');
    expect(groupRule).toContain('backdrop-filter:');
    expect(groupRule).toContain('-webkit-backdrop-filter:');
    expect(styles).toContain('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))');
    expect(styles).toMatch(/@supports not[\s\S]*?\.vehicle-controls > \[data-control-group\][^{]*\{[^}]*background:/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.vehicle-controls > \[data-control-group\][^{]*\{[^}]*transition:\s*none !important/);
    expect(styles).toMatch(/\.reduced-motion \.vehicle-controls > \[data-control-group\][^{]*\{[^}]*transition:\s*none !important/);
  });

  it('exposes a real tooltip when a swatch receives keyboard focus', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);
    const swatch = elements.colorButtons[0];
    const tooltip = document.querySelector<HTMLElement>('[data-control-tooltip]')!;

    expect(tooltip.hidden).toBe(true);
    swatch.focus();
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.dataset.visible).toBe('true');
    expect(tooltip.textContent).toBe(swatch.getAttribute('data-tooltip'));
    swatch.blur();
    expect(tooltip.hidden).toBe(true);
    expect(tooltip.dataset.visible).toBeUndefined();
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
