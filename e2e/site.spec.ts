import { expect, test, type Locator, type Page } from '@playwright/test';

interface Su7Diagnostics {
  modelReady: boolean;
  paint: string | null;
  doorAngles: { left: number | null; right: number | null };
  camera: { view: string; target: number[]; position: number[]; fov: number } | null;
  vehicleYaw: number | null;
  materials: { body: number; interior: number };
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
  test.setTimeout(300_000);
  const blockingConsoleErrors: string[] = [];
  const failedResources: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') blockingConsoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedResources.push(`REQUEST_FAILED ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await page.goto('/xiaomi-su7-interactive/');
  expect(response?.status()).toBe(200);
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

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
  expect((await readDiagnostics(page)).materials).toEqual({ body: 1, interior: 4 });

  await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('[data-story-view="performance"]');
    if (!section) throw new Error('Missing performance story section');
    window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top + window.innerHeight / 2);
  });
  await expect.poll(async () => (await readDiagnostics(page)).hotspot).toBe('performance');
  await page.getByRole('tab', { name: '外观' }).click();
  await expect.poll(async () => (await readDiagnostics(page)).camera?.view, { timeout: 15_000 }).toBe('performance');
  const exteriorCamera = (await readDiagnostics(page)).camera;
  expect(exteriorCamera?.position[0]).toBeGreaterThan(2);
  await expect(page.locator('.story-hotspot')).toContainText('电驱与底盘');

  const moveWithinSection = async (progress: number) => {
    await page.evaluate((amount) => {
      const section = document.querySelector<HTMLElement>('[data-story-view="performance"]');
      if (!section) throw new Error('Missing performance story section');
      const bounds = section.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + bounds.top + bounds.height * amount - window.innerHeight / 2);
    }, progress);
    await page.waitForTimeout(350);
    return readDiagnostics(page);
  };
  const earlyFrame = await moveWithinSection(.2);
  const lateFrame = await moveWithinSection(.7);
  expect(lateFrame.camera?.position).not.toEqual(earlyFrame.camera?.position);
  expect(lateFrame.camera?.fov).not.toBe(earlyFrame.camera?.fov);
  expect(lateFrame.vehicleYaw).not.toBe(earlyFrame.vehicleYaw);

  const hotspotPositions = new Set<string>();
  const hotspotExpectations = {
    aero: ['空气动力学', 'front', '前翼与流线车身'],
    performance: ['电驱与底盘', 'wheel', '轮组与低重心底盘'],
    cabin: ['智能座舱', 'cabin', '座舱交互空间'],
    sensing: ['智能驾驶感知', 'roof', '车顶与环车感知'],
  } as const;
  for (const view of ['aero', 'performance', 'cabin', 'sensing'] as const) {
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

    const [label, position, detail] = hotspotExpectations[view];
    const hotspot = page.locator('.story-hotspot');
    const marker = hotspot.locator('.hotspot-marker');
    await expect(hotspot).toHaveAttribute('data-hotspot-view', view);
    await expect(hotspot).toHaveAttribute('data-hotspot-position', position);
    await expect(marker).toHaveAttribute('aria-label', `查看${label}部件说明`);
    await expect(marker).toBeVisible();
    const box = await marker.boundingBox();
    expect(box).not.toBeNull();
    if (box) hotspotPositions.add(`${Math.round(box.x)}:${Math.round(box.y)}`);
    await marker.evaluate((button: HTMLButtonElement) => button.click());
    await expect(marker).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.hotspot-detail')).toContainText(detail);
    await marker.evaluate((button: HTMLButtonElement) => button.click());
  }
  expect(hotspotPositions.size).toBe(4);

  const yawBefore = (await readDiagnostics(page)).vehicleYaw;
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.vehicle-canvas');
    canvas?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 700, bubbles: true }));
    canvas?.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 560, bubbles: true }));
    canvas?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 560, bubbles: true }));
  });
  await expect.poll(async () => (await readDiagnostics(page)).vehicleYaw).not.toBe(yawBefore);
  const draggedYaw = (await readDiagnostics(page)).vehicleYaw;
  await page.evaluate(() => window.scrollBy(0, 180));
  await page.waitForTimeout(250);
  expect((await readDiagnostics(page)).vehicleYaw).toBe(draggedYaw);

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
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await page.goto('/xiaomi-su7-interactive/');
    await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

    const heading = page.getByRole('heading', { level: 1, name: /Xiaomi\s*SU7/ });
    const cta = page.getByRole('link', { name: '探索核心科技' });
    const cabinCta = page.getByRole('button', { name: '进入座舱' });
    const specs = page.locator('.hero-specs');
    const controls = page.locator('.vehicle-controls');
    for (const element of [heading, cta, cabinCta, specs, controls]) {
      await expectFullyInViewport(element, viewport);
    }

    await expect(page).toHaveScreenshot(`hero-${viewport.width}x${viewport.height}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.035,
      timeout: 30_000,
    });

    if (viewport.width === 390) {
      const ctaBox = await cta.boundingBox();
      const cabinCtaBox = await cabinCta.boundingBox();
      const hotspotBox = await page.locator('.hotspot-marker').boundingBox();
      const canvasBox = await page.locator('canvas.vehicle-canvas').boundingBox();
      const specsBox = await specs.boundingBox();
      const controlsBox = await controls.boundingBox();
      expect(ctaBox && cabinCtaBox && hotspotBox && canvasBox && specsBox && controlsBox).toBeTruthy();
      if (ctaBox && cabinCtaBox && hotspotBox && canvasBox && specsBox && controlsBox) {
        const visibleVehicle = {
          x: Math.max(0, canvasBox.x),
          y: Math.max(0, canvasBox.y),
          width: Math.min(viewport.width, canvasBox.x + canvasBox.width) - Math.max(0, canvasBox.x),
          height: Math.min(viewport.height, canvasBox.y + canvasBox.height) - Math.max(0, canvasBox.y),
        };
        expect(overlaps(ctaBox, visibleVehicle), JSON.stringify({ ctaBox, visibleVehicle })).toBe(false);
        expect(overlaps(hotspotBox, ctaBox)).toBe(false);
        expect(overlaps(hotspotBox, cabinCtaBox)).toBe(false);
        expect(specsBox.y + specsBox.height).toBeLessThanOrEqual(controlsBox.y);
      }
    }
  });
}

test('reduced motion keeps scroll chapters and target camera active with immediate transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('[data-story-view="sensing"]');
    if (!section) throw new Error('Missing sensing section');
    const bounds = section.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + bounds.top + bounds.height / 2 - window.innerHeight / 2);
  });

  await expect.poll(async () => {
    const state = await readDiagnostics(page);
    return { hotspot: state.hotspot, view: state.camera?.view, fov: state.camera?.fov };
  }).toEqual({ hotspot: 'sensing', view: 'sensing', fov: 34 });
});
