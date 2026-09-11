import { expect, test } from '@playwright/test';

test('用户可在 Pages 子路径浏览车辆并操作车门与座舱', async ({ page }) => {
  test.setTimeout(60_000);
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
  await expect(page).toHaveURL(/\/xiaomi-su7-interactive\/$/);

  await expect(page.getByRole('heading', { level: 1, name: /Xiaomi\s*SU7/ })).toBeVisible();
  await expect(page.getByRole('region', { name: '小米 SU7 交互车辆舞台' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '外观' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '座舱' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '技术驱动，每一次出发' })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回车辆舞台' })).toBeVisible();

  const gulfBlue = page.getByRole('button', { name: '海湾蓝' });
  await gulfBlue.click();
  await expect(gulfBlue).toHaveAttribute('aria-pressed', 'true');

  const doorButton = page.getByRole('button', { name: '开门' });
  await doorButton.click();
  await expect(page.getByRole('button', { name: '关门' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('tab', { name: '座舱' }).click();
  await expect(page.getByRole('tab', { name: '座舱' })).toHaveAttribute('aria-selected', 'true');
  for (const seat of ['主驾', '副驾', '后排']) {
    const seatButton = page.getByRole('button', { name: seat });
    await seatButton.click();
    await expect(seatButton).toHaveAttribute('aria-pressed', 'true');
  }

  await page.getByRole('tab', { name: '外观' }).click();
  await expect(page.getByRole('tab', { name: '外观' })).toHaveAttribute('aria-selected', 'true');

  const canvas = page.locator('canvas.vehicle-canvas');
  await expect(canvas).toBeVisible();
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, clientX: 700 });
  await canvas.dispatchEvent('pointermove', { pointerId: 1, clientX: 560 });
  await canvas.dispatchEvent('pointerup', { pointerId: 1, clientX: 560 });

  for (const view of ['aero', 'performance', 'cabin', 'sensing']) {
    await page.evaluate((targetView) => {
      document.documentElement.style.scrollBehavior = 'auto';
      const section = document.querySelector<HTMLElement>(`[data-story-view="${targetView}"]`);
      if (!section) throw new Error(`Missing story section: ${targetView}`);
      window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top);
    }, view);
    await expect(page.locator(`[data-story-view="${view}"]`)).toBeInViewport();
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
  test(`首屏在 ${viewport.width}x${viewport.height} 保持完整构图`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/xiaomi-su7-interactive/');
    await expect(page.getByRole('heading', { level: 1, name: /Xiaomi\s*SU7/ })).toBeInViewport();
    await expect(page.getByRole('link', { name: '探索核心科技' })).toBeInViewport();
    await expect(page.locator('.hero-specs')).toBeInViewport();
    await expect(page.locator('.vehicle-controls')).toBeInViewport();
  });
}
