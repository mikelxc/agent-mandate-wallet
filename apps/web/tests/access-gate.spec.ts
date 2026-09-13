import { expect, test } from '@playwright/test';
for (const path of [
  '/accounts',
  '/connect',
  '/spending',
  '/identity',
  '/advanced',
  '/accounts/new',
])
  test(`gate ${path}`, async ({ page }) => {
    await page.route('**/gateway/**', (r) =>
      r.fulfill({ status: 401, json: { error: 'Sign in' } }),
    );
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp('/\\?signin=1&returnTo='));
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(path);
    await expect(
      page.getByRole('heading', { name: 'Welcome back.', exact: true }),
    ).toBeVisible();
  });
test('landing, setup, payments and merchant remain public', async ({
  page,
}) => {
  await page.route('**/gateway/**', (r) =>
    r.fulfill({ status: 401, json: { error: 'Sign in' } }),
  );
  for (const path of ['/', '/?setup=1', '/payments', '/store/developer-pack']) {
    await page.goto(path);
    expect(new URL(page.url()).searchParams.has('signin')).toBe(false);
    await expect(
      page.getByRole('heading', { name: 'Welcome back.', exact: true }),
    ).toHaveCount(0);
  }
  await page.goto('/payments');
  await page
    .getByRole('button', { name: 'Accept payments', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Describe the purchase', exact: true }),
  ).toBeVisible();
});
test('forged session cookie never mounts private page', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: 'mandate_session', value: 'a'.repeat(64), url: baseURL! },
  ]);
  await page.route('**/gateway/auth/session', (r) =>
    r.fulfill({ status: 401, json: { error: 'Expired' } }),
  );
  await page.goto('/accounts');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your agent wallets', exact: true }),
  ).toHaveCount(0);
});

test('unknown pages use the shared recovery layout without requiring a wallet', async ({
  page,
}) => {
  for (const path of ['/missing-page', '/accounts/missing-page']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'A little off course.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to home' }),
    ).toHaveAttribute('href', '/');
  }
});
test('returning sign-in preserves the requested destination on desktop and mobile', async ({
  page,
}) => {
  await page.route('**/gateway/**', (r) =>
    r.fulfill({ status: 401, json: { error: 'Sign in' } }),
  );
  await page.goto('/?signin=1&returnTo=%2Faccounts');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Connect your wallet' }),
    ).toBeEnabled();
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/accounts');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
