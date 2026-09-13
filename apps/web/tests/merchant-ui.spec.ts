import { expect, test } from '@playwright/test';
const offering = {
  id: 'wayleave-developer-pack',
  title: 'Wayleave Developer Pack',
  price: '100000',
  maxTransferFee: '1000',
  available: true,
};
test.setTimeout(45_000);
for (const width of [390, 1280]) {
  test(`final step links the public store and tracks a real purchase at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/gateway/') && r.method() !== 'GET')
        writes.push(r.url());
    });
    await page.route('**/gateway/merchant/offerings', (r) =>
      r.fulfill({ json: { offerings: [offering] } }),
    );
    await page.goto('/?setup=1', { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'Go to step 5: First purchase' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Make your first purchase.' }),
    ).toBeVisible();
    await expect(page.locator('.first-purchase-instruction')).toContainText(
      'Visit https://www.wayleave.xyz/store/developer-pack',
    );
    const tracker = page.getByRole('region', {
      name: 'Developer Pack purchase tracker',
    });
    await expect(
      tracker.getByText('Waiting for your agent', { exact: true }),
    ).toBeVisible();
    await expect(tracker.locator('.purchase-tracker-price')).toContainText(
      '0.10',
    );
    await expect(
      tracker.getByRole('button', { name: 'Check purchase' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('region', { name: 'Wayleave Developer Pack checkout' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: /Approve in demo|Show example receipt|Play payment/,
      }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/wayleave-purchase-production-style-${width}.png`,
      fullPage: true,
    });
  });
}
test('store and agent guide are publicly readable without owner authentication', async ({
  page,
  request,
}) => {
  const html = await request.get('/store/developer-pack');
  expect(html.ok()).toBe(true);
  expect(await html.text()).toContain('Purchasing instructions for agents');
  const guide = await request.get('/store/developer-pack/agent');
  expect(guide.ok()).toBe(true);
  expect(guide.headers()['content-type']).toContain('text/plain');
  expect(await guide.text()).toContain('request_purchase');
  await page.route('**/gateway/merchant/offerings', (r) =>
    r.fulfill({ json: { offerings: [offering] } }),
  );
  await page.goto('/store/developer-pack', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Payment terms' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Developer Pack purchase tracker' }),
  ).toHaveCount(0);
});
test('unconfigured merchant does not present checkout as ready', async ({
  page,
}) => {
  await page.route('**/gateway/merchant/offerings', (r) =>
    r.fulfill({ json: { offerings: [{ ...offering, available: false }] } }),
  );
  await page.goto('/store/developer-pack', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('Checkout is not configured yet.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copy purchase instruction' }),
  ).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`store heading and checkout fit without overlap at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/gateway/merchant/offerings', (r) =>
      r.fulfill({ json: { offerings: [offering] } }),
    );
    await page.goto('/store/developer-pack', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Payment terms' }),
    ).toBeVisible();
    const heading = await page
      .locator('.developer-store-heading')
      .boundingBox();
    const contents = await page.locator('.developer-store-grid').boundingBox();
    const navigation = await page.locator('.app-header').boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(
      navigation!.y + navigation!.height,
    );
    expect(contents!.y).toBeGreaterThan(heading!.y + heading!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/wayleave-store-${width}.png`,
      fullPage: true,
    });
  });
}

test('an agent can read the storefront with JavaScript disabled', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/store/developer-pack`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { name: 'Wayleave Developer Pack' }),
    ).toBeVisible();

    await expect(
      page.locator('details').getByText('Offering ID:', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Read the plain-text purchase guide' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
