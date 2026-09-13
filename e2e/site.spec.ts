import { expect, test, type Locator, type Page } from '@playwright/test';

interface Su7Diagnostics {
  modelReady: boolean;
  mode: 'exterior' | 'cabin';
  paint: string | null;
  doorAngles: {
    frontLeft: number | null;
    frontRight: number | null;
    rearLeft: number | null;
    rearRight: number | null;
  };
  camera: {
    view: string;
    target: number[];
    position: number[];
    fov: number;
    near: number;
  } | null;
  cabinLighting: { enabled: boolean; exposure: number; activeLights: number } | null;
  vehicleYaw: number | null;
  materials: { body: number; interior: number; screens: number };
  activeStoryId: string;
  autoCameraSuspendedUntil: number;
  story: { view: string; progress: number; scrollY: number; updatedAt: number } | null;
  renderActive: boolean;
  pendingRenderReasons: string[];
  renderRevision: number;
  renderedView: string | null;
  renderedCamera: {
    view: string;
    target: number[];
    position: number[];
    fov: number;
    near: number;
  } | null;
}

const readDiagnostics = (page: Page) => page.evaluate(() => {
  const reader = (window as typeof window & {
    __SU7_E2E_READ_DIAGNOSTICS__?: () => Su7Diagnostics;
  }).__SU7_E2E_READ_DIAGNOSTICS__;
  if (!reader) throw new Error('SU7 read-only E2E diagnostics are unavailable');
  return reader();
});

function cabinSystems(diagnostics: Su7Diagnostics) {
  return {
    lightingEnabled: diagnostics.cabinLighting?.enabled,
    activeLightsReady: (diagnostics.cabinLighting?.activeLights ?? 0) >= 2,
    exposure: diagnostics.cabinLighting?.exposure,
    cameraNearReady: (diagnostics.camera?.near ?? Number.POSITIVE_INFINITY) <= .03,
    screensReady: diagnostics.materials.screens >= 2,
  };
}

async function dispatchScrollAndWaitForFrame(page: Page, deltaY: number) {
  await page.evaluate((amount) => new Promise<void>((resolve) => {
    window.addEventListener('scroll', () => requestAnimationFrame(() => resolve()), { once: true });
    window.scrollBy(0, amount);
  }), deltaY);
}

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

function monitorPageFailures(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResources: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedResources.push(`REQUEST_FAILED ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });
  return () => {
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedResources).toEqual([]);
  };
}

async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error(`Missing layout box for ${await locator.evaluate((element) => element.outerHTML)}`);
  return box;
}

async function activatePublicButton(locator: Locator) {
  // Exercise the rendered control's real click listener without flaky pointer hit-testing across sticky WebGL layers.
  await locator.evaluate((button: HTMLButtonElement) => button.click());
}

async function expectRenderedCamera(
  page: Page,
  revisionBeforeInteraction: number,
  expected: { view: string; position: readonly number[]; near: number },
) {
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    const position = diagnostics.renderedCamera?.position;
    return {
      renderedView: diagnostics.renderedView,
      renderedPositionMatches: position?.length === expected.position.length
        && position.every((value, index) => Math.abs(value - expected.position[index]) < 1e-6),
      renderedNearMatches: Math.abs((diagnostics.renderedCamera?.near ?? Number.POSITIVE_INFINITY) - expected.near) < 1e-6,
      revisionIncreased: diagnostics.renderRevision > revisionBeforeInteraction,
    };
  }, { timeout: 30_000 }).toEqual({
    renderedView: expected.view,
    renderedPositionMatches: true,
    renderedNearMatches: true,
    revisionIncreased: true,
  });
}

async function scrollStoryTo(page: Page, view: string, progress = .5) {
  const before = await page.evaluate(() => Math.round(window.scrollY));
  const target = await page.evaluate(({ targetView, amount }) => {
    document.documentElement.style.scrollBehavior = 'auto';
    const section = document.querySelector<HTMLElement>(`[data-story-view="${targetView}"]`);
    if (!section) throw new Error(`Missing story section: ${targetView}`);
    const bounds = section.getBoundingClientRect();
    const desired = window.scrollY + bounds.top + bounds.height * amount - window.innerHeight / 2;
    const maximum = document.documentElement.scrollHeight - window.innerHeight;
    const next = Math.round(Math.max(0, Math.min(maximum, desired)));
    window.scrollTo({ top: next, behavior: 'instant' });
    return next;
  }, { targetView: view, amount: progress });
  await expect.poll(async () => page.evaluate(() => Math.round(window.scrollY))).toBe(target);
  await expect.poll(async () => {
    const story = (await readDiagnostics(page)).story;
    return story ? Math.round(story.scrollY) : -1;
  }).toBe(target);
  const after = await page.evaluate(() => Math.round(window.scrollY));
  expect(after, JSON.stringify({ view, before, target, after })).not.toBe(before);
}

test('persistent story keeps hotspots, detail and rendered camera synchronized', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  const hotspots = page.locator('.story-hotspot');
  await expect(hotspots).toHaveCount(4);
  for (const hotspot of await hotspots.all()) await expect(hotspot).toBeVisible();
  await expect(page.locator('.story-hotspot[aria-current="true"]')).toHaveCount(1);

  const chapters = [
    { id: 'aero', title: '低趴轿跑姿态，像风压过车身', view: 'aero' },
    { id: 'performance', title: '电驱、轮组与底盘共同制造力量感', view: 'performance' },
    { id: 'cabin', title: '切入座舱，看见屏幕与乘坐空间', view: 'cabin' },
    { id: 'intelligence', title: '传感器视角，展示智能驾驶想象力', view: 'sensing' },
  ] as const;
  const detail = page.locator('.story-detail');
  for (const chapter of chapters) {
    await scrollStoryTo(page, chapter.id);
    await expect.poll(async () => {
      const diagnostics = await readDiagnostics(page);
      return {
        activeStoryId: diagnostics.activeStoryId,
        renderedView: diagnostics.renderedView,
        renderedCameraView: diagnostics.renderedCamera?.view,
      };
    }, { timeout: 30_000 }).toEqual({
      activeStoryId: chapter.id,
      renderedView: chapter.view,
      renderedCameraView: chapter.view,
    });
    await expect(hotspots.filter({ has: page.locator(`[data-story-id="${chapter.id}"]`) })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.story-hotspot[aria-current="true"]')).toHaveCount(1);
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: chapter.title })).toBeVisible();
  }

  const target = page.locator('.story-hotspot[data-story-id="performance"] button');
  await target.click();
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return {
      activeStoryId: diagnostics.activeStoryId,
      renderedView: diagnostics.renderedView,
      renderedCameraView: diagnostics.renderedCamera?.view,
    };
  }, { timeout: 30_000 }).toEqual({
    activeStoryId: 'performance',
    renderedView: 'performance',
    renderedCameraView: 'performance',
  });
  await expect(page.locator('[data-story-section="performance"]')).toBeInViewport();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: chapters[1].title })).toBeVisible();
});

test('idle render remains stable for 500ms and resumes after a visible interaction', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return { renderActive: diagnostics.renderActive, pendingRenderReasons: diagnostics.pendingRenderReasons };
  }, { timeout: 30_000 }).toEqual({ renderActive: false, pendingRenderReasons: [] });

  const settled = await readDiagnostics(page);
  const sampledAt = Date.now();
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return {
      elapsed: Date.now() - sampledAt >= 500,
      revisionUnchanged: diagnostics.renderRevision === settled.renderRevision,
      renderActive: diagnostics.renderActive,
      pendingRenderReasons: diagnostics.pendingRenderReasons,
    };
  }, { timeout: 5_000, intervals: [50, 100, 200] }).toEqual({
    elapsed: true,
    revisionUnchanged: true,
    renderActive: false,
    pendingRenderReasons: [],
  });

  await page.getByRole('button', { name: '海湾蓝' }).click();
  await expect.poll(async () => (await readDiagnostics(page)).renderRevision).toBeGreaterThan(settled.renderRevision);
});

test('mobile story rail, focus zone, cabin card and primary controls do not overlap', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  const storyRail = page.locator('.mobile-story-rail');
  const focusZone = page.locator('[data-vehicle-focus-zone]');
  const controls = page.locator('[data-mobile-control-rail]');
  const exteriorBoxes = await Promise.all([storyRail, focusZone, controls].map(requiredBox));
  for (const locator of [storyRail, focusZone, controls]) await expectFullyInViewport(locator, viewport);
  expect(overlaps(exteriorBoxes[0], exteriorBoxes[1])).toBe(false);
  expect(overlaps(exteriorBoxes[0], exteriorBoxes[2]), JSON.stringify(exteriorBoxes)).toBe(false);
  expect(overlaps(exteriorBoxes[1], exteriorBoxes[2])).toBe(false);

  await page.getByRole('button', { name: '进入座舱' }).click();
  await expect.poll(async () => (await readDiagnostics(page)).renderedView).toBe('driver');
  const cabinCard = page.locator('.cabin-detail');
  const cabinBoxes = await Promise.all([cabinCard, focusZone, controls].map(requiredBox));
  for (const locator of [cabinCard, focusZone, controls]) await expectFullyInViewport(locator, viewport);
  expect(overlaps(cabinBoxes[0], cabinBoxes[1])).toBe(false);
  expect(overlaps(cabinBoxes[0], cabinBoxes[2])).toBe(false);
  expect(overlaps(cabinBoxes[1], cabinBoxes[2])).toBe(false);
});

test('非 reduced-motion 下中途关门从当前角度连续反向并保持座席', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));

  await activatePublicButton(page.getByRole('button', { name: '进入座舱' }));
  await activatePublicButton(page.getByRole('button', { name: '副驾', exact: true }));
  await page.clock.runFor(120);
  const openingSample = await readDiagnostics(page);
  const openingMagnitude = Math.abs(openingSample.doorAngles.frontLeft ?? 0);
  expect(openingMagnitude).toBeGreaterThan(0.1);
  expect(openingMagnitude).toBeLessThan(0.9);

  const closeDoor = page.getByRole('button', { name: '关门' });
  await closeDoor.evaluate((button: HTMLButtonElement) => button.click());
  await page.clock.runFor(48);
  const firstClosingSample = await readDiagnostics(page);
  const closingMagnitude = Math.abs(firstClosingSample.doorAngles.frontLeft ?? 0);
  expect(closingMagnitude).toBeLessThan(openingMagnitude);
  expect(closingMagnitude).toBeGreaterThan(0.1);
  expect(firstClosingSample.camera?.view).toBe('passenger');

  await page.clock.runFor(400);
  const settled = await readDiagnostics(page);
  expect({
    closed: Object.values(settled.doorAngles)
      .every((angle) => angle !== null && Math.abs(angle) < 0.01),
    seatView: settled.camera?.view,
  }).toEqual({ closed: true, seatView: 'passenger' });
});

test('用户操作会改变真实车辆、车门、相机与滚动叙事状态', async ({ page }) => {
  test.setTimeout(120_000);
  expect(test.info().timeout).toBe(120_000);
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

  await page.getByRole('button', { name: '座舱', exact: true }).click();
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    const angles = Object.values(diagnostics.doorAngles);
    return {
      mode: diagnostics.mode,
      cameraView: diagnostics.camera?.view,
      allDoorsOpen: angles.every((angle) => angle !== null && Math.abs(angle) > .4),
      ...cabinSystems(diagnostics),
    };
  }).toEqual({
    mode: 'cabin',
    cameraView: 'driver',
    allDoorsOpen: true,
    lightingEnabled: true,
    activeLightsReady: true,
    exposure: 0.88,
    cameraNearReady: true,
    screensReady: true,
  });

  await page.getByRole('button', { name: '关门' }).click();
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return {
      cameraView: diagnostics.camera?.view,
      allDoorsClosed: Object.values(diagnostics.doorAngles)
        .every((angle) => angle !== null && Math.abs(angle) < .01),
      ...cabinSystems(diagnostics),
    };
  }).toEqual({
    cameraView: 'driver',
    allDoorsClosed: true,
    lightingEnabled: true,
    activeLightsReady: true,
    exposure: 0.88,
    cameraNearReady: true,
    screensReady: true,
  });

  const cameraTargets = new Set<string>();
  let previousCameraTarget = JSON.stringify((await readDiagnostics(page)).camera?.target);
  cameraTargets.add(previousCameraTarget);
  for (const [seat, expectedView] of [['副驾', 'passenger'], ['后排', 'rear']] as const) {
    await page.getByRole('button', { name: seat }).click();
    await expect.poll(async () => {
      const diagnostics = await readDiagnostics(page);
      return {
        view: diagnostics.camera?.view,
        targetChanged: JSON.stringify(diagnostics.camera?.target) !== previousCameraTarget,
        allDoorsClosed: Object.values(diagnostics.doorAngles)
          .every((angle) => angle !== null && Math.abs(angle) < .01),
        ...cabinSystems(diagnostics),
      };
    }).toEqual({
      view: expectedView,
      targetChanged: true,
      allDoorsClosed: true,
      lightingEnabled: true,
      activeLightsReady: true,
      exposure: 0.88,
      cameraNearReady: true,
      screensReady: true,
    });
    const target = (await readDiagnostics(page)).camera?.target;
    expect(target).toBeDefined();
    previousCameraTarget = JSON.stringify(target);
    cameraTargets.add(previousCameraTarget);
  }
  expect(cameraTargets.size).toBe(3);
  expect((await readDiagnostics(page)).materials).toEqual({ body: 1, interior: 4, screens: 2 });

  await scrollStoryTo(page, 'performance');
  await expect.poll(async () => (await readDiagnostics(page)).activeStoryId).toBe('performance');
  expect((await readDiagnostics(page)).camera?.view).toBe('rear');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await expect.poll(async () => {
    const camera = (await readDiagnostics(page)).camera;
    return { view: camera?.view, movedOutside: (camera?.position[0] ?? 0) > 2 };
  }, { timeout: 15_000 }).toEqual({ view: 'performance', movedOutside: true });
  await expect(page.locator('.story-hotspot[aria-current="true"]')).toContainText('电驱与底盘');

  const moveWithinSection = async (progress: number) => {
    const previousFov = (await readDiagnostics(page)).camera?.fov;
    await scrollStoryTo(page, 'performance', progress);
    await expect.poll(async () => (await readDiagnostics(page)).camera?.fov).not.toBe(previousFov);
    return readDiagnostics(page);
  };
  const earlyFrame = await moveWithinSection(.2);
  const lateFrame = await moveWithinSection(.7);
  expect(lateFrame.camera?.position).not.toEqual(earlyFrame.camera?.position);
  expect(lateFrame.camera?.fov).not.toBe(earlyFrame.camera?.fov);
  expect(lateFrame.vehicleYaw).not.toBe(earlyFrame.vehicleYaw);

  const hotspotPositions = new Set<string>();
  const hotspotExpectations = {
    aero: ['空气动力学', '76%', '57%', '流畅车顶弧线'],
    performance: ['电驱与底盘', '71%', '69%', '即时动力响应'],
    cabin: ['智能座舱', '61%', '43%', '屏幕、方向盘与座椅'],
    intelligence: ['智能驾驶感知', '67%', '29%', '感知硬件持续理解'],
  } as const;
  for (const view of ['aero', 'performance', 'cabin', 'intelligence'] as const) {
    await scrollStoryTo(page, view);
    await expect.poll(async () => {
      const state = await readDiagnostics(page);
      return { activeStoryId: state.activeStoryId, cameraView: state.camera?.view };
    }).toEqual({ activeStoryId: view, cameraView: view === 'intelligence' ? 'sensing' : view });

    const [label, x, y, detail] = hotspotExpectations[view];
    const hotspot = page.locator(`.story-hotspot[data-story-id="${view}"]`);
    const marker = hotspot.locator('.hotspot-marker');
    await expect(hotspot).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.story-hotspot[aria-current="true"]')).toHaveCount(1);
    await expect(marker).toHaveAttribute('aria-label', `查看${label}部件说明`);
    await expect(marker).toBeVisible();
    const position = await hotspot.evaluate((element) => {
      const style = (element as HTMLElement).style;
      return `${style.getPropertyValue('--hotspot-x')},${style.getPropertyValue('--hotspot-y')}`;
    });
    expect(position).toBe(`${x},${y}`);
    hotspotPositions.add(position);
    await marker.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator(`[data-story-section="${view}"]`)).toBeInViewport();
    await expect(page.locator('.story-detail')).toBeVisible();
    await expect(page.locator('.story-detail')).toContainText(detail);
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
  const draggedState = await readDiagnostics(page);
  const draggedYaw = draggedState.vehicleYaw;
  expect(draggedState.autoCameraSuspendedUntil).toBeGreaterThan(Date.now());

  await dispatchScrollAndWaitForFrame(page, 180);
  expect((await readDiagnostics(page)).vehicleYaw).toBe(draggedYaw);

  await expect.poll(async () => {
    const suspendedUntil = (await readDiagnostics(page)).autoCameraSuspendedUntil;
    return Number.isFinite(suspendedUntil) && Date.now() >= suspendedUntil;
  }, { timeout: 12_000 }).toBe(true);

  const storyUpdatedBeforeResume = (await readDiagnostics(page)).story?.updatedAt ?? 0;
  await dispatchScrollAndWaitForFrame(page, 1);
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return {
      storyUpdated: (diagnostics.story?.updatedAt ?? 0) > storyUpdatedBeforeResume,
      cameraView: diagnostics.camera?.view,
      yawRestored: diagnostics.vehicleYaw !== draggedYaw,
    };
  }).toEqual({ storyUpdated: true, cameraView: 'sensing', yawRestored: true });

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
  test(`visual hero geometry at ${viewport.width}x${viewport.height}`, async ({ page }) => {
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

    if (viewport.width !== 390) {
      await expect(page).toHaveScreenshot(`hero-${viewport.width}x${viewport.height}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.035,
        timeout: 30_000,
      });
    }

    if (viewport.width === 390) {
      const ctaBox = await cta.boundingBox();
      const cabinCtaBox = await cabinCta.boundingBox();
      const hotspotBox = await page.locator('.story-hotspot[aria-current="true"] .hotspot-marker').boundingBox();
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

test('visual story aero keeps the vehicle and persistent detail composed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);
  await scrollStoryTo(page, 'aero');
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return {
      activeStoryId: diagnostics.activeStoryId,
      renderedView: diagnostics.renderedView,
      renderedCameraView: diagnostics.renderedCamera?.view,
    };
  }, { timeout: 30_000 }).toEqual({
    activeStoryId: 'aero',
    renderedView: 'aero',
    renderedCameraView: 'aero',
  });
  await expect(page.locator('.story-detail')).toBeVisible();
  await expect(page).toHaveScreenshot('story-aero-1440x900.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.035,
    timeout: 30_000,
  });
});

test('visual cabin remains complete for driver, passenger and rear seats', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const expectNoPageFailures = monitorPageFailures(page);
  const response = await page.goto('/xiaomi-su7-interactive/');
  expect(response?.status()).toBe(200);
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);
  const initialRevision = (await readDiagnostics(page)).renderRevision;
  await activatePublicButton(page.getByRole('button', { name: '进入座舱' }));
  await expectRenderedCamera(page, initialRevision, {
    view: 'driver',
    position: [-0.38, 1.26, 0.08],
    near: 0.025,
  });

  const seats = [
    { key: 'passenger', label: '副驾', title: '副驾交互空间', position: [0.38, 1.26, 0.08] },
    { key: 'rear', label: '后排', title: '后排空间关系', position: [0, 1.3, 1.28] },
    { key: 'driver', label: '主驾', title: '主驾沉浸视野', position: [-0.38, 1.26, 0.08] },
  ] as const;
  for (const seat of seats) {
    const button = page.getByRole('button', { name: seat.label, exact: true });
    const revisionBeforeClick = (await readDiagnostics(page)).renderRevision;
    await button.click();
    await expectRenderedCamera(page, revisionBeforeClick, {
      view: seat.key,
      position: seat.position,
      near: 0.025,
    });
    const diagnostics = await readDiagnostics(page);
    expect(Object.values(diagnostics.doorAngles).every((angle) => Number.isFinite(angle))).toBe(true);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const card = page.locator('.cabin-detail');
    await expect(card.getByRole('heading', { name: seat.title })).toBeVisible();
    await expect(card.locator('li')).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) await expect(card.locator('li').nth(index)).toBeVisible();
    expectNoPageFailures();
    await expect(page).toHaveScreenshot(`cabin-${seat.key}-1440x900.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.035,
      timeout: 30_000,
    });
  }
  expectNoPageFailures();
});

test('移动座舱使用真实几何避让操作区并保持触控尺寸', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const expectNoPageFailures = monitorPageFailures(page);
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  const primaryCta = page.getByRole('link', { name: '探索核心科技' });
  const cabinCta = page.getByRole('button', { name: '进入座舱' });
  await expect(primaryCta).toBeVisible();
  await expect(cabinCta).toBeVisible();
  const primaryCtaBox = await requiredBox(primaryCta);
  const cabinCtaBox = await requiredBox(cabinCta);
  expect(overlaps(primaryCtaBox, cabinCtaBox)).toBe(false);

  await cabinCta.click();
  await expect.poll(async () => (await readDiagnostics(page)).camera?.view).toBe('driver');
  await expect(primaryCta).toBeHidden();
  await expect(cabinCta).toBeHidden();

  const card = page.locator('.cabin-detail');
  const focusZone = page.locator('[data-vehicle-focus-zone]');
  const rail = page.locator('[data-mobile-control-rail]');
  const cardBox = await requiredBox(card);
  const focusBox = await requiredBox(focusZone);
  const railBox = await requiredBox(rail);
  expect(overlaps(cardBox, focusBox), JSON.stringify({ cardBox, focusBox })).toBe(false);
  expect(overlaps(cardBox, railBox), JSON.stringify({ cardBox, railBox })).toBe(false);
  expect(overlaps(focusBox, railBox), JSON.stringify({ focusBox, railBox })).toBe(false);
  await expectFullyInViewport(card, viewport);
  await expectFullyInViewport(focusZone, viewport);
  await expectFullyInViewport(rail, viewport);

  const buttonGroups = [
    { name: 'cabin tab', locator: rail.locator('[data-mode="cabin"]'), count: 1 },
    { name: 'seat', locator: rail.locator('[data-seat]'), count: 3 },
    { name: 'door', locator: rail.locator('.door-button'), count: 1 },
  ];
  for (const group of buttonGroups) {
    await expect(group.locator, group.name).toHaveCount(group.count);
    for (const button of await group.locator.all()) {
      const box = await requiredBox(button);
      expect(box.height, `${group.name}: ${await button.textContent() ?? ''}`).toBeGreaterThanOrEqual(44);
    }
  }
  expectNoPageFailures();
});

test('reduced motion keeps scroll chapters and target camera active with immediate transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  await scrollStoryTo(page, 'intelligence');

  await expect.poll(async () => {
    const state = await readDiagnostics(page);
    return { activeStoryId: state.activeStoryId, view: state.camera?.view, fov: state.camera?.fov };
  }).toEqual({ activeStoryId: 'intelligence', view: 'sensing', fov: 34 });
});
