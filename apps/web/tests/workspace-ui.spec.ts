import { expect, test } from '@playwright/test';

test.setTimeout(30_000);
for (const width of [320, 390, 1280]) {
  test(`spending dashboard and optional setup at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Let your agents do their thing.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Connect your wallet.' }),
    ).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'Activity', exact: true }),
    ).toBeHidden();
    const connectBounds = await page
      .getByRole('button', { name: 'Get started', exact: true })
      .boundingBox();
    expect(connectBounds).not.toBeNull();
    expect(connectBounds!.y + connectBounds!.height).toBeLessThan(740);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Get started', exact: true })
      .click();
    await expect(page).toHaveURL(/\/wallets\/setup$/);
    await expect(page.getByRole('heading', { name: 'Your agent, on two networks.' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Wallet minting steps' }).getByRole('button')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Create wallet on Sepolia', exact: true })).toBeDisabled();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Let your agents do their thing.' }),
    ).toBeVisible();
    await page.goto('/?setup=1', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Connect your wallet.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('wallet access does not expose developer payment controls', async ({
  page,
}) => {
  await page.goto('/accounts');
  await expect(
    page.getByRole('heading', { name: 'Wallet access' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create account + approve allowance' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Sign + send payment' }),
  ).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`WalletConnect picker opens without an injected wallet at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('@appkit/active_caip_network_id', 'eip155:5042002');
    });
    let authRequests = 0;
    await page.route('**/gateway/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/gateway/auth/session')
        return route.fulfill({ status: 401, json: { error: 'Sign in' } });
      if (path === '/gateway/auth/siwe/nonce') {
        const origin = new URL(route.request().url()).origin;
        return route.fulfill({
          json: {
            nonce: 'a'.repeat(64),
            domain: new URL(origin).host,
            uri: origin,
            statement:
              'Sign in to Wayleave. This grants no spending authority.',
            issuedAt: new Date().toISOString(),
            expirationTime: new Date(Date.now() + 300_000).toISOString(),
          },
        });
      }
      if (path.includes('/verify')) authRequests++;
      return route.fulfill({ json: { ok: true } });
    });
    await page.route('**/gateway/auth/challenge', (route) => {
      authRequests++;
      return route.abort();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem('@appkit/active_caip_network_id'),
        ),
      )
      .toBe('eip155:11155111');
    const modal = page.locator('w3m-modal');
    await expect(
      modal.getByText('Connect Wallet', { exact: true }),
    ).toBeVisible();
    await expect(
      modal.getByText('WalletConnect', { exact: true }),
    ).toBeVisible();
    await modal.getByText('WalletConnect', { exact: true }).click();
    await expect(modal.locator('wui-qr-code')).toBeVisible({ timeout: 20_000 });
    expect(authRequests).toBe(0);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Connect wallet' }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await expect(
      modal.getByText('Connect Wallet', { exact: true }),
    ).toBeVisible();
    expect(authRequests).toBe(0);
  });
}

for (const width of [390, 1280]) {
  test(`developer tools keep simulation and account controls distinct at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/advanced');
    await expect(
      page.getByRole('heading', { name: 'Policy playground', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Sepolia wallet', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Sepolia account', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create account + approve allowance' }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
