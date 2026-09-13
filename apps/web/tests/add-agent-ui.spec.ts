import { expect, test } from '@playwright/test';

test.setTimeout(45_000);

for (const width of [320, 1280]) {
  test(`add agent remains accessible without a wallet at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/gateway/') && request.method() !== 'GET')
        writes.push(request.url());
    });
    await page.goto('/agents/new');
    await expect(
      page.getByRole('heading', { name: 'Add an agent', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'I understand. Name my wallet' })
      .click();
    await expect(page).toHaveURL(/\/agents\/new\?setup=3$/);
    await expect(
      page.getByRole('button', { name: 'Connect your wallet', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/agents\/new\?setup=3$/);
    await expect(
      page.getByRole('heading', {
        name: 'Name your agent’s wallet',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Review how your agent spends' }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
}
