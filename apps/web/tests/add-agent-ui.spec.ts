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
    await page.route('**/gateway/auth/session', (route) =>
      route.fulfill({ status: 401, json: { error: 'Sign in' } }),
    );
    await page.goto('/agents/new');
    await expect(
      page.getByRole('heading', { name: 'Add an agent', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('ENS name', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Onboarding steps' }),
    ).toHaveCount(0);
    await page.goto('/accounts/new');
    await expect(page).toHaveURL(/\/accounts\/new$/);
    await expect(
      page.getByRole('heading', { name: 'Sign in to create a wallet' }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Agent wallet name', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Connect.*wallet/i }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
