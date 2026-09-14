import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

interface Su7Diagnostics {
  modelReady: boolean;
  mode: 'exterior' | 'cabin';
  state: {
    mode: 'exterior' | 'cabin';
    seatView: 'driver' | 'passenger' | 'rear';
  };
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

const isGlbRequest = (url: string) => new URL(url).pathname.endsWith('.glb');

function cabinSystems(diagnostics: Su7Diagnostics) {
  return {
    lightingEnabled: diagnostics.cabinLighting?.enabled,
    activeLightsReady: (diagnostics.cabinLighting?.activeLights ?? 0) >= 2,
    exposure: diagnostics.cabinLighting?.exposure,
    cameraNearReady: (diagnostics.camera?.near ?? 0) >= .12
      && (diagnostics.camera?.near ?? Number.POSITIVE_INFINITY) <= .2,
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

type NormalizedRegion = readonly [x: number, y: number, width: number, height: number];

async function readCanvasLuminance(page: Page, region: NormalizedRegion) {
  const screenshot = await page.locator('canvas.vehicle-canvas').screenshot({ animations: 'disabled' });
  return page.evaluate(async ({ encodedScreenshot, sampleRegion }) => {
    const bytes = Uint8Array.from(atob(encodedScreenshot), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const [x, y, width, height] = sampleRegion;
    const scratch = document.createElement('canvas');
    scratch.width = Math.max(1, Math.floor(width * bitmap.width));
    scratch.height = Math.max(1, Math.floor(height * bitmap.height));
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to create visual guardrail context');
    context.drawImage(
      bitmap,
      Math.floor(x * bitmap.width),
      Math.floor(y * bitmap.height),
      scratch.width,
      scratch.height,
      0,
      0,
      scratch.width,
      scratch.height,
    );
    bitmap.close();
    const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
    const luminance: number[] = [];
    for (let index = 0; index < pixels.length; index += 16) {
      luminance.push(
        pixels[index] * 0.2126
        + pixels[index + 1] * 0.7152
        + pixels[index + 2] * 0.0722,
      );
    }
    luminance.sort((left, right) => left - right);
    return {
      median: luminance[Math.floor(luminance.length / 2)],
      darkRatio: luminance.filter((value) => value < 12).length / luminance.length,
      highlightRatio: luminance.filter((value) => value > 160).length / luminance.length,
    };
  }, { encodedScreenshot: screenshot.toString('base64'), sampleRegion: region });
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
  await expect.poll(
    async () => page.evaluate(() => Math.round(window.scrollY)),
    { timeout: 30_000 },
  ).toBe(target);
  await expect.poll(async () => {
    const story = (await readDiagnostics(page)).story;
    return story ? Math.round(story.scrollY) : -1;
  }, { timeout: 30_000 }).toBe(target);
  const after = await page.evaluate(() => Math.round(window.scrollY));
  expect(after, JSON.stringify({ view, before, target, after })).not.toBe(before);
}

test('simplified chrome keeps three centered links and removes legacy overlays', async ({ page }) => {
  let modelRequests = 0;
  page.on('request', (request) => {
    if (isGlbRequest(request.url())) modelRequests += 1;
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);

    const header = page.locator('.site-header');
    const nav = page.locator('.site-nav');
    await expect(nav.locator('a')).toHaveText(['SU7', '细节', '科技']);
    await expect(nav.locator('a')).toHaveCount(3);
    await expect(page.locator('#film')).toHaveCount(0);
    const [headerBox, navBox] = await Promise.all([requiredBox(header), requiredBox(nav)]);
    expect(Math.abs((navBox.x + navBox.width / 2) - (headerBox.x + headerBox.width / 2))).toBeLessThanOrEqual(1);
    for (const selector of ['.brand', '.header-cta', '.story-hotspot', '.story-hotspots', '.story-detail', '.mobile-story-rail']) {
      await expect(page.locator(selector), `${selector} at ${viewport.width}x${viewport.height}`).toHaveCount(0);
    }
  }
  await page.locator('[data-story-id="cabin"]').scrollIntoViewIfNeeded();
  await expect.poll(() => readDiagnostics(page).then((d) => d.state.mode)).toBe('cabin');
  await expect.poll(() => readDiagnostics(page).then((d) => d.state.seatView)).toBe('rear');
  expect(modelRequests, 'responsive viewport checks should issue exactly one GLB request').toBe(1);
});

test('official palettes expose exact names and every selection updates rendered material state', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  const paintNames = ['海湾蓝', '雅灰', '橄榄绿', '珍珠白', '钻石黑', '流星蓝', '霞光紫', '熔岩橙', '寒武岩灰'];
  const paintColors = ['2f6f91', '868987', '59614b', 'ecebe6', '111315', '4d6675', '7a667b', 'c84a20', '44494d'];
  const interiorNames = ['银河灰', '曜石黑', '暮光红', '迷雾紫'];
  await expect(page.locator('[data-palette="paint"] .color-swatch')).toHaveCount(paintNames.length);
  await expect(page.locator('[data-palette="interior"] .color-swatch')).toHaveCount(interiorNames.length);
  expect(await page.locator('[data-palette="paint"] .color-swatch').evaluateAll(
    (buttons) => buttons.map((button) => button.getAttribute('aria-label')),
  )).toEqual(paintNames);
  expect(await page.locator('[data-palette="interior"] .color-swatch').evaluateAll(
    (buttons) => buttons.map((button) => button.getAttribute('aria-label')),
  )).toEqual(interiorNames);

  const initialPaintButton = page.getByRole('button', { name: paintNames.at(-1)!, exact: true });
  await initialPaintButton.click();
  await expect.poll(async () => (await readDiagnostics(page)).paint).toBe(paintColors.at(-1));
  for (let index = 0; index < paintNames.length; index += 1) {
    const revision = (await readDiagnostics(page)).renderRevision;
    const button = page.getByRole('button', { name: paintNames[index], exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await readDiagnostics(page)).paint).toBe(paintColors[index]);
    await expect.poll(async () => (await readDiagnostics(page)).renderRevision).toBeGreaterThan(revision);
  }

  await page.getByRole('button', { name: '进入座舱' }).click();
  await expect.poll(async () => (await readDiagnostics(page)).renderedView).toBe('driver');
  let previousFrame = (await page.locator('canvas.vehicle-canvas').screenshot()).toString('base64');
  for (const name of interiorNames) {
    const revision = (await readDiagnostics(page)).renderRevision;
    const button = page.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await readDiagnostics(page)).renderRevision).toBeGreaterThan(revision);
    const frame = (await page.locator('canvas.vehicle-canvas').screenshot()).toString('base64');
    expect(frame, `${name} must change rendered interior pixels`).not.toBe(previousFrame);
    previousFrame = frame;
  }
});

test('story safety keeps copy clear of the vehicle and removes overlays at every viewport', async ({ page }) => {
  test.setTimeout(90_000);
  let modelRequests = 0;
  page.on('request', (request) => {
    if (isGlbRequest(request.url())) modelRequests += 1;
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(
    async () => (await readDiagnostics(page)).modelReady,
    { timeout: 30_000 },
  ).toBe(true);

  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const storyId of ['aero', 'performance', 'cabin']) {
      await scrollStoryTo(page, storyId);
      const [copyBox, focusBox] = await Promise.all([
        requiredBox(page.locator(`[data-story-section="${storyId}"] .story-copy`)),
        requiredBox(page.locator('[data-vehicle-focus-zone]')),
      ]);
      expect(overlaps(copyBox, focusBox), JSON.stringify({ viewport, storyId, copyBox, focusBox })).toBe(false);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  for (const selector of ['.story-hotspot', '.story-hotspots', '.story-detail', '.mobile-story-rail']) {
    await expect(page.locator(selector), selector).toHaveCount(0);
  }
  expect(modelRequests, 'story viewport checks should issue exactly one GLB request').toBe(1);
});

test('hero controls remain complete, clear and continuous across responsive boundaries', async ({ page }) => {
  test.setTimeout(300_000);
  const viewports = [
    ...[768, 900, 1024, 1152, 1199, 1200, 1280, 1440].map((width) => ({ width, height: 900 })),
    { width: 768, height: 600 },
    { width: 900, height: 700 },
    { width: 1199, height: 700 },
    { width: 1279, height: 800 },
    { width: 1280, height: 800 },
  ];
  let geometryAt1199: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>> | null = null;
  const boundaryGeometry = new Map<number, {
    controls: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;
    minButtonWidth: number;
    minButtonHeight: number;
    maxLabelOverflow: number;
  }>();

  await page.goto('/xiaomi-su7-interactive/');
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(
      async () => page.evaluate(() => window.scrollY),
      { timeout: 30_000 },
    ).toBe(0);

    const controls = page.locator('.vehicle-controls');
    const heroCopy = page.locator('.hero-copy');
    const heroActions = page.locator('.hero-actions');
    const focusZone = page.locator('[data-vehicle-focus-zone]');
    const stage = page.locator('.vehicle-stage');
    const heading = page.getByRole('heading', { level: 1, name: /Xiaomi\s*SU7/ });
    const specs = page.locator('.hero-specs');
    await expectFullyInViewport(controls, viewport);
    const [controlsBox, copyBox, actionsBox, focusBox, stageBox, headingBox, specsBox] = await Promise.all(
      [controls, heroCopy, heroActions, focusZone, stage, heading, specs].map(requiredBox),
    );
    for (const [name, occupiedBox] of [
      ['hero-copy', copyBox],
      ['hero-actions', actionsBox],
      ['vehicle-focus-zone', focusBox],
    ] as const) {
      expect(overlaps(controlsBox, occupiedBox), JSON.stringify({ viewport, name, controlsBox, occupiedBox })).toBe(false);
    }
    expect(overlaps(copyBox, focusBox), JSON.stringify({ viewport, copyBox, focusBox })).toBe(false);
    for (const [name, heroBox] of [
      ['heading', headingBox],
      ['hero-actions', actionsBox],
      ['hero-specs', specsBox],
    ] as const) {
      expect(heroBox.x, JSON.stringify({ viewport, name, stageBox, heroBox })).toBeGreaterThanOrEqual(stageBox.x);
      expect(heroBox.y, JSON.stringify({ viewport, name, stageBox, heroBox })).toBeGreaterThanOrEqual(stageBox.y);
      expect(heroBox.x + heroBox.width, JSON.stringify({ viewport, name, stageBox, heroBox }))
        .toBeLessThanOrEqual(stageBox.x + stageBox.width);
      expect(heroBox.y + heroBox.height, JSON.stringify({ viewport, name, stageBox, heroBox }))
        .toBeLessThanOrEqual(stageBox.y + stageBox.height);
    }

    const buttons = controls.locator('button:visible');
    await expect(controls.locator('[data-mode]')).toHaveCount(2);
    await expect(controls.locator('[data-seat]')).toHaveCount(3);
    await expect(controls.locator('.door-button')).toHaveCount(1);
    await expect(controls.locator('.color-swatch')).toHaveCount(13);
    await expect(controls.locator('button')).toHaveCount(19);
    await expect(buttons).toHaveCount(12);
    const buttonGeometries = await buttons.evaluateAll((elements) => elements.map((button) => {
      const bounds = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim(),
        swatch: button.classList.contains('color-swatch'),
        visible: button.checkVisibility(),
        x: bounds.x,
        y: bounds.y,
        targetWidth: bounds.width,
        targetHeight: bounds.height,
        labelClientWidth: button.clientWidth,
        labelScrollWidth: button.scrollWidth,
      };
    }));
    for (const geometry of buttonGeometries) {
      expect(geometry.visible, JSON.stringify({ viewport, ...geometry })).toBe(true);
      expect(geometry.x, JSON.stringify({ viewport, ...geometry })).toBeGreaterThanOrEqual(0);
      expect(geometry.y, JSON.stringify({ viewport, ...geometry })).toBeGreaterThanOrEqual(0);
      expect(geometry.x + geometry.targetWidth, JSON.stringify({ viewport, ...geometry }))
        .toBeLessThanOrEqual(viewport.width);
      expect(geometry.y + geometry.targetHeight, JSON.stringify({ viewport, ...geometry }))
        .toBeLessThanOrEqual(viewport.height);
      expect(geometry.targetWidth, JSON.stringify({ viewport, ...geometry })).toBeGreaterThanOrEqual(44);
      expect(geometry.targetHeight, JSON.stringify({ viewport, ...geometry })).toBeGreaterThanOrEqual(44);
      if (!geometry.swatch) {
        expect(geometry.labelScrollWidth, JSON.stringify({ viewport, ...geometry }))
          .toBeLessThanOrEqual(geometry.labelClientWidth);
      }
    }

    if (viewport.height === 800 && (viewport.width === 1279 || viewport.width === 1280)) {
      boundaryGeometry.set(viewport.width, {
        controls: controlsBox,
        minButtonWidth: Math.min(...buttonGeometries.map(({ targetWidth }) => targetWidth)),
        minButtonHeight: Math.min(...buttonGeometries.map(({ targetHeight }) => targetHeight)),
        maxLabelOverflow: Math.max(...buttonGeometries
          .filter(({ swatch }) => !swatch)
          .map(({ labelClientWidth, labelScrollWidth }) => labelScrollWidth - labelClientWidth)),
      });
    }

    await specs.scrollIntoViewIfNeeded();
    await expect(specs, JSON.stringify({ viewport, stageBox, specsBox })).toBeInViewport();

    if (viewport.width === 1199 && viewport.height === 900) geometryAt1199 = controlsBox;
    if (viewport.width === 1200 && viewport.height === 900) {
      expect(geometryAt1199).not.toBeNull();
      if (geometryAt1199) {
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(
            Math.abs(controlsBox[key] - geometryAt1199[key]),
            JSON.stringify({ transition: '1199->1200', key, geometryAt1199, geometryAt1200: controlsBox }),
          ).toBeLessThanOrEqual(24);
        }
      }
    }
  }

  const geometry1279 = boundaryGeometry.get(1279);
  const geometry1280 = boundaryGeometry.get(1280);
  expect(geometry1279).toBeDefined();
  expect(geometry1280).toBeDefined();
  if (geometry1279 && geometry1280) {
    expect(Math.abs(geometry1279.controls.x - geometry1280.controls.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry1279.controls.y - geometry1280.controls.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry1279.controls.width - geometry1280.controls.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry1279.controls.height - geometry1280.controls.height)).toBeLessThanOrEqual(60);
    expect(Math.abs(geometry1279.minButtonWidth - geometry1280.minButtonWidth)).toBeLessThanOrEqual(24);
    expect(Math.abs(geometry1279.minButtonHeight - geometry1280.minButtonHeight)).toBeLessThanOrEqual(1);
    expect(geometry1279.maxLabelOverflow).toBeLessThanOrEqual(0);
    expect(geometry1280.maxLabelOverflow).toBeLessThanOrEqual(0);
  }
});

test('mid-width cabin detail stays clear of complete controls through every seat', async ({ page }) => {
  test.setTimeout(180_000);
  const viewports = [
    { width: 768, height: 600 },
    { width: 900, height: 700 },
    { width: 999, height: 800 },
    { width: 1000, height: 800 },
  ];
  const seats = [
    { label: '主驾', view: 'driver', title: '主驾沉浸视野' },
    { label: '副驾', view: 'passenger', title: '副驾交互空间' },
    { label: '后排', view: 'rear', title: '后排空间关系' },
  ] as const;

  await page.setViewportSize(viewports[0]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);
  await page.getByRole('button', { name: '进入座舱' }).click();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(
      async () => page.evaluate(() => window.scrollY),
      { timeout: 30_000 },
    ).toBe(0);

    const controls = page.locator('.vehicle-controls');
    const detail = page.locator('.cabin-detail');
    const stage = page.locator('.vehicle-stage');
    const focusZone = page.locator('[data-vehicle-focus-zone]');
    const [controlsBox, detailBox, stageBox, focusBox] = await Promise.all(
      [controls, detail, stage, focusZone].map(requiredBox),
    );
    expect(overlaps(detailBox, controlsBox), JSON.stringify({ viewport, controlsBox, detailBox })).toBe(false);
    expect(detailBox.x, JSON.stringify({ viewport, stageBox, detailBox })).toBeGreaterThanOrEqual(stageBox.x);
    expect(detailBox.y, JSON.stringify({ viewport, stageBox, detailBox })).toBeGreaterThanOrEqual(stageBox.y);
    expect(detailBox.x + detailBox.width, JSON.stringify({ viewport, stageBox, detailBox }))
      .toBeLessThanOrEqual(stageBox.x + stageBox.width);
    expect(detailBox.y + detailBox.height, JSON.stringify({ viewport, stageBox, detailBox }))
      .toBeLessThanOrEqual(stageBox.y + stageBox.height);
    expect(focusBox.width, JSON.stringify({ viewport, focusBox })).toBeGreaterThan(0);
    expect(focusBox.height, JSON.stringify({ viewport, focusBox })).toBeGreaterThan(0);

    const buttons = controls.locator('button:visible');
    await expect(controls.locator('button')).toHaveCount(19);
    await expect(buttons).toHaveCount(10);
    const buttonState = await buttons.evaluateAll((elements) => elements.map((button: HTMLButtonElement) => {
      const box = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim(),
        swatch: button.classList.contains('color-swatch'),
        visible: button.checkVisibility(),
        disabled: button.disabled,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        overflow: button.scrollWidth - button.clientWidth,
      };
    }));
    for (const state of buttonState) {
      expect(state.visible, JSON.stringify({ viewport, ...state })).toBe(true);
      expect(state.disabled, JSON.stringify({ viewport, ...state })).toBe(false);
      expect(state.x, JSON.stringify({ viewport, ...state })).toBeGreaterThanOrEqual(0);
      expect(state.y, JSON.stringify({ viewport, ...state })).toBeGreaterThanOrEqual(0);
      expect(state.x + state.width, JSON.stringify({ viewport, ...state })).toBeLessThanOrEqual(viewport.width);
      expect(state.y + state.height, JSON.stringify({ viewport, ...state })).toBeLessThanOrEqual(viewport.height);
      expect(state.width, JSON.stringify({ viewport, ...state })).toBeGreaterThanOrEqual(44);
      expect(state.height, JSON.stringify({ viewport, ...state })).toBeGreaterThanOrEqual(44);
      if (!state.swatch) expect(state.overflow, JSON.stringify({ viewport, ...state })).toBeLessThanOrEqual(0);
    }

    for (const seat of seats) {
      await page.getByRole('button', { name: seat.label, exact: true }).click();
      await expect.poll(async () => (await readDiagnostics(page)).renderedView).toBe(seat.view);
      await expect(detail.getByRole('heading', { name: seat.title })).toBeVisible();
      const [seatDetailBox, seatControlsBox, seatStageBox] = await Promise.all(
        [detail, controls, stage].map(requiredBox),
      );
      expect(
        overlaps(seatDetailBox, seatControlsBox),
        JSON.stringify({ viewport, seat: seat.view, seatControlsBox, seatDetailBox }),
      ).toBe(false);
      expect(seatDetailBox.x, JSON.stringify({ viewport, seat: seat.view, seatStageBox, seatDetailBox }))
        .toBeGreaterThanOrEqual(seatStageBox.x);
      expect(seatDetailBox.y, JSON.stringify({ viewport, seat: seat.view, seatStageBox, seatDetailBox }))
        .toBeGreaterThanOrEqual(seatStageBox.y);
      expect(
        seatDetailBox.x + seatDetailBox.width,
        JSON.stringify({ viewport, seat: seat.view, seatStageBox, seatDetailBox }),
      ).toBeLessThanOrEqual(seatStageBox.x + seatStageBox.width);
      expect(
        seatDetailBox.y + seatDetailBox.height,
        JSON.stringify({ viewport, seat: seat.view, seatStageBox, seatDetailBox }),
      ).toBeLessThanOrEqual(seatStageBox.y + seatStageBox.height);
      await detail.scrollIntoViewIfNeeded();
      await expect(detail, JSON.stringify({ viewport, seat: seat.view, seatStageBox, seatDetailBox })).toBeInViewport();
    }
  }
});

test('technology exit makes fallback retry inert and restores it upward', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/*.glb', (route) => route.abort());
  await page.goto('/xiaomi-su7-interactive/');
  const visual = page.locator('.vehicle-visual');
  const retry = visual.locator('.vehicle-stage-feedback button');
  await expect(retry).toBeVisible();

  await page.locator('#technology').scrollIntoViewIfNeeded();
  await expect(visual).toHaveAttribute('data-stage-visibility', 'hidden');
  await expect(visual).toHaveAttribute('inert', '');
  expect(await retry.evaluate((button: HTMLButtonElement) => {
    button.focus();
    return document.activeElement === button;
  })).toBe(false);
  await expect(retry.click({ trial: true, timeout: 500 })).rejects.toThrow();

  await page.locator('[data-story-view="performance"]').evaluate((section) => {
    section.scrollIntoView({ block: 'center', behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
  });
  await expect(visual).not.toHaveAttribute('inert', '');
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.unroute('**/*.glb');
  await retry.click();
  await expect(retry).toBeHidden();
});

test('technology exit hides at the viewport boundary and restores upward', async ({ page }) => {
  test.setTimeout(90_000);
  let releaseModelRequest: (() => void) | undefined;
  let modelRequestCompletion: Promise<void> | undefined;
  const holdModelRequest = (route: Route) => {
    modelRequestCompletion = (async () => {
      await new Promise<void>((resolve) => { releaseModelRequest = resolve; });
      await route.abort();
    })();
    return modelRequestCompletion;
  };
  await page.route('**/*.glb', holdModelRequest);

  let assertionFailed = false;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/xiaomi-su7-interactive/', { waitUntil: 'domcontentloaded' });
    await expect.poll(
      () => Boolean(releaseModelRequest),
      { message: 'GLB request should be held while stage visibility is tested' },
    ).toBe(true);

    const visual = page.locator('.vehicle-visual');
    const positionTechnologyAt = async (top: number) => {
      await page.evaluate((targetTop) => {
        const technology = document.querySelector<HTMLElement>('#technology');
        if (!technology) throw new Error('Missing technology section');
        window.scrollTo({
          top: window.scrollY + technology.getBoundingClientRect().top - targetTop,
          behavior: 'instant',
        });
        window.dispatchEvent(new Event('scroll'));
      }, top);
      await expect.poll(async () => page.evaluate(() => Math.round(
        document.querySelector('#technology')?.getBoundingClientRect().top ?? Infinity,
      )), { timeout: 30_000 }).toBe(top);
    };

    await test.step('stage remains visible immediately before the technology boundary', async () => {
      await positionTechnologyAt(901);
      await expect(visual).not.toHaveAttribute('data-stage-visibility', 'hidden', { timeout: 30_000 });
    });

    await test.step('stage hides exactly at the technology boundary', async () => {
      await positionTechnologyAt(900);
      await expect(visual).toHaveAttribute('data-stage-visibility', 'hidden', { timeout: 30_000 });
      await expect(visual).toHaveCSS('opacity', '0', { timeout: 30_000 });
      await expect(visual).toHaveCSS('pointer-events', 'none', { timeout: 30_000 });
    });

    await test.step('stage and performance story restore on upward scroll', async () => {
      await page.evaluate(() => new Promise<void>((resolve) => {
        const section = document.querySelector<HTMLElement>('[data-story-view="performance"]');
        if (!section) throw new Error('Missing performance story');
        const bounds = section.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + bounds.top + bounds.height / 2 - window.innerHeight / 2, behavior: 'instant' });
        window.dispatchEvent(new Event('scroll'));
        requestAnimationFrame(() => resolve());
      }));
      await expect(visual).toHaveAttribute('data-stage-visibility', /visible|fading/, { timeout: 30_000 });
      await expect.poll(
        async () => (await readDiagnostics(page)).activeStoryId,
        { timeout: 30_000 },
      ).toBe('performance');
    });
  } catch (error) {
    assertionFailed = true;
    throw error;
  } finally {
    releaseModelRequest?.();
    let cleanupError: unknown;
    try {
      await modelRequestCompletion;
    } catch (error) {
      cleanupError = error;
    }
    try {
      await page.unroute('**/*.glb', holdModelRequest);
    } catch (error) {
      cleanupError ??= error;
    }
    if (!assertionFailed && cleanupError) throw cleanupError;
  }
});

test('scroll story keeps active chapter and rendered camera synchronized', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  const chapters = [
    { id: 'aero', view: 'aero' },
    { id: 'performance', view: 'performance' },
    { id: 'cabin', view: 'rear' },
  ] as const;
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
    await expect(page.locator(`[data-story-section="${chapter.id}"] .story-copy`)).toBeInViewport();
  }
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

  await page.getByRole('button', { name: '熔岩橙' }).click();
  await expect.poll(async () => (await readDiagnostics(page)).renderRevision).toBeGreaterThan(settled.renderRevision);
});

test('mobile focus zone, cabin card and primary controls do not overlap', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  const focusZone = page.locator('[data-vehicle-focus-zone]');
  const controls = page.locator('[data-mobile-control-rail]');
  const exteriorBoxes = await Promise.all([focusZone, controls].map(requiredBox));
  for (const locator of [focusZone, controls]) await expectFullyInViewport(locator, viewport);
  expect(overlaps(exteriorBoxes[0], exteriorBoxes[1])).toBe(false);

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
  test.setTimeout(90_000);
  const clockStart = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1_000));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await test.step('load the real vehicle model', async () => {
    await page.goto('/xiaomi-su7-interactive/');
    await expect.poll(
      async () => (await readDiagnostics(page)).modelReady,
      { timeout: 30_000 },
    ).toBe(true);
  });

  const openingMagnitude = await test.step('advance to a partially open door state', async () => {
    await activatePublicButton(page.getByRole('button', { name: '进入座舱' }));
    await activatePublicButton(page.getByRole('button', { name: '副驾', exact: true }));
    await page.clock.fastForward(16);
    await page.clock.fastForward(120);
    const openingSample = await readDiagnostics(page);
    const magnitude = Math.abs(openingSample.doorAngles.frontLeft ?? 0);
    expect(magnitude).toBeGreaterThan(0.1);
    expect(magnitude).toBeLessThan(0.9);
    return magnitude;
  });

  await test.step('reverse from the current angle while retaining the passenger view', async () => {
    const closeDoor = page.getByRole('button', { name: '关门' });
    await closeDoor.evaluate((button: HTMLButtonElement) => button.click());
    await page.clock.fastForward(16);
    await page.clock.fastForward(48);
    const firstClosingSample = await readDiagnostics(page);
    const closingMagnitude = Math.abs(firstClosingSample.doorAngles.frontLeft ?? 0);
    expect(closingMagnitude).toBeLessThan(openingMagnitude);
    expect(closingMagnitude).toBeGreaterThan(0.1);
    expect(firstClosingSample.camera?.view).toBe('passenger');
  });

  await test.step('settle every door closed while retaining the passenger view', async () => {
    await page.clock.fastForward(400);
    const settled = await readDiagnostics(page);
    expect({
      closed: Object.values(settled.doorAngles)
        .every((angle) => angle !== null && Math.abs(angle) < 0.01),
      seatView: settled.camera?.view,
    }).toEqual({ closed: true, seatView: 'passenger' });
  });
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

  const lavaOrange = page.getByRole('button', { name: '熔岩橙' });
  await lavaOrange.click();
  await expect.poll(async () => (await readDiagnostics(page)).paint).toBe('c84a20');

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
  expect((await readDiagnostics(page)).camera?.view).toBe('performance');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await expect.poll(async () => {
    const camera = (await readDiagnostics(page)).camera;
    return { view: camera?.view, movedOutside: (camera?.position[0] ?? 0) > 2 };
  }, { timeout: 15_000 }).toEqual({ view: 'performance', movedOutside: true });
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

  for (const view of ['aero', 'performance', 'cabin'] as const) {
    await scrollStoryTo(page, view);
    await expect.poll(async () => {
      const state = await readDiagnostics(page);
      return { activeStoryId: state.activeStoryId, cameraView: state.camera?.view };
    }).toEqual({ activeStoryId: view, cameraView: view === 'cabin' ? 'rear' : view });
    await expect(page.locator(`[data-story-section="${view}"] .story-copy`)).toBeInViewport();
  }

  const cameraBeforeDrag = JSON.stringify((await readDiagnostics(page)).camera?.position);
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.vehicle-canvas');
    canvas?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 700, bubbles: true }));
    canvas?.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 560, bubbles: true }));
    canvas?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 560, bubbles: true }));
  });
  await expect.poll(async () => JSON.stringify((await readDiagnostics(page)).camera?.position)).not.toBe(cameraBeforeDrag);

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
      const heroCopy = page.locator('.hero-copy');
      const heroActions = page.locator('.hero-actions');
      const focusZone = page.locator('[data-vehicle-focus-zone]');
      const occupiedBoxes = await Promise.all([heroCopy, heroActions, controls, focusZone].map(requiredBox));
      const controlsBox = occupiedBoxes[2];
      const focusBox = occupiedBoxes[3];
      expect(
        controlsBox.y + controlsBox.height,
        JSON.stringify({ viewport, controlsBox }),
      ).toBeLessThanOrEqual(viewport.height * 0.7);
      expect(overlaps(controlsBox, focusBox), JSON.stringify({ viewport, controlsBox, focusBox })).toBe(false);
      const swatches = page.locator('.vehicle-controls .color-swatch');
      await expect(swatches).toHaveCount(13);
      for (const swatch of await swatches.all()) {
        const semantics = await swatch.evaluate((button) => ({
          text: button.textContent?.trim(),
          label: button.getAttribute('aria-label'),
          tooltip: button.getAttribute('data-tooltip'),
        }));
        expect(semantics.text).toBe('');
        expect(semantics.tooltip).toBe(semantics.label);
      }
      await expect(page).toHaveScreenshot(`hero-${viewport.width}x${viewport.height}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.035,
        timeout: 30_000,
      });
    }

    if (viewport.width === 390) {
      const ctaBox = await cta.boundingBox();
      const cabinCtaBox = await cabinCta.boundingBox();
      const canvasBox = await page.locator('canvas.vehicle-canvas').boundingBox();
      const specsBox = await specs.boundingBox();
      const controlsBox = await controls.boundingBox();
      expect(ctaBox && cabinCtaBox && canvasBox && specsBox && controlsBox).toBeTruthy();
      if (ctaBox && cabinCtaBox && canvasBox && specsBox && controlsBox) {
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

test('visual story aero keeps the vehicle and story copy composed', async ({ page }) => {
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
  await expect(page.locator('[data-story-section="aero"] .story-copy')).toBeInViewport();
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
    position: [-0.38, 1.28, 0.02],
    near: 0.15,
  });

  const seats = [
    {
      key: 'passenger', label: '副驾', title: '副驾交互空间', position: [0.28, 1.27, 0.05],
      readableRegion: [0.05, 0.42, 0.71, 0.44], minMedian: 35, maxDarkRatio: 0.29, maxHighlightRatio: 0.04,
      glareRegion: [0.27, 0.12, 0.15, 0.16],
    },
    {
      key: 'rear', label: '后排', title: '后排空间关系', position: [0, 1.32, 1.55],
      readableRegion: [0.08, 0.34, 0.64, 0.54], minMedian: 20, maxDarkRatio: 0.45, maxHighlightRatio: 0.04,
      glareRegion: [0.27, 0.12, 0.15, 0.16],
    },
    {
      key: 'driver', label: '主驾', title: '主驾沉浸视野', position: [-0.38, 1.28, 0.02],
      readableRegion: [0.08, 0.42, 0.76, 0.42], minMedian: 35, maxDarkRatio: 0.45, maxHighlightRatio: 0.04,
      glareRegion: [0.27, 0.12, 0.15, 0.16],
    },
  ] as const;
  for (const seat of seats) {
    const button = page.getByRole('button', { name: seat.label, exact: true });
    const revisionBeforeClick = (await readDiagnostics(page)).renderRevision;
    await button.click();
    await expectRenderedCamera(page, revisionBeforeClick, {
      view: seat.key,
      position: seat.position,
      near: 0.15,
    });
    const diagnostics = await readDiagnostics(page);
    expect(Object.values(diagnostics.doorAngles).every((angle) => Number.isFinite(angle))).toBe(true);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const card = page.locator('.cabin-detail');
    await expect(card.getByRole('heading', { name: seat.title })).toBeVisible();
    await expect(card.locator('li')).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) await expect(card.locator('li').nth(index)).toBeVisible();
    const cardBox = await requiredBox(card);
    for (const swatch of await page.locator('.vehicle-controls .color-swatch:visible').all()) {
      const swatchBox = await requiredBox(swatch);
      expect(overlaps(cardBox, swatchBox), `${seat.key}: ${await swatch.getAttribute('aria-label') ?? ''}`).toBe(false);
      expect(await swatch.getAttribute('data-tooltip')).toBe(await swatch.getAttribute('aria-label'));
    }
    const readable = await readCanvasLuminance(page, seat.readableRegion);
    expect(readable.median, `${seat.key} readable-region luminance ${JSON.stringify(readable)}`)
      .toBeGreaterThanOrEqual(seat.minMedian);
    expect(readable.darkRatio, `${seat.key} readable-region black crush ${JSON.stringify(readable)}`)
      .toBeLessThanOrEqual(seat.maxDarkRatio);
    const glare = await readCanvasLuminance(page, seat.glareRegion);
    expect(glare.highlightRatio, `${seat.key} upper-cabin highlight ${JSON.stringify(glare)}`)
      .toBeLessThanOrEqual(seat.maxHighlightRatio);
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

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`active story copy stays outside the vehicle focus zone at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/xiaomi-su7-interactive/');
    await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

    for (const storyId of ['aero', 'performance', 'cabin']) {
      await scrollStoryTo(page, storyId);
      const copy = page.locator(`[data-story-section="${storyId}"] .story-copy`);
      const focusZone = page.locator('[data-vehicle-focus-zone]');
      const [copyBox, focusBox] = await Promise.all([requiredBox(copy), requiredBox(focusZone)]);
      expect(overlaps(copyBox, focusBox), JSON.stringify({ viewport, storyId, copyBox, focusBox })).toBe(false);
    }
  });
}

test('vehicle stage exits before technology and restores with the correct story on upward scroll', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  await page.locator('#technology').scrollIntoViewIfNeeded();
  const visual = page.locator('.vehicle-visual');
  await expect(visual).toHaveAttribute('data-stage-visibility', 'hidden');
  await expect(visual).toHaveCSS('pointer-events', 'none');
  await expect(visual).toHaveCSS('opacity', '0');

  await scrollStoryTo(page, 'performance');
  await expect(visual).toHaveAttribute('data-stage-visibility', /visible|fading/);
  await expect.poll(async () => (await readDiagnostics(page)).activeStoryId).toBe('performance');
});

test('reduced motion keeps scroll chapters and target camera active with immediate transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  await expect.poll(async () => (await readDiagnostics(page)).modelReady, { timeout: 30_000 }).toBe(true);

  await scrollStoryTo(page, 'cabin');

  await expect.poll(async () => {
    const state = await readDiagnostics(page);
    return { activeStoryId: state.activeStoryId, view: state.camera?.view, fov: state.camera?.fov };
  }).toEqual({ activeStoryId: 'cabin', view: 'rear', fov: 52 });
});


test('floating controls and guidance stay clear at target responsive viewports', async ({ page }) => {
  test.setTimeout(120_000);
  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 600 },
    { width: 900, height: 700 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ];

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/xiaomi-su7-interactive/');
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const controls = page.locator('.vehicle-controls');
    const hint = page.locator('[data-view-hint]');
    const heroCopy = page.locator('.hero-copy');
    const focusZone = page.locator('[data-vehicle-focus-zone]');
    for (const locator of [controls, hint]) await expectFullyInViewport(locator, viewport);
    const [controlsBox, hintBox, copyBox, focusBox] = await Promise.all(
      [controls, hint, heroCopy, focusZone].map(requiredBox),
    );
    for (const [name, floatingBox] of [['controls', controlsBox], ['hint', hintBox]] as const) {
      expect(overlaps(floatingBox, copyBox), JSON.stringify({ viewport, name, floatingBox, copyBox })).toBe(false);
      expect(overlaps(floatingBox, focusBox), JSON.stringify({ viewport, name, floatingBox, focusBox })).toBe(false);
    }
    expect(overlaps(controlsBox, hintBox), JSON.stringify({ viewport, controlsBox, hintBox })).toBe(false);
  }
});
