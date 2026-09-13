import { expect, test } from '@playwright/test';
test.setTimeout(45_000);
for (const width of [320, 1280]) {
  test(`dedicated creation pages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/gateway/crosschain/config', (r) =>
      r.fulfill({
        json: {
          configured: true,
          chainId: 5042002,
          registry: '0x1111111111111111111111111111111111111111',
          validator: '0x2222222222222222222222222222222222222222',
        },
      }),
    );
    await page.goto('/agents/new');
    await expect(
      page.getByRole('heading', { name: 'Add an agent', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('ENS name', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Onboarding steps' }),
    ).toHaveCount(0);
    await page.goto('/wallets/setup');
    await expect(page).toHaveURL(/\/wallets\/new$/);
    await page
      .getByLabel('Agent wallet name', { exact: true })
      .fill('new-wallet');
    await expect(
      page.getByRole('button', {
        name: 'Create wallet on Sepolia',
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole('button', { name: '2. Arc', exact: true }).click();
    await page.getByLabel('Wallet name', { exact: true }).fill('new-wallet');
    await expect(
      page.getByRole('button', {
        name: 'Create wallet on Arc Testnet',
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
