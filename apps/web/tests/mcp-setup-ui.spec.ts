import { test, expect } from '@playwright/test';
for (const width of [390, 1280]) {
  test(`MCP setup retains its two illustrated selectors at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?setup=4');
    await expect(page.locator('.arc-onboarding')).toHaveAttribute(
      'data-step',
      '4',
    );
    const setup = page.locator('.mcp-setup-options:visible');
    await expect(setup.locator('fieldset')).toHaveCount(2);
    await expect(
      setup.getByRole('group', { name: 'Agent client' }).locator('img'),
    ).toHaveCount(4);
    for (const image of await setup.locator('img').all())
      expect(
        await image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      ).toBe(true);
    await setup.getByText('Show MCP settings', { exact: true }).click();
    await expect(setup.locator('pre').first()).toContainText('command = "npx"');
    await expect(setup.locator('pre').first()).toContainText(
      'wayleave-mcp@0.1.3',
    );
    await expect(setup.locator('pre').first()).not.toContainText('checkout');
    await setup.getByRole('button', { name: 'bunx Bun', exact: true }).click();
    await expect(setup.locator('pre').first()).toContainText(
      'command = "bunx"',
    );
    await setup
      .getByRole('button', { name: 'Hosted HTTP No install', exact: true })
      .click();
    await expect(setup.locator('pre').first()).toContainText('/mcp');
    await expect(setup.locator('pre').first()).not.toContainText('command');
    await setup
      .getByText('Ask an agent to help you set up', { exact: true })
      .click();
    await setup.getByRole('button', { name: 'Copy setup prompt' }).click();
    await expect(setup.locator('pre').last()).toContainText(
      'exact manual steps',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/private/tmp/wayleave-mcp-restored-${width}.png`,
      fullPage: true,
    });
  });
}
test('setup links, navigation, reload and browser back retain the requested step', async ({
  page,
}) => {
  await page.goto('/?setup=4&source=regression');
  await expect(page.locator('.arc-onboarding')).toHaveAttribute(
    'data-step',
    '4',
  );
  await page
    .getByRole('button', { name: 'Go to step 2: ENS identity', exact: true })
    .click();
  await expect(page).toHaveURL(/setup=2&source=regression/);
  await page.reload();
  await expect(page.locator('.arc-onboarding')).toHaveAttribute(
    'data-step',
    '2',
  );
  await page.goBack();
  await expect(page.locator('.arc-onboarding')).toHaveAttribute(
    'data-step',
    '4',
  );
  for (const step of [1, 3, 5]) {
    await page.goto(`/?setup=${step}`);
    await expect(page.locator('.arc-onboarding')).toHaveAttribute(
      'data-step',
      String(step),
    );
  }
});
