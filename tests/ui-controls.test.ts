import { afterEach, describe, expect, it } from 'vitest';
import { bindControls } from '../src/ui/bind-controls';
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
});
