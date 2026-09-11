import { expect, test, type Locator, type Page } from '@playwright/test';

interface Su7Diagnostics {
  modelReady: boolean;
  paint: string | null;
  doorAngles: { left: number | null; right: number | null };
  camera: { view: string; target: number[]; position: number[] } | null;
  vehicleYaw: number | null;
  hotspot: string;
}

const readDiagnostics = (page: Page) => page.evaluate(() => {
  const reader = (window as typeof window & {
    __SU7_E2E_READ_DIAGNOSTICS__?: () => Su7Diagnostics;
  }).__SU7_E2E_READ_DIAGNOSTICS__;
  if (!reader) throw new Error('SU7 read-only E2E diagnostics are unavailable');
  return reader();
});

async function expectFullyInViewport(locator: Locator, viewport: { width: number; height: number }) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

function overlaps(a: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>, b: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

test('用户操作会改变真实车辆、车门、相机与滚动叙事状态', async ({ page }) => {
  test.setTimeout(90_000);
  const blockingConsoleErrors: string[] = [];
  const failedResources: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') blockingConsoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto('/xiaomi-su7-interactive/');
  expect(response?.status()).toBe(200);
  await expect.poll(async () => (await readDiagnostics(page)).modelReady).toBe(true);

  const gulfBlue = page.getByRole('button', { name: '海湾蓝' });
  await gulfBlue.click();
  await expect.poll(async () => (await readDiagnostics(page)).paint).toBe('19b7ff');

  const closedDoorAngles = (await readDiagnostics(page)).doorAngles;
  await page.getByRole('button', { name: '开门' }).click();
  await expect.poll(async () => {
    const angles = (await readDiagnostics(page)).doorAngles;
    return {
      leftOpened: angles.left !== null && angles.left < (closedDoorAngles.left ?? 0) - 0.4,
      rightOpened: angles.right !== null && angles.right > (closedDoorAngles.right ?? 0) + 0.4,
    };
  }).toEqual({ leftOpened: true, rightOpened: true });

  await page.getByRole('tab', { name: '座舱' }).click();
  const cameraTargets = new Set<string>();
  for (const [seat, expectedView] of [['主驾', 'driver'], ['副驾', 'passenger'], ['后排', 'rear']] as const) {
    await page.getByRole('button', { name: seat }).click();
    await expect.poll(async () => (await readDiagnostics(page)).camera?.view).toBe(expectedView);
    const target = (await readDiagnostics(page)).camera?.target;
    expect(target).toBeDefined();
    cameraTargets.add(JSON.stringify(target));
  }
  expect(cameraTargets.size).toBe(3);

  await page.getByRole('tab', { name: '外观' }).click();
  const canvas = page.locator('canvas.vehicle-canvas');
  const yawBefore = (await readDiagnostics(page)).vehicleYaw;
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, clientX: 700 });
  await canvas.dispatchEvent('pointermove', { pointerId: 1, clientX: 560 });
  await canvas.dispatchEvent('pointerup', { pointerId: 1, clientX: 560 });
  await expect.poll(async () => (await readDiagnostics(page)).vehicleYaw).not.toBe(yawBefore);

  for (const view of ['aero', 'performance', 'cabin', 'sensing']) {
    await page.evaluate((targetView) => {
      document.documentElement.style.scrollBehavior = 'auto';
      const section = document.querySelector<HTMLElement>(`[data-story-view="${targetView}"]`);
      if (!section) throw new Error(`Missing story section: ${targetView}`);
      window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top + window.innerHeight / 2);
    }, view);
    await expect.poll(async () => {
      const state = await readDiagnostics(page);
      return { hotspot: state.hotspot, cameraView: state.camera?.view };
    }).toEqual({ hotspot: view, cameraView: view });
  }

  await page.getByRole('link', { name: '返回车辆舞台' }).click();
  await expect(page.locator('#vehicle-stage')).toBeInViewport();
  expect(failedResources).toEqual([]);
  expect(blockingConsoleErrors).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`首屏在 ${viewport.width}x${viewport.height} 的关键几何完整`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/xiaomi-su7-interactive/');
    await expect.poll(async () => (await readDiagnostics(page)).modelReady).toBe(true);

    const heading = page.getByRole('heading', { level: 1, name: /Xiaomi\s*SU7/ });
    const cta = page.getByRole('link', { name: '探索核心科技' });
    const specs = page.locator('.hero-specs');
    const controls = page.locator('.vehicle-controls');
    for (const element of [heading, cta, specs, controls]) {
      await expectFullyInViewport(element, viewport);
    }

    if (viewport.width === 390) {
      const ctaBox = await cta.boundingBox();
      const canvasBox = await page.locator('canvas.vehicle-canvas').boundingBox();
      const specsBox = await specs.boundingBox();
      const controlsBox = await controls.boundingBox();
      expect(ctaBox && canvasBox && specsBox && controlsBox).toBeTruthy();
      if (ctaBox && canvasBox && specsBox && controlsBox) {
        const visibleVehicle = {
          x: Math.max(0, canvasBox.x),
          y: Math.max(0, canvasBox.y),
          width: Math.min(viewport.width, canvasBox.x + canvasBox.width) - Math.max(0, canvasBox.x),
          height: Math.min(viewport.height, canvasBox.y + canvasBox.height) - Math.max(0, canvasBox.y),
        };
        expect(overlaps(ctaBox, visibleVehicle), JSON.stringify({ ctaBox, visibleVehicle })).toBe(false);
        expect(specsBox.y + specsBox.height).toBeLessThanOrEqual(controlsBox.y);
      }
    }
  });
}
