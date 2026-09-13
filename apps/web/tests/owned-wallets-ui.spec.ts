import { expect, test } from '@playwright/test';

test('wallet settings show the multichain inventory without a route filter', async ({
  page,
}) => {
  await page.route('**/gateway/**', (route) =>
    route.fulfill({ status: 401, json: { error: 'Sign in' } }),
  );
  await page.goto('/accounts', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText(
      'Connect your wallet to see its ownership NFTs across Sepolia and Arc.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Wallet network' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Your agent wallets' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Create new wallet' }),
  ).toHaveAttribute('href', '/accounts/new');
  await expect(
    page.getByRole('button', { name: 'Refresh wallets' }),
  ).toBeDisabled();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: '/private/tmp/wayleave-accounts-' + width + '.png',
      fullPage: true,
    });
  }
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(
    nav.getByRole('link', { name: 'Spending', exact: true }),
  ).toHaveAttribute('href', '/spending');
  await expect(
    nav.getByRole('link', { name: 'Payments', exact: true }),
  ).toHaveAttribute('href', '/payments');
  await expect(
    nav.getByRole('link', { name: 'Wallets', exact: true }),
  ).toHaveAttribute('href', '/accounts');
});
