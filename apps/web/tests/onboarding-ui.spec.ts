import { expect, test } from '@playwright/test';

test.setTimeout(45_000);
for (const width of [320, 1280]) {
  test(`Arc setup keeps identity, wallet and purchase evidence separate at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/gateway/') && r.method() !== 'GET')
        writes.push(r.url());
    });
    await page.goto('/?setup=1');
    await expect(
      page.getByRole('heading', { name: 'Connect your wallet.' }),
    ).toBeVisible();
    const stages = [
      'Connect',
      'ENS identity',
      'Arc wallet',
      'Connect agent',
      'First purchase',
    ];
    for (let i = 0; i < stages.length; i++) {
      await page
        .getByRole('button', {
          name: `Go to step ${i + 1}: ${stages[i]}`,
          exact: true,
        })
        .click();
      if (i === 1) {
        await expect(page.getByLabel('ENS name')).toBeVisible();
        await expect(
          page.getByRole('link', {
            name: 'Register one in the ENS hackathon app',
          }),
        ).toBeVisible();
      }
      if (i === 2 || i === 3)
        await expect(
          page.getByText('Verify your ENS name in the identity step first.'),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await expect(
      page.getByRole('heading', { name: 'Make your first purchase.' }),
    ).toBeVisible();
    await expect(
      page.locator('.arc-onboarding aside').getByText('Verified', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.arc-onboarding aside').getByText('Not yet verified', { exact: true }),
    ).toHaveCount(4);
    expect(writes).toEqual([]);
    await page.screenshot({
      path: `/tmp/wayleave-arc-onboarding-${width}.png`,
      fullPage: true,
    });
  });
}
test('wallet page never offers Sepolia deployment or creates a wallet while disconnected', async ({
  page,
}) => {
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
  await page.goto('/accounts');
  await page.getByLabel('Wallet label', { exact: true }).fill('research-desk');
  await expect(
    page.getByRole('button', { name: 'Create wallet on Arc Testnet' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Creation uses native test USDC', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Create.*Sepolia/ }),
  ).toHaveCount(0);
});
