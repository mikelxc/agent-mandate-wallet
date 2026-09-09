import { expect, test } from '@playwright/test';

test.setTimeout(30_000);
for (const width of [320, 390, 1280]) {
  test(`real account home and dismissible setup at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Prove it’s yours.' }),
    ).toBeVisible();
    await expect(
      page.getByText('Run example journey', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Skip setup' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your accounts & requests.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Your accounts & requests.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Prove it’s yours.' }),
    ).toBeHidden();
    await page.getByRole('button', { name: 'Open walkthrough' }).click();
    await expect(
      page.getByRole('heading', { name: 'Prove it’s yours.' }),
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

test('accounts route restores the same wallet-first entry', async ({
  page,
}) => {
  await page.goto('/accounts');
  await expect(
    page.getByRole('heading', { name: 'Prove it’s yours.' }),
  ).toBeVisible();
  await expect(page.getByText('Create a passkey', { exact: true })).toHaveCount(
    0,
  );
});
