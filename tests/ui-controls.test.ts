import { afterEach, describe, expect, it } from 'vitest';
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

    elements.modeButtons[1].click();
    expect(store.getState().mode).toBe('cabin');

    elements.modeButtons[0].click();
    elements.colorButtons.find((button) => button.dataset.paint === 'gulf-blue')?.click();
    expect(store.getState().paint).toBe('gulf-blue');

    elements.doorButton.click();
    expect(store.getState()).toMatchObject({ doorsOpen: true, mode: 'exterior' });
    expect(elements.doorButton.getAttribute('aria-pressed')).toBe('true');

    unbind();
  });

  it('disables interactions that the loaded model cannot provide', () => {
    const elements = renderShell(document.body);

    applyVehicleCapabilities(elements, {
      bodyColor: true,
      interiorColor: false,
      leftDoor: false,
      rightDoor: false,
    });

    expect(elements.colorButtons.filter((button) => button.dataset.paint).every((button) => !button.disabled)).toBe(true);
    expect(elements.colorButtons.filter((button) => button.dataset.interior).every((button) => button.disabled)).toBe(true);
    expect(elements.doorButton.disabled).toBe(true);
  });

  it('updates a positioned, expandable hotspot for all four story chapters', () => {
    const elements = renderShell(document.body);
    const store = createVehicleStore();
    const unbind = bindControls(elements, store);
    const marker = elements.hotspotLabel.querySelector<HTMLButtonElement>('.hotspot-marker')!;
    const detail = elements.hotspotLabel.querySelector<HTMLElement>('.hotspot-detail')!;
    const expected = {
      aero: ['空气动力学', '前翼与流线车身', 'front'],
      performance: ['电驱与底盘', '轮组与低重心底盘', 'wheel'],
      cabin: ['智能座舱', '座舱交互空间', 'cabin'],
      sensing: ['智能驾驶感知', '车顶与环车感知', 'roof'],
    } as const;

    for (const [view, [label, description, position]] of Object.entries(expected)) {
      store.actions.setHotspot(view);
      expect(elements.hotspotLabel.dataset.hotspotView).toBe(view);
      expect(elements.hotspotLabel.dataset.hotspotPosition).toBe(position);
      expect(marker.getAttribute('aria-label')).toBe(`查看${label}部件说明`);
      expect(marker.textContent).toContain(label);
      expect(detail.hidden).toBe(true);

      marker.click();
      expect(marker.getAttribute('aria-expanded')).toBe('true');
      expect(detail.hidden).toBe(false);
      expect(detail.textContent).toContain(description);
      marker.click();
    }

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
