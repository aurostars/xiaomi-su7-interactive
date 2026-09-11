import { expect, test } from '@playwright/test';

test('用户可在 Pages 子路径浏览车辆并操作车门与座舱', async ({ page }) => {
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

  const doorButton = page.getByRole('button', { name: '开门' });
  await doorButton.click();
  await expect(page.getByRole('button', { name: '关门' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('tab', { name: '座舱' }).click();
  await expect(page.getByRole('tab', { name: '座舱' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '主驾' })).toBeVisible();
  await expect(page.getByRole('button', { name: '副驾' })).toBeVisible();
  await expect(page.getByRole('button', { name: '后排' })).toBeVisible();

  expect(failedResources).toEqual([]);
  expect(blockingConsoleErrors).toEqual([]);
});
