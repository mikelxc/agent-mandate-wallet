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
    page.getByRole('heading', { name: 'Wallet access' }),
  ).toBeVisible();
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
