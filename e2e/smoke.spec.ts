import { test, expect } from '@playwright/test';

test('app loads (smoke)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Basic sanity check: app rendered something
  await expect(page.locator('body')).toBeVisible();

  // Fail the test if obvious JS errors occurred during initial load.
  // (This catches broken imports, runtime exceptions, etc.)
  expect(consoleErrors, `Console errors detected:\n${consoleErrors.join('\n')}`).toEqual([]);
});
