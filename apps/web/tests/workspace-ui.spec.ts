import { expect, test } from '@playwright/test';

test.setTimeout(30_000);
for (const width of [320, 390, 1280]) {
  test(`real account home and dismissible setup at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Try Wayleave.' }),
    ).toBeVisible();
    await expect(
      page.getByText('Run example journey', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'View dashboard' }),
    ).toBeVisible();
    const connectBounds = await page
      .getByRole('button', { name: 'Connect wallet', exact: true })
      .boundingBox();
    expect(connectBounds).not.toBeNull();
    expect(connectBounds!.y + connectBounds!.height).toBeLessThan(740);
    await page.getByRole('button', { name: 'View dashboard' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your agents.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Your agents.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Try Wayleave.' }),
    ).toBeHidden();
    await page.getByRole('button', { name: 'Set up an agent' }).click();
    await expect(
      page.getByRole('heading', { name: 'Try Wayleave.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (process.env.MANDATE_CAPTURE_UI === 'true')
      await page.screenshot({
        path: `/private/tmp/wayleave-restored-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
  });
}

test('account settings are separate and collapsed by default', async ({
  page,
}) => {
  await page.goto('/accounts');
  await expect(
    page.getByRole('heading', { name: 'Your account.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create account + approve allowance' }),
  ).toBeHidden();
  await page.getByText('Funding & account settings', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Create account + approve allowance' }),
  ).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`WalletConnect picker opens without an injected wallet at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
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
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect wallet' }).click();
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
