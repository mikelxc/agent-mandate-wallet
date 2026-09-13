import { expect, test } from '@playwright/test';
test.setTimeout(45000);
for (const width of [390, 1280]) {
  test(`chain-specific minting walkthrough at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/gateway/') && r.method() !== 'GET')
        writes.push(r.url());
    });
    await page.route('**/gateway/crosschain/config', (r) =>
      r.fulfill({
        json: {
          configured: true,
          chainId: 5042002,
          registry: '0x39cB47aA65594767d1e456bd329Aad849EC98345',
          validator: '0xe4cB1515BD7aC3D43f979392517EB35964A7b7cc',
        },
      }),
    );
    await page.goto('/wallets/setup', { waitUntil: 'domcontentloaded' });
    const sep = page.getByRole('region', { name: 'Sepolia wallet setup' });
    await expect(sep).toBeVisible();
    await expect(sep.getByText(/Minting also registers/)).toBeVisible();
    await expect(
      sep.getByRole('button', {
        name: 'Create wallet on Sepolia',
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole('button', { name: '2. Arc', exact: true }).click();
    const arc = page.getByRole('region', { name: 'Arc wallet setup' });
    await expect(arc).toBeVisible();
    await expect(sep).toBeHidden();
    await expect(
      arc.getByRole('button', {
        name: 'Create wallet on Arc Testnet',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.getByText('Both wallets are verified.')).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/wayleave-chain-wallets-${width}.png`,
      fullPage: true,
    });
  });
}
test('network selector restores Sepolia and Arc destinations', async ({
  page,
}) => {
  await page.goto('/payments');
  await page.getByRole('combobox', { name: 'Wallet network' }).click();
  await page.getByRole('option', { name: /Sepolia/ }).click();
  await expect(page).toHaveURL(/\/sepolia$/);
  await expect(
    page.getByRole('combobox', { name: 'Wallet network' }),
  ).toContainText('Sepolia');
  await page.getByRole('combobox', { name: 'Wallet network' }).click();
  await page.getByRole('option', { name: /Arc testnet/ }).click();
  await expect(page).toHaveURL(/\/payments$/);
});
