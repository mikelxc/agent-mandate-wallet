import { expect, test } from '@playwright/test';
test('wallet network navigation stays in wallet settings', async ({ page }) => {
  await page.route('**/gateway/**', route => route.fulfill({ status: 401, json: { error: 'Sign in' } }));
  await page.goto('/accounts');
  await expect(page.getByText('Connect your wallet to see its ownership NFTs across Sepolia and Arc.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Wallet network' }).click();
  await page.getByRole('option', { name: /^Sepolia/ }).click();
  await expect(page).toHaveURL(/\/accounts\?network=sepolia$/);
  await expect(page.getByRole('heading', { name: 'Wallet access' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Wallet network' }).click();
  await page.getByRole('option', { name: /Arc testnet/ }).click();
  await expect(page).toHaveURL(/\/accounts\?network=arc$/);
  await expect(page.getByRole('heading', { name: 'Wallet access' })).toBeVisible();
});
