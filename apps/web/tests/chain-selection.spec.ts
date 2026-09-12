import { expect, test } from '@playwright/test';

test('network selectors show Sepolia and an unavailable Mainnet option', async ({ page }) => {
  await page.route('**/gateway/**', route => route.fulfill({ status: 401, json: { error: 'Sign in' } }));
  await page.goto('/identity');
  const selector = page.getByLabel('Payment network', { exact: true });
  await expect(selector).toContainText('Sepolia');
  await expect(selector).not.toContainText('ENSv2');
  await selector.click();
  const mainnet = page.getByRole('option', { name: /Mainnet — coming soon/ });
  await expect(mainnet).toBeVisible();
  await expect(mainnet).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(selector).toContainText('Sepolia');
  await expect(page).toHaveURL(/\/identity$/);
});
