import { expect, test } from '@playwright/test';
test.setTimeout(45_000);
for (const width of [390, 1280]) {
  test(`payments offer an agent test purchase without storefront navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/gateway/crosschain/config', (r) =>
      r.fulfill({ json: { configured: true } }),
    );
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('region', { name: 'Developer Pack purchase tracker' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'See a purchase', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Illustrative purchase walkthrough' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Try your first purchase' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Copy purchase instruction' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Store', exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Accept payments', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Visit our store', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Ethereum Sepolia', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
