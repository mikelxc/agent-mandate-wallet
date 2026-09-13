import { expect, test } from '@playwright/test';
test.setTimeout(45_000);
for (const width of [390, 1280]) {
  test(`adding a chain explains separate wallets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?setup=4');
    await expect(
      page.getByRole('heading', { name: 'Add another chain.' }),
    ).toBeVisible();
    const diagram = page.getByRole('complementary', {
      name: 'Add another chain explained',
    });
    await expect(diagram).toContainText(
      'Adding Arc does not move your Sepolia wallet or funds.',
    );
    await diagram.getByText('What happens to the ENS name?').click();
    await expect(diagram).toContainText(
      'That association does not change ENS records.',
    );
    await expect(
      page.getByRole('radio', { name: /Arc Testnet/ }),
    ).toBeChecked();
    await expect(
      page.getByRole('button', { name: /Create wallet on/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
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
