import { expect, test } from '@playwright/test';
test.setTimeout(45_000);
test.use({ reducedMotion: 'reduce' });
for (const width of [320, 1280]) {
  test(`onboarding teaches permissions before setup at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/gateway/') && r.method() !== 'GET')
        writes.push(r.url());
    });
    await page.goto('/?setup=1');
    await page.getByRole('button', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(/setup=2/);
    await expect(
      page.getByRole('heading', { name: 'How your agent spends.' }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Go to step 3: Name your wallet',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', { name: 'Review how your agent spends' }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Agent wallet name', { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Review how your agent spends' })
      .click();
    await page
      .getByRole('button', { name: 'I understand. Name my wallet' })
      .click();
    await expect(page).toHaveURL(/setup=3/);
    await expect(
      page.getByRole('heading', {
        name: 'Name your agent’s wallet',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Connect your wallet', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Review how your agent spends' }),
    ).toHaveCount(0);
    const stages = [
      'Connect',
      'How it works',
      'Name your wallet',
      'Add a chain',
      'Connect your agent',
      'Try a purchase',
    ];
    for (let i = 0; i < stages.length; i++) {
      await page
        .getByRole('button', {
          name: `Go to step ${i + 1}: ${stages[i]}`,
          exact: true,
        })
        .click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await expect(page.getByText('OPTIONAL · AFTER SETUP')).toBeVisible();
    await expect(
      page
        .locator('.arc-onboarding aside')
        .getByText('Verified', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .locator('.arc-onboarding aside')
        .getByText('Not yet verified', { exact: true }),
    ).toHaveCount(4);
    expect(writes).toEqual([]);
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
  await page.getByLabel('Wallet name', { exact: true }).fill('research-desk');
  await expect(
    page.getByRole('button', { name: 'Create wallet on Arc Testnet' }),
  ).toBeDisabled();
  await expect(
    page.getByText('You’ll confirm with test USDC on Arc.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Create.*Sepolia/ }),
  ).toHaveCount(0);
});
