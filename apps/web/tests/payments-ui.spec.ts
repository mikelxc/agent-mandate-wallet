import { expect, test } from '@playwright/test';
test.setTimeout(45_000);
for (const width of [390, 1280]) {
  test(`public merchant design and demo at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const privateRequests: string[] = [];
    page.on('request', (request) => {
      if (
        /\/gateway\/(operations|crosschain|merchant\/purchases)/.test(
          request.url(),
        )
      )
        privateRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/payments', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', {
        name: 'Your next customer has an AI agent.',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Requests & activity', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Developer Pack purchase tracker' }),
    ).toHaveCount(0);
    await page
      .getByRole('link', { name: 'Try the Developer Pack demo ↗' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'We’re our first merchant.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Copy agent prompt' }).click();
    await expect(page.getByRole('status')).toContainText('Copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      'Wayleave Developer Pack',
    );
    await page.getByRole('link', { name: 'Accept agent payments →' }).click();
    await expect(
      page.getByRole('heading', { name: 'Built for agent checkout.' }),
    ).toBeVisible();
    expect(privateRequests).toEqual([]);
    await expect(
      page.getByRole('combobox', { name: 'Wallet network' }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`payments-${width}.png`),
      fullPage: true,
    });
  });
}
