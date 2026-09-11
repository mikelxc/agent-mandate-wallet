import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });
test('network selection opens the matching payment flow and preserves it on reload', async ({page}) => {
  await page.route('**/gateway/crosschain/config', route => route.fulfill({json:{configured:false,chainId:5042002,destinationChainId:11155111}}));
  await page.goto('/identity');
  const network = page.getByLabel('Payment network', {exact:true});
  await expect(network).toHaveValue('Sepolia');
  await expect(network.locator('option')).toHaveText(['Sepolia', 'Arc Testnet']);
  await network.selectOption('Arc');
  await expect(page).toHaveURL(/\/crosschain$/);
  await expect(page.getByRole('heading', {name:'Pay across chains'})).toBeVisible();
  await page.reload();
  await expect(network).toHaveValue('Arc');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await network.selectOption('Sepolia');
  await expect(page).toHaveURL(/\/$/);
  await expect(network).toHaveValue('Sepolia');
});
test('portable identity starts with a name and keeps discovery separate from authentication', async ({ page }) => {
  await page.route('**/gateway/identity/discover?**', route => route.fulfill({json:{error:'Name not found on the selected deployment'},status:400}));
  await page.goto('/identity');
  await expect(page.getByRole('heading', {name:'Start with your ENS name.'})).toBeVisible();
  await page.getByLabel('ENSv2 name').fill('missing.eth');
  await page.getByRole('button', {name:'Find identity'}).click();
  await expect(page.getByRole('alert').filter({hasText:'Name not found'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Review account association'})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('unconfigured Arc does not present payment execution as available', async ({page}) => {
  await page.route('**/gateway/crosschain/config', route => route.fulfill({json:{configured:false,chainId:5042002,destinationChainId:11155111}}));
  await page.goto('/crosschain');
  await expect(page.getByRole('heading', {name:'Pay across chains'})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('not configured');
  await expect(page.getByLabel('Arc NFAT account')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
