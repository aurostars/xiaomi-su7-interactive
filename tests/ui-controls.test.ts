import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyVehicleCapabilities, bindControls } from '../src/ui/bind-controls';
import { renderShell } from '../src/ui/render-shell';
import { createVehicleStore } from '../src/state/vehicle-state';

describe('high fidelity page shell', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('exposes the vehicle stage and all primary controls with accessible names', () => {
    const elements = renderShell(document.body);

    expect(document.querySelector('[role="region"][aria-label="小米 SU7 交互车辆舞台"]')).not.toBeNull();
    expect(elements.modeButtons.map((button) => button.textContent)).toEqual(['外观', '座舱']);
    expect(elements.colorButtons).toHaveLength(10);
    expect(elements.doorButton.textContent).toContain('开门');
    expect(elements.canvas.getAttribute('aria-label')).toBe('小米 SU7 三维车辆');
    expect(document.querySelector('.hero-actions')?.textContent).toContain('进入座舱');
    expect(elements.hotspotLabel.getAttribute('aria-live')).toBe('polite');
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
    expect(elements.storyHotspots[0].getAttribute('aria-current')).toBe('true');
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
    expect(elements.storyHotspots.filter((hotspot) => hotspot.getAttribute('aria-current') === 'true')).toHaveLength(1);
    expect(elements.mobileStoryButtons.filter((button) => button.getAttribute('aria-current') === 'true')).toHaveLength(1);
    expect(elements.storyHotspots[2].getAttribute('aria-current')).toBe('true');
    expect(elements.mobileStoryButtons[2].getAttribute('aria-current')).toBe('true');
    expect(elements.storyDetail.hidden).toBe(false);
    expect(elements.storyDetail.textContent).toContain('切入座舱');

    elements.enterCabinButton.click();
    expect(elements.storyDetail.hidden).toBe(false);

    unbind();
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

  it('supports complete keyboard tab navigation and linked tab panels', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);
    const [exterior, cabin] = elements.modeButtons;

    expect(exterior.getAttribute('aria-controls')).toBe('exterior-controls');
    expect(cabin.getAttribute('aria-controls')).toBe('cabin-controls');
    expect(document.querySelector('#exterior-controls')?.getAttribute('role')).toBe('tabpanel');
    expect(document.querySelector('#cabin-controls')?.getAttribute('aria-labelledby')).toBe(cabin.id);

    exterior.focus();
    exterior.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cabin);
    expect(store.getState().mode).toBe('cabin');

    cabin.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(exterior);
    exterior.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(cabin);
    cabin.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(exterior);

    unbind();
  });

  it('groups core controls in a horizontally scrollable mobile rail and reserves image geometry', () => {
    renderShell(document.body);

    const rail = document.querySelector('[data-mobile-control-rail]');
    expect(rail?.querySelectorAll('button').length).toBeGreaterThanOrEqual(16);
    document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      expect(Number(image.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(image.getAttribute('height'))).toBeGreaterThan(0);
    });
  });
});
